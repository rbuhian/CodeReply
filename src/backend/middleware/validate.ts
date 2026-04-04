/**
 * Validation Middleware
 * Express middleware for validating requests using Zod schemas
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { logger } from '../utils/logger';

/**
 * Validation target types
 */
export type ValidationType = 'body' | 'query' | 'params';

/**
 * Extended Request type with validated data
 */
export interface ValidatedRequest<T> extends Request {
  validated: T;
}

/**
 * Format Zod validation errors into a user-friendly structure
 */
function formatZodErrors(error: ZodError): {
  field: string;
  message: string;
}[] {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
    message: err.message,
  }));
}

/**
 * Middleware factory for validating requests using Zod schemas
 *
 * @param schema - Zod schema to validate against
 * @param target - Which part of the request to validate (body, query, or params)
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { validate } from '../middleware/validate';
 * import { SendMessageSchema } from '../validation/messageSchemas';
 *
 * router.post(
 *   '/messages',
 *   validate(SendMessageSchema, 'body'),
 *   async (req: ValidatedRequest<SendMessageInput>, res) => {
 *     // req.validated is now type-safe and validated!
 *     const { to, body, priority } = req.validated;
 *     // ...
 *   }
 * );
 * ```
 */
export function validate<T extends ZodSchema>(
  schema: T,
  target: ValidationType = 'body'
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Select the data to validate based on target
      const dataToValidate = req[target];

      // Validate the data using the provided schema
      const validated = await schema.parseAsync(dataToValidate);

      // Attach validated data to the request object
      (req as ValidatedRequest<z.infer<T>>).validated = validated;

      // Proceed to the next middleware
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);

        logger.warn('Validation failed', {
          target,
          errors,
          method: req.method,
          url: req.url,
          ip: req.ip,
        });

        res.status(400).json({
          error: 'Validation Error',
          message: 'The request contains invalid data',
          errors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Handle unexpected errors
      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        method: req.method,
        url: req.url,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during validation',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Middleware for validating multiple parts of a request
 *
 * @param schemas - Object mapping validation targets to schemas
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.patch(
 *   '/messages/:messageId',
 *   validateMultiple({
 *     params: z.object({ messageId: z.string().uuid() }),
 *     body: UpdateMessageSchema,
 *   }),
 *   async (req, res) => {
 *     const { messageId } = req.validated.params;
 *     const { action } = req.validated.body;
 *     // ...
 *   }
 * );
 * ```
 */
export function validateMultiple(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      } = {};

      // Validate each specified target
      if (schemas.body) {
        validated.body = await schemas.body.parseAsync(req.body);
      }

      if (schemas.query) {
        validated.query = await schemas.query.parseAsync(req.query);
      }

      if (schemas.params) {
        validated.params = await schemas.params.parseAsync(req.params);
      }

      // Attach all validated data to the request object
      (req as any).validated = validated;

      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);

        logger.warn('Multi-target validation failed', {
          errors,
          method: req.method,
          url: req.url,
          ip: req.ip,
        });

        res.status(400).json({
          error: 'Validation Error',
          message: 'The request contains invalid data',
          errors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Handle unexpected errors
      logger.error('Unexpected multi-target validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        method: req.method,
        url: req.url,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during validation',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Helper function to create UUID param validator
 * Commonly used for validating resource IDs in URL params
 *
 * @example
 * ```typescript
 * router.get(
 *   '/messages/:messageId',
 *   validate(uuidParams('messageId'), 'params'),
 *   async (req, res) => {
 *     const { messageId } = req.validated;
 *     // messageId is guaranteed to be a valid UUID
 *   }
 * );
 * ```
 */
export function uuidParams(...fields: string[]): ZodSchema {
  const shape: Record<string, z.ZodString> = {};

  fields.forEach((field) => {
    shape[field] = z.string().uuid(`${field} must be a valid UUID`);
  });

  return z.object(shape);
}

/**
 * Helper function to create common query parameter validators
 *
 * @param additionalFields - Additional schema fields to merge with pagination
 * @returns Zod schema with pagination and custom fields
 *
 * @example
 * ```typescript
 * const MyQuerySchema = paginationQuery({
 *   status: z.enum(['active', 'inactive']),
 *   search: z.string().optional(),
 * });
 * ```
 */
export function paginationQuery(
  additionalFields?: Record<string, z.ZodTypeAny>
): ZodSchema {
  const baseSchema = {
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    offset: z.coerce.number().int().min(0).optional().default(0),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  };

  if (additionalFields) {
    return z.object({ ...baseSchema, ...additionalFields });
  }

  return z.object(baseSchema);
}
