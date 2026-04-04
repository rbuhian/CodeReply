/**
 * Message Validation Schemas Tests
 * Unit tests for SMS message sending and management validation
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import {
  SendMessageSchema,
  SendBatchMessagesSchema,
  MessageQuerySchema,
  UpdateMessageSchema,
  WebhookDeliverySchema,
} from '../../../validation/messageSchemas';

describe('SendMessageSchema', () => {
  it('should accept valid message with all fields', () => {
    const validData = {
      to: '+639171234567',
      body: 'Hello, this is a test message!',
      webhookUrl: 'https://example.com/webhook',
      metadata: { orderId: '12345', customerId: 'CUST001' },
      ttl: 600,
      priority: 'HIGH',
    };

    expect(() => SendMessageSchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal valid message', () => {
    const validData = {
      to: '+639171234567',
      body: 'Test message',
    };

    const result = SendMessageSchema.parse(validData);
    expect(result.ttl).toBe(300); // Default TTL
    expect(result.priority).toBe('NORMAL'); // Default priority
  });

  it('should reject invalid E.164 phone number (missing +)', () => {
    const invalidData = {
      to: '639171234567', // Missing +
      body: 'Test message',
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid E.164 phone number (too short)', () => {
    const invalidData = {
      to: '+123',
      body: 'Test message',
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid E.164 phone number (starts with +0)', () => {
    const invalidData = {
      to: '+0123456789',
      body: 'Test message',
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should accept various valid E.164 phone numbers', () => {
    const validPhoneNumbers = [
      '+639171234567', // Philippines
      '+12125551234', // US/Canada
      '+447911123456', // UK
      '+61412345678', // Australia
      '+819012345678', // Japan
    ];

    validPhoneNumbers.forEach((phone) => {
      const validData = {
        to: phone,
        body: 'Test message',
      };

      expect(() => SendMessageSchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject empty message body', () => {
    const invalidData = {
      to: '+639171234567',
      body: '',
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should reject message body exceeding 918 characters', () => {
    const invalidData = {
      to: '+639171234567',
      body: 'A'.repeat(919),
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should accept message body at 918 characters (6 SMS segments)', () => {
    const validData = {
      to: '+639171234567',
      body: 'A'.repeat(918),
    };

    expect(() => SendMessageSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid webhook URL', () => {
    const invalidData = {
      to: '+639171234567',
      body: 'Test message',
      webhookUrl: 'not-a-url',
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should reject webhook URL exceeding 500 characters', () => {
    const invalidData = {
      to: '+639171234567',
      body: 'Test message',
      webhookUrl: 'https://example.com/' + 'x'.repeat(500),
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should reject metadata exceeding 5KB', () => {
    const largeMetadata: any = {};
    // Create metadata that exceeds 5KB when stringified
    for (let i = 0; i < 1000; i++) {
      largeMetadata[`key${i}`] = 'x'.repeat(10);
    }

    const invalidData = {
      to: '+639171234567',
      body: 'Test message',
      metadata: largeMetadata,
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should accept metadata under 5KB', () => {
    const validData = {
      to: '+639171234567',
      body: 'Test message',
      metadata: {
        orderId: '12345',
        customerId: 'CUST001',
        campaign: 'Summer Sale 2026',
      },
    };

    expect(() => SendMessageSchema.parse(validData)).not.toThrow();
  });

  it('should reject TTL below 60 seconds', () => {
    const invalidData = {
      to: '+639171234567',
      body: 'Test message',
      ttl: 59,
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should reject TTL above 86400 seconds (24 hours)', () => {
    const invalidData = {
      to: '+639171234567',
      body: 'Test message',
      ttl: 86401,
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });

  it('should accept TTL at boundaries', () => {
    const testCases = [60, 300, 3600, 86400];

    testCases.forEach((ttl) => {
      const validData = {
        to: '+639171234567',
        body: 'Test message',
        ttl,
      };

      expect(() => SendMessageSchema.parse(validData)).not.toThrow();
    });
  });

  it('should accept all valid priority values', () => {
    const priorities = ['LOW', 'NORMAL', 'HIGH'];

    priorities.forEach((priority) => {
      const validData = {
        to: '+639171234567',
        body: 'Test message',
        priority,
      };

      expect(() => SendMessageSchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid priority value', () => {
    const invalidData = {
      to: '+639171234567',
      body: 'Test message',
      priority: 'URGENT',
    };

    expect(() => SendMessageSchema.parse(invalidData)).toThrow();
  });
});

describe('SendBatchMessagesSchema', () => {
  it('should accept valid batch with multiple messages', () => {
    const validData = {
      messages: [
        {
          to: '+639171234567',
          body: 'Message 1',
          metadata: { orderId: '001' },
        },
        {
          to: '+639181234567',
          body: 'Message 2',
          metadata: { orderId: '002' },
        },
      ],
      webhookUrl: 'https://example.com/webhook',
      ttl: 600,
      priority: 'HIGH',
    };

    expect(() => SendBatchMessagesSchema.parse(validData)).not.toThrow();
  });

  it('should accept minimal batch (one message)', () => {
    const validData = {
      messages: [
        {
          to: '+639171234567',
          body: 'Message 1',
        },
      ],
    };

    const result = SendBatchMessagesSchema.parse(validData);
    expect(result.ttl).toBe(300);
    expect(result.priority).toBe('NORMAL');
  });

  it('should reject empty messages array', () => {
    const invalidData = {
      messages: [],
    };

    expect(() => SendBatchMessagesSchema.parse(invalidData)).toThrow();
  });

  it('should reject batch exceeding 100 messages', () => {
    const messages = [];
    for (let i = 0; i < 101; i++) {
      messages.push({
        to: '+639171234567',
        body: `Message ${i}`,
      });
    }

    const invalidData = { messages };

    expect(() => SendBatchMessagesSchema.parse(invalidData)).toThrow();
  });

  it('should accept batch at 100 messages limit', () => {
    const messages = [];
    for (let i = 0; i < 100; i++) {
      messages.push({
        to: '+639171234567',
        body: `Message ${i}`,
      });
    }

    const validData = { messages };

    expect(() => SendBatchMessagesSchema.parse(validData)).not.toThrow();
  });

  it('should reject batch with invalid phone number in one message', () => {
    const invalidData = {
      messages: [
        {
          to: '+639171234567',
          body: 'Valid message',
        },
        {
          to: 'invalid-phone',
          body: 'Invalid message',
        },
      ],
    };

    expect(() => SendBatchMessagesSchema.parse(invalidData)).toThrow();
  });

  it('should reject batch with message body exceeding 918 characters', () => {
    const invalidData = {
      messages: [
        {
          to: '+639171234567',
          body: 'A'.repeat(919),
        },
      ],
    };

    expect(() => SendBatchMessagesSchema.parse(invalidData)).toThrow();
  });
});

describe('MessageQuerySchema', () => {
  it('should accept valid query with all parameters', () => {
    const validData = {
      status: 'SENT',
      to: '+639171234567',
      from: '2026-04-01',
      to_date: '2026-04-03',
      limit: '50',
      offset: '10',
      sortBy: 'sent_at',
      sortOrder: 'asc',
    };

    const result = MessageQuerySchema.parse(validData);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to_date).toBeInstanceOf(Date);
  });

  it('should apply default values', () => {
    const validData = {};
    const result = MessageQuerySchema.parse(validData);

    expect(result.status).toBe('ALL');
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(result.sortBy).toBe('queued_at');
    expect(result.sortOrder).toBe('desc');
  });

  it('should accept all valid status values', () => {
    const statuses = ['ALL', 'QUEUED', 'DISPATCHED', 'SENT', 'DELIVERED', 'FAILED'];

    statuses.forEach((status) => {
      const validData = { status };
      expect(() => MessageQuerySchema.parse(validData)).not.toThrow();
    });
  });

  it('should coerce string dates to Date objects', () => {
    const validData = {
      from: '2026-04-01',
      to_date: '2026-04-03',
    };

    const result = MessageQuerySchema.parse(validData);
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to_date).toBeInstanceOf(Date);
  });

  it('should reject when from date is after to_date', () => {
    const invalidData = {
      from: '2026-04-03',
      to_date: '2026-04-01',
    };

    expect(() => MessageQuerySchema.parse(invalidData)).toThrow();
  });

  it('should accept when from date equals to_date', () => {
    const validData = {
      from: '2026-04-01',
      to_date: '2026-04-01',
    };

    expect(() => MessageQuerySchema.parse(validData)).not.toThrow();
  });

  it('should accept all valid sortBy values', () => {
    const sortByValues = ['queued_at', 'sent_at', 'delivered_at', 'status'];

    sortByValues.forEach((sortBy) => {
      const validData = { sortBy };
      expect(() => MessageQuerySchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid sortBy value', () => {
    const invalidData = {
      sortBy: 'invalid_field',
    };

    expect(() => MessageQuerySchema.parse(invalidData)).toThrow();
  });
});

describe('UpdateMessageSchema', () => {
  it('should accept RETRY action', () => {
    const validData = {
      action: 'RETRY',
    };

    expect(() => UpdateMessageSchema.parse(validData)).not.toThrow();
  });

  it('should accept CANCEL action', () => {
    const validData = {
      action: 'CANCEL',
    };

    expect(() => UpdateMessageSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid action', () => {
    const invalidData = {
      action: 'DELETE',
    };

    expect(() => UpdateMessageSchema.parse(invalidData)).toThrow();
  });
});

describe('WebhookDeliverySchema', () => {
  it('should accept valid webhook delivery confirmation', () => {
    const validData = {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'DELIVERED',
      timestamp: '2026-04-03T12:00:00Z',
    };

    expect(() => WebhookDeliverySchema.parse(validData)).not.toThrow();
  });

  it('should accept delivery with error message', () => {
    const validData = {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'FAILED',
      error: 'Recipient phone number is invalid',
      timestamp: '2026-04-03T12:00:00Z',
    };

    expect(() => WebhookDeliverySchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid UUID for messageId', () => {
    const invalidData = {
      messageId: 'not-a-uuid',
      status: 'SENT',
      timestamp: '2026-04-03T12:00:00Z',
    };

    expect(() => WebhookDeliverySchema.parse(invalidData)).toThrow();
  });

  it('should accept all valid status values', () => {
    const statuses = ['SENT', 'DELIVERED', 'FAILED'];

    statuses.forEach((status) => {
      const validData = {
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        status,
        timestamp: '2026-04-03T12:00:00Z',
      };

      expect(() => WebhookDeliverySchema.parse(validData)).not.toThrow();
    });
  });

  it('should reject invalid status', () => {
    const invalidData = {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'PENDING',
      timestamp: '2026-04-03T12:00:00Z',
    };

    expect(() => WebhookDeliverySchema.parse(invalidData)).toThrow();
  });

  it('should reject error message exceeding 500 characters', () => {
    const invalidData = {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'FAILED',
      error: 'E'.repeat(501),
      timestamp: '2026-04-03T12:00:00Z',
    };

    expect(() => WebhookDeliverySchema.parse(invalidData)).toThrow();
  });

  it('should coerce string timestamp to Date', () => {
    const validData = {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'DELIVERED',
      timestamp: '2026-04-03T12:00:00Z',
    };

    const result = WebhookDeliverySchema.parse(validData);
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});
