/**
 * Device Routes
 * API endpoints for device registration and management
 * Author: Bernadette (API Engineer)
 * Date: April 4, 2026
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validate, ValidatedRequest, uuidParams } from '../middleware/validate';
import {
  CreateRegistrationTokenSchema,
  RegisterDeviceSchema,
  DeviceQuerySchema,
  UpdateDeviceSchema,
  DeleteDeviceSchema,
  CreateRegistrationTokenInput,
  RegisterDeviceInput,
  DeviceQueryInput,
  UpdateDeviceInput,
  DeleteDeviceInput,
} from '../validation/deviceSchemas';
import {
  generateRegistrationToken,
  registerDevice,
  getDeviceQuota,
  listDevices,
  getDevice,
  updateDevice,
  deleteDevice,
  updateHeartbeat,
} from '../services/deviceService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /v1/devices/registration-token
 * Generate a one-time registration token for device enrollment
 *
 * Auth: Requires API key (subscriber authentication)
 * Permissions: device:create
 *
 * Request Body:
 * - label (optional): Human-readable label for tracking
 *
 * Response:
 * - token: Registration token (cr_reg_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX)
 * - tokenId: UUID of the token record
 * - expiresAt: ISO 8601 timestamp
 * - expiresIn: Seconds until expiration
 * - quota: Current device quota usage
 */
router.post(
  '/registration-token',
  authenticate,
  validate(CreateRegistrationTokenSchema, 'body'),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest & ValidatedRequest<CreateRegistrationTokenInput>;
    const { subscriber } = authenticatedReq;
    const { label } = authenticatedReq.validated;

    try {
      logger.info('Generating registration token', {
        subscriberId: subscriber.id,
        subscriberName: subscriber.name,
        label,
      });

      // Generate registration token
      const tokenData = await generateRegistrationToken(subscriber.id, label);

      // Get current quota status
      const quota = await getDeviceQuota(subscriber.id);

      res.status(201).json({
        success: true,
        data: {
          token: tokenData.token,
          tokenId: tokenData.tokenId,
          expiresAt: tokenData.expiresAt.toISOString(),
          expiresIn: tokenData.expiresIn,
          quota: {
            current: quota.current,
            maximum: quota.maximum,
            available: quota.available,
          },
        },
        message: 'Registration token generated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to generate registration token', {
        subscriberId: subscriber.id,
        error: errorMessage,
      });

      // Handle specific error cases
      if (errorMessage.includes('quota exceeded')) {
        res.status(403).json({
          error: 'Quota Exceeded',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate registration token',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/devices/register
 * Register a device using a registration token
 *
 * Auth: No authentication required (uses registration token)
 * Public endpoint for Android app during initial setup
 *
 * Request Body:
 * - registrationToken: Token from /registration-token endpoint
 * - deviceName: Human-readable device name
 * - simCarrier (optional): SIM carrier name
 * - simNumber (optional): SIM phone number (E.164 format)
 * - androidVersion (optional): Android OS version
 * - appVersion (optional): CodeReply app version
 *
 * Response:
 * - deviceId: UUID of the registered device
 * - deviceToken: JWT token for device authentication (WebSocket)
 * - subscriberId: UUID of the subscriber who owns this device
 * - deviceName: Confirmed device name
 */
router.post(
  '/register',
  validate(RegisterDeviceSchema, 'body'),
  async (req, res) => {
    const validatedReq = req as ValidatedRequest<RegisterDeviceInput>;
    const {
      registrationToken,
      deviceName,
      simCarrier,
      simNumber,
      androidVersion,
      appVersion,
    } = validatedReq.validated;

    try {

      logger.info('Device registration attempt', {
        deviceName,
        simCarrier,
        androidVersion,
        appVersion,
        ip: req.ip,
      });

      // Register the device
      const device = await registerDevice(registrationToken, {
        deviceName,
        simCarrier,
        simNumber,
        androidVersion,
        appVersion,
      });

      res.status(201).json({
        success: true,
        data: {
          deviceId: device.deviceId,
          deviceToken: device.deviceToken,
          subscriberId: device.subscriberId,
          deviceName: device.deviceName,
        },
        message: 'Device registered successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Device registration failed', {
        deviceName,
        error: errorMessage,
        ip: req.ip,
      });

      // Handle specific error cases
      if (
        errorMessage.includes('Invalid registration token') ||
        errorMessage.includes('already been used') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('revoked')
      ) {
        res.status(400).json({
          error: 'Invalid Token',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('quota exceeded')) {
        res.status(403).json({
          error: 'Quota Exceeded',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register device',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /v1/devices/quota
 * Get current device quota usage
 *
 * Auth: Requires API key (subscriber authentication)
 *
 * Response:
 * - current: Number of active devices
 * - maximum: Maximum allowed devices for plan
 * - available: Remaining device slots
 */
router.get('/quota', authenticate, async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { subscriber } = authenticatedReq;

  try {
    const quota = await getDeviceQuota(subscriber.id);

    res.json({
      success: true,
      data: quota,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get device quota', {
      subscriberId: subscriber.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve device quota',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /v1/devices
 * List all devices for the authenticated subscriber
 *
 * Auth: Requires API key (subscriber authentication)
 *
 * Query Parameters:
 * - status (optional): Filter by status (ONLINE, OFFLINE, DEGRADED, ALL)
 * - limit (optional): Number of results per page (default: 20, max: 100)
 * - offset (optional): Number of results to skip (default: 0)
 * - sortBy (optional): Sort field (created_at, name, last_heartbeat, status)
 * - sortOrder (optional): Sort order (asc, desc)
 *
 * Response:
 * - devices: Array of device objects
 * - total: Total number of devices
 * - limit: Results per page
 * - offset: Number of skipped results
 */
router.get(
  '/',
  authenticate,
  validate(DeviceQuerySchema, 'query'),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest & ValidatedRequest<DeviceQueryInput>;
    const { subscriber } = authenticatedReq;
    const { status, limit, offset, sortBy, sortOrder } = authenticatedReq.validated;

    try {
      const result = await listDevices(subscriber.id, {
        status,
        limit,
        offset,
        sortBy,
        sortOrder,
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to list devices', {
        subscriberId: subscriber.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve devices',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /v1/devices/:id
 * Get details for a specific device
 *
 * Auth: Requires API key (subscriber authentication)
 * Ownership: Device must belong to authenticated subscriber
 *
 * Path Parameters:
 * - id: Device UUID
 *
 * Response:
 * - Device object with full details and statistics
 *
 * Errors:
 * - 404: Device not found
 * - 403: Device belongs to another subscriber
 */
router.get('/:id', authenticate, async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { subscriber } = authenticatedReq;
  const { id: deviceId } = req.params;

  try {
    const device = await getDevice(deviceId, subscriber.id);

    res.json({
      success: true,
      data: device,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to get device', {
      subscriberId: subscriber.id,
      deviceId,
      error: errorMessage,
    });

    // Handle specific error cases
    if (errorMessage === 'Device not found') {
      res.status(404).json({
        error: 'Not Found',
        message: 'Device not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (errorMessage.includes('Unauthorized')) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this device',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve device',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * PATCH /v1/devices/:id
 * Update device settings
 *
 * Auth: Requires API key (subscriber authentication)
 * Ownership: Device must belong to authenticated subscriber
 *
 * Path Parameters:
 * - id: Device UUID
 *
 * Request Body:
 * - name (optional): New device name
 * - simCarrier (optional): New SIM carrier
 * - simNumber (optional): New SIM number (E.164 format) or null
 *
 * Response:
 * - Updated device object
 *
 * Errors:
 * - 404: Device not found
 * - 403: Device belongs to another subscriber
 * - 400: Invalid request data
 */
router.patch(
  '/:id',
  authenticate,
  validate(UpdateDeviceSchema, 'body'),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest & ValidatedRequest<UpdateDeviceInput>;
    const { subscriber } = authenticatedReq;
    const { id: deviceId } = req.params;
    const updates = authenticatedReq.validated;

    try {
      const device = await updateDevice(deviceId, subscriber.id, updates);

      res.json({
        success: true,
        data: device,
        message: 'Device updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to update device', {
        subscriberId: subscriber.id,
        deviceId,
        error: errorMessage,
      });

      // Handle specific error cases
      if (errorMessage === 'Device not found' || errorMessage.includes('already deleted')) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Device not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('Unauthorized')) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to update this device',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update device',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /v1/devices/:id
 * Soft delete a device
 *
 * Auth: Requires API key (subscriber authentication)
 * Ownership: Device must belong to authenticated subscriber
 *
 * Path Parameters:
 * - id: Device UUID
 *
 * Request Body (optional):
 * - confirm (optional): Set to true to confirm deletion
 *
 * Response:
 * - success: true
 * - message: Deletion confirmation message
 *
 * Errors:
 * - 404: Device not found
 * - 403: Device belongs to another subscriber
 *
 * Note: This is a soft delete. The device record is marked as deleted
 * but not physically removed from the database.
 */
router.delete(
  '/:id',
  authenticate,
  validate(DeleteDeviceSchema, 'body'),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest & ValidatedRequest<DeleteDeviceInput>;
    const { subscriber } = authenticatedReq;
    const { id: deviceId } = req.params;

    try {
      const result = await deleteDevice(deviceId, subscriber.id);

      res.json({
        success: result.success,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to delete device', {
        subscriberId: subscriber.id,
        deviceId,
        error: errorMessage,
      });

      // Handle specific error cases
      if (errorMessage === 'Device not found' || errorMessage.includes('already deleted')) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Device not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('Unauthorized')) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to delete this device',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete device',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/devices/:id/heartbeat
 * Update device heartbeat and status
 *
 * Auth: Requires API key (subscriber authentication)
 * Ownership: Device must belong to authenticated subscriber
 *
 * Path Parameters:
 * - id: Device UUID
 *
 * Response:
 * - deviceId: Device UUID
 * - status: Updated device status (ONLINE)
 * - lastHeartbeat: Timestamp of heartbeat update
 * - message: Success message
 *
 * Errors:
 * - 404: Device not found
 * - 403: Device belongs to another subscriber
 *
 * Note: This endpoint updates the device's last_heartbeat timestamp and
 * sets its status to ONLINE. The Android app should call this periodically
 * to indicate the device is still active.
 */
router.post('/:id/heartbeat', authenticate, async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { subscriber } = authenticatedReq;
  const { id: deviceId } = req.params;

  try {
    const result = await updateHeartbeat(deviceId, subscriber.id);

    res.json({
      success: true,
      data: {
        deviceId: result.deviceId,
        status: result.status,
        lastHeartbeat: result.lastHeartbeat.toISOString(),
      },
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to update heartbeat', {
      subscriberId: subscriber.id,
      deviceId,
      error: errorMessage,
    });

    // Handle specific error cases
    if (errorMessage === 'Device not found' || errorMessage.includes('already deleted')) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Device not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (errorMessage.includes('Unauthorized')) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this device',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update heartbeat',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
