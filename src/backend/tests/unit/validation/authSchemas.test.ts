/**
 * Authentication Validation Schemas Tests
 * Unit tests for API key and authentication validation
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import {
  ApiKeySchema,
  CreateApiKeySchema,
  UpdateApiKeySchema,
  RevokeApiKeySchema,
  ApiKeyQuerySchema,
  LoginSchema,
  RegisterSchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
  RefreshTokenSchema,
} from '../../../validation/authSchemas';

describe('ApiKeySchema', () => {
  it('should accept valid live API key', () => {
    const validKey = 'cr_live_' + 'a'.repeat(32);
    expect(() => ApiKeySchema.parse(validKey)).not.toThrow();
  });

  it('should accept valid test API key', () => {
    const validKey = 'cr_test_' + 'a'.repeat(32);
    expect(() => ApiKeySchema.parse(validKey)).not.toThrow();
  });

  it('should reject API key with wrong prefix', () => {
    const invalidKey = 'cr_prod_' + 'a'.repeat(32);
    expect(() => ApiKeySchema.parse(invalidKey)).toThrow();
  });

  it('should reject API key with wrong length', () => {
    const invalidKey = 'cr_live_abc123';
    expect(() => ApiKeySchema.parse(invalidKey)).toThrow();
  });

  it('should reject API key without prefix', () => {
    const invalidKey = 'a'.repeat(40);
    expect(() => ApiKeySchema.parse(invalidKey)).toThrow();
  });
});

describe('CreateApiKeySchema', () => {
  it('should accept valid API key creation with all fields', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const validData = {
      label: 'Production API Key',
      environment: 'live',
      permissions: ['messages:read', 'messages:write', 'devices:read'],
      expiresAt: futureDate.toISOString(),
    };

    expect(() => CreateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal API key creation', () => {
    const validData = {
      label: 'Test Key',
      environment: 'test',
    };

    const result = CreateApiKeySchema.parse(validData);
    expect(result.permissions).toEqual(['messages:read', 'messages:write']);
  });

  it('should reject empty label', () => {
    const invalidData = {
      label: '',
      environment: 'test',
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should reject label exceeding 100 characters', () => {
    const invalidData = {
      label: 'A'.repeat(101),
      environment: 'test',
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should reject label with invalid characters', () => {
    const invalidData = {
      label: 'Invalid@Label#',
      environment: 'test',
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should accept label with allowed special characters', () => {
    const validData = {
      label: 'Production-API_Key 1',
      environment: 'live',
    };

    expect(() => CreateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should accept both live and test environments', () => {
    const environments = ['live', 'test'];

    environments.forEach((environment) => {
      const validData = {
        label: 'Test Key',
        environment,
      };

      expect(() => CreateApiKeySchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid environment', () => {
    const invalidData = {
      label: 'Test Key',
      environment: 'production',
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should accept all valid permission values', () => {
    const validData = {
      label: 'Full Access Key',
      environment: 'live',
      permissions: [
        'messages:read',
        'messages:write',
        'devices:read',
        'devices:write',
        'api-keys:read',
        'api-keys:write',
      ],
    };

    expect(() => CreateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should reject empty permissions array', () => {
    const invalidData = {
      label: 'Test Key',
      environment: 'test',
      permissions: [],
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should reject more than 10 permissions', () => {
    const invalidData = {
      label: 'Test Key',
      environment: 'test',
      permissions: Array(11).fill('messages:read'),
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should reject expiration date in the past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const invalidData = {
      label: 'Test Key',
      environment: 'test',
      expiresAt: pastDate.toISOString(),
    };

    expect(() => CreateApiKeySchema.parse(invalidData)).toThrow();
  });

  it('should accept expiration date in the future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 365);

    const validData = {
      label: 'Test Key',
      environment: 'test',
      expiresAt: futureDate.toISOString(),
    };

    expect(() => CreateApiKeySchema.parse(validData)).not.toThrow();
  });
});

describe('UpdateApiKeySchema', () => {
  it('should accept valid API key update', () => {
    const validData = {
      label: 'Updated Label',
      isActive: false,
      permissions: ['messages:read'],
    };

    expect(() => UpdateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should accept partial update', () => {
    const validData = {
      isActive: false,
    };

    expect(() => UpdateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should accept empty update', () => {
    const validData = {};
    expect(() => UpdateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should accept null for expiresAt', () => {
    const validData = {
      expiresAt: null,
    };

    expect(() => UpdateApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid label format', () => {
    const invalidData = {
      label: 'Invalid@Label',
    };

    expect(() => UpdateApiKeySchema.parse(invalidData)).toThrow();
  });
});

describe('RevokeApiKeySchema', () => {
  it('should accept revoke request with confirmation', () => {
    const validData = {
      confirm: true,
    };

    expect(() => RevokeApiKeySchema.parse(validData)).not.toThrow();
  });

  it('should accept revoke request without confirmation', () => {
    const validData = {};
    expect(() => RevokeApiKeySchema.parse(validData)).not.toThrow();
  });
});

describe('ApiKeyQuerySchema', () => {
  it('should accept valid query with all parameters', () => {
    const validData = {
      environment: 'live',
      isActive: 'true',
      limit: '50',
      offset: '10',
      sortBy: 'created_at',
      sortOrder: 'asc',
    };

    const result = ApiKeyQuerySchema.parse(validData);
    expect(result.environment).toBe('live');
    expect(result.isActive).toBe(true);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('should apply default values', () => {
    const validData = {};
    const result = ApiKeyQuerySchema.parse(validData);

    expect(result.environment).toBe('all');
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(result.sortBy).toBe('created_at');
    expect(result.sortOrder).toBe('desc');
  });

  it('should transform isActive string to boolean', () => {
    const testCases = [
      { input: 'true', expected: true },
      { input: 'false', expected: false },
      { input: 'all', expected: undefined },
    ];

    testCases.forEach(({ input, expected }) => {
      const validData = { isActive: input };
      const result = ApiKeyQuerySchema.parse(validData);
      expect(result.isActive).toBe(expected);
    });
  });

  it('should accept all valid environment values', () => {
    const environments = ['live', 'test', 'all'];

    environments.forEach((environment) => {
      const validData = { environment };
      expect(() => ApiKeyQuerySchema.parse(validData)).not.toThrow();
    });
  });

  it('should accept all valid sortBy values', () => {
    const sortByValues = ['created_at', 'label', 'last_used_at', 'expires_at'];

    sortByValues.forEach((sortBy) => {
      const validData = { sortBy };
      expect(() => ApiKeyQuerySchema.parse(validData)).not.toThrow();
    });
  });
});

describe('LoginSchema', () => {
  it('should accept valid login credentials', () => {
    const validData = {
      email: 'user@example.com',
      password: 'SecurePassword123',
      rememberMe: true,
    };

    expect(() => LoginSchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal login (without rememberMe)', () => {
    const validData = {
      email: 'user@example.com',
      password: 'SecurePassword123',
    };

    const result = LoginSchema.parse(validData);
    expect(result.rememberMe).toBe(false);
  });

  it('should reject invalid email format', () => {
    const invalidData = {
      email: 'not-an-email',
      password: 'SecurePassword123',
    };

    expect(() => LoginSchema.parse(invalidData)).toThrow();
  });

  it('should reject email exceeding 255 characters', () => {
    const invalidData = {
      email: 'a'.repeat(250) + '@example.com',
      password: 'SecurePassword123',
    };

    expect(() => LoginSchema.parse(invalidData)).toThrow();
  });

  it('should reject password shorter than 8 characters', () => {
    const invalidData = {
      email: 'user@example.com',
      password: 'short',
    };

    expect(() => LoginSchema.parse(invalidData)).toThrow();
  });

  it('should reject password longer than 128 characters', () => {
    const invalidData = {
      email: 'user@example.com',
      password: 'A'.repeat(129),
    };

    expect(() => LoginSchema.parse(invalidData)).toThrow();
  });
});

describe('RegisterSchema', () => {
  it('should accept valid registration with all fields', () => {
    const validData = {
      email: 'newuser@example.com',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
      phoneNumber: '+639171234567',
    };

    expect(() => RegisterSchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal registration (without phone)', () => {
    const validData = {
      email: 'newuser@example.com',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
    };

    expect(() => RegisterSchema.parse(validData)).not.toThrow();
  });

  it('should reject weak password (no uppercase)', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'weakpassword123',
      confirmPassword: 'weakpassword123',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });

  it('should reject weak password (no lowercase)', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'WEAKPASSWORD123',
      confirmPassword: 'WEAKPASSWORD123',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });

  it('should reject weak password (no number)', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'WeakPassword',
      confirmPassword: 'WeakPassword',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });

  it('should reject mismatched passwords', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'SecurePassword123',
      confirmPassword: 'DifferentPassword123',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });

  it('should reject empty company name', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      companyName: '',
      fullName: 'John Doe',
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });

  it('should reject empty full name', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      companyName: 'Acme Corporation',
      fullName: '',
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid phone number format', () => {
    const invalidData = {
      email: 'newuser@example.com',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      companyName: 'Acme Corporation',
      fullName: 'John Doe',
      phoneNumber: 'abc123xyz', // Invalid characters
    };

    expect(() => RegisterSchema.parse(invalidData)).toThrow();
  });
});

describe('PasswordResetRequestSchema', () => {
  it('should accept valid password reset request', () => {
    const validData = {
      email: 'user@example.com',
    };

    expect(() => PasswordResetRequestSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid email format', () => {
    const invalidData = {
      email: 'not-an-email',
    };

    expect(() => PasswordResetRequestSchema.parse(invalidData)).toThrow();
  });
});

describe('PasswordResetConfirmSchema', () => {
  it('should accept valid password reset confirmation', () => {
    const validData = {
      token: 'reset_token_abc123xyz',
      newPassword: 'NewSecurePassword123',
      confirmPassword: 'NewSecurePassword123',
    };

    expect(() => PasswordResetConfirmSchema.parse(validData)).not.toThrow();
  });

  it('should reject empty token', () => {
    const invalidData = {
      token: '',
      newPassword: 'NewSecurePassword123',
      confirmPassword: 'NewSecurePassword123',
    };

    expect(() => PasswordResetConfirmSchema.parse(invalidData)).toThrow();
  });

  it('should reject weak new password', () => {
    const invalidData = {
      token: 'reset_token_abc123xyz',
      newPassword: 'weakpassword',
      confirmPassword: 'weakpassword',
    };

    expect(() => PasswordResetConfirmSchema.parse(invalidData)).toThrow();
  });

  it('should reject mismatched passwords', () => {
    const invalidData = {
      token: 'reset_token_abc123xyz',
      newPassword: 'NewSecurePassword123',
      confirmPassword: 'DifferentPassword123',
    };

    expect(() => PasswordResetConfirmSchema.parse(invalidData)).toThrow();
  });
});

describe('RefreshTokenSchema', () => {
  it('should accept valid refresh token', () => {
    const validData = {
      refreshToken: 'valid_refresh_token_12345',
    };

    expect(() => RefreshTokenSchema.parse(validData)).not.toThrow();
  });

  it('should reject empty refresh token', () => {
    const invalidData = {
      refreshToken: '',
    };

    expect(() => RefreshTokenSchema.parse(invalidData)).toThrow();
  });

  it('should reject refresh token exceeding 500 characters', () => {
    const invalidData = {
      refreshToken: 'a'.repeat(501),
    };

    expect(() => RefreshTokenSchema.parse(invalidData)).toThrow();
  });
});
