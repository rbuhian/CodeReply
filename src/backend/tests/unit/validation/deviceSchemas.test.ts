/**
 * Device Validation Schemas Tests
 * Unit tests for device registration and management validation
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import {
  CreateRegistrationTokenSchema,
  RegisterDeviceSchema,
  DeviceHeartbeatSchema,
  UpdateDeviceSchema,
  DeleteDeviceSchema,
  DeviceQuerySchema,
} from '../../../validation/deviceSchemas';

describe('CreateRegistrationTokenSchema', () => {
  it('should accept valid registration token request', () => {
    const validData = {
      label: 'Office Android Phone',
    };

    expect(() => CreateRegistrationTokenSchema.parse(validData)).not.toThrow();
  });

  it('should accept empty request (label is optional)', () => {
    const validData = {};
    expect(() => CreateRegistrationTokenSchema.parse(validData)).not.toThrow();
  });

  it('should reject label exceeding 100 characters', () => {
    const invalidData = {
      label: 'A'.repeat(101),
    };

    expect(() => CreateRegistrationTokenSchema.parse(invalidData)).toThrow();
  });
});

describe('RegisterDeviceSchema', () => {
  it('should accept valid device registration', () => {
    const validData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone 1',
      simCarrier: 'Smart Communications',
      simNumber: '+639171234567',
      androidVersion: '13.0',
      appVersion: '1.0.0',
    };

    expect(() => RegisterDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal valid registration (only required fields)', () => {
    const validData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone 1',
    };

    expect(() => RegisterDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid registration token format', () => {
    const invalidData = {
      registrationToken: 'invalid_token',
      deviceName: 'Office Phone 1',
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should reject registration token with wrong prefix', () => {
    const invalidData = {
      registrationToken: 'cr_live_' + 'a'.repeat(32),
      deviceName: 'Office Phone 1',
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should reject registration token with wrong length', () => {
    const invalidData = {
      registrationToken: 'cr_reg_abc123',
      deviceName: 'Office Phone 1',
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should reject empty device name', () => {
    const invalidData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: '',
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should reject device name exceeding 100 characters', () => {
    const invalidData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'A'.repeat(101),
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should reject device name with invalid characters', () => {
    const invalidData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone @#$%',
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should accept device name with allowed special characters', () => {
    const validData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office-Phone_1',
    };

    expect(() => RegisterDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid E.164 phone number', () => {
    const invalidData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone 1',
      simNumber: 'invalid-phone', // Invalid characters
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid Android version format', () => {
    const invalidData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone 1',
      androidVersion: 'Android 13',
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should accept various Android version formats', () => {
    const testCases = ['13', '13.0', '13.0.1', '13.0.1.2'];

    testCases.forEach((version) => {
      const validData = {
        registrationToken: 'cr_reg_' + '0'.repeat(64),
        deviceName: 'Office Phone 1',
        androidVersion: version,
      };

      expect(() => RegisterDeviceSchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid app version format', () => {
    const invalidData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone 1',
      appVersion: '1.0', // Must be X.Y.Z
    };

    expect(() => RegisterDeviceSchema.parse(invalidData)).toThrow();
  });

  it('should accept valid semantic versioning for app version', () => {
    const validData = {
      registrationToken: 'cr_reg_' + '0'.repeat(64),
      deviceName: 'Office Phone 1',
      appVersion: '1.0.0',
    };

    expect(() => RegisterDeviceSchema.parse(validData)).not.toThrow();
  });
});

describe('DeviceHeartbeatSchema', () => {
  it('should accept valid heartbeat with all fields', () => {
    const validData = {
      status: 'ONLINE',
      batteryLevel: 85,
      signalStrength: 75,
      lastError: 'No errors',
    };

    expect(() => DeviceHeartbeatSchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal heartbeat (only status)', () => {
    const validData = {
      status: 'ONLINE',
    };

    expect(() => DeviceHeartbeatSchema.parse(validData)).not.toThrow();
  });

  it('should accept all valid status values', () => {
    const statuses = ['ONLINE', 'OFFLINE', 'DEGRADED'];

    statuses.forEach((status) => {
      const validData = { status };
      expect(() => DeviceHeartbeatSchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid status', () => {
    const invalidData = {
      status: 'UNKNOWN',
    };

    expect(() => DeviceHeartbeatSchema.parse(invalidData)).toThrow();
  });

  it('should reject battery level below 0', () => {
    const invalidData = {
      status: 'ONLINE',
      batteryLevel: -1,
    };

    expect(() => DeviceHeartbeatSchema.parse(invalidData)).toThrow();
  });

  it('should reject battery level above 100', () => {
    const invalidData = {
      status: 'ONLINE',
      batteryLevel: 101,
    };

    expect(() => DeviceHeartbeatSchema.parse(invalidData)).toThrow();
  });

  it('should accept battery level at boundaries', () => {
    const testCases = [0, 50, 100];

    testCases.forEach((batteryLevel) => {
      const validData = {
        status: 'ONLINE',
        batteryLevel,
      };

      expect(() => DeviceHeartbeatSchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject signal strength below 0', () => {
    const invalidData = {
      status: 'ONLINE',
      signalStrength: -1,
    };

    expect(() => DeviceHeartbeatSchema.parse(invalidData)).toThrow();
  });

  it('should reject signal strength above 100', () => {
    const invalidData = {
      status: 'ONLINE',
      signalStrength: 101,
    };

    expect(() => DeviceHeartbeatSchema.parse(invalidData)).toThrow();
  });

  it('should reject lastError exceeding 500 characters', () => {
    const invalidData = {
      status: 'DEGRADED',
      lastError: 'E'.repeat(501),
    };

    expect(() => DeviceHeartbeatSchema.parse(invalidData)).toThrow();
  });
});

describe('UpdateDeviceSchema', () => {
  it('should accept valid device update', () => {
    const validData = {
      name: 'Updated Phone Name',
      simCarrier: 'Globe Telecom',
      simNumber: '+639181234567',
    };

    expect(() => UpdateDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should accept partial update (only one field)', () => {
    const validData = {
      name: 'New Name',
    };

    expect(() => UpdateDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should accept empty update (all fields optional)', () => {
    const validData = {};
    expect(() => UpdateDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should accept null for simNumber (nullable)', () => {
    const validData = {
      simNumber: null,
    };

    expect(() => UpdateDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid device name format', () => {
    const invalidData = {
      name: 'Invalid@Name',
    };

    expect(() => UpdateDeviceSchema.parse(invalidData)).toThrow();
  });
});

describe('DeleteDeviceSchema', () => {
  it('should accept delete request with confirmation', () => {
    const validData = {
      confirm: true,
    };

    expect(() => DeleteDeviceSchema.parse(validData)).not.toThrow();
  });

  it('should accept delete request without confirmation', () => {
    const validData = {};
    expect(() => DeleteDeviceSchema.parse(validData)).not.toThrow();
  });
});

describe('DeviceQuerySchema', () => {
  it('should accept valid query with all parameters', () => {
    const validData = {
      status: 'ONLINE',
      limit: '50',
      offset: '10',
      sortBy: 'name',
      sortOrder: 'asc',
    };

    const result = DeviceQuerySchema.parse(validData);
    expect(result.limit).toBe(50); // Should be coerced to number
    expect(result.offset).toBe(10); // Should be coerced to number
  });

  it('should apply default values', () => {
    const validData = {};
    const result = DeviceQuerySchema.parse(validData);

    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(result.sortBy).toBe('created_at');
    expect(result.sortOrder).toBe('desc');
  });

  it('should coerce string numbers to integers', () => {
    const validData = {
      limit: '75',
      offset: '25',
    };

    const result = DeviceQuerySchema.parse(validData);
    expect(typeof result.limit).toBe('number');
    expect(typeof result.offset).toBe('number');
    expect(result.limit).toBe(75);
    expect(result.offset).toBe(25);
  });

  it('should reject limit below 1', () => {
    const invalidData = {
      limit: '0',
    };

    expect(() => DeviceQuerySchema.parse(invalidData)).toThrow();
  });

  it('should reject limit above 100', () => {
    const invalidData = {
      limit: '101',
    };

    expect(() => DeviceQuerySchema.parse(invalidData)).toThrow();
  });

  it('should reject negative offset', () => {
    const invalidData = {
      offset: '-1',
    };

    expect(() => DeviceQuerySchema.parse(invalidData)).toThrow();
  });

  it('should accept all valid status values', () => {
    const statuses = ['ONLINE', 'OFFLINE', 'DEGRADED', 'ALL'];

    statuses.forEach((status) => {
      const validData = { status };
      expect(() => DeviceQuerySchema.parse(validData)).not.toThrow();
    });
  });

  it('should accept all valid sortBy values', () => {
    const sortByValues = ['created_at', 'name', 'last_heartbeat', 'status'];

    sortByValues.forEach((sortBy) => {
      const validData = { sortBy };
      expect(() => DeviceQuerySchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid sortBy value', () => {
    const invalidData = {
      sortBy: 'invalid_field',
    };

    expect(() => DeviceQuerySchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid sortOrder value', () => {
    const invalidData = {
      sortOrder: 'random',
    };

    expect(() => DeviceQuerySchema.parse(invalidData)).toThrow();
  });
});
