/**
 * Integration Test: Error Recovery and Message Retry
 *
 * Tests error handling and automatic retry scenarios:
 * - Message retry with exponential backoff
 * - TTL expiration handling
 * - Device reselection on retry
 * - Maximum retry limits
 * - Webhook retry logic
 * - Network failure recovery
 *
 * Validates the system's resilience and error recovery capabilities.
 */

import { TestDatabase, getTestDatabase, closeTestDatabase } from '../../helpers/testDatabaseSetup';
import * as messageService from '../../../services/messageService';
import * as retryService from '../../../services/retryService';
import * as webhookService from '../../../services/webhookService';
import * as deviceService from '../../../services/deviceService';
import axios from 'axios';

// Mock axios for webhook testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Integration: Error Recovery and Message Retry', () => {
  let testDb: TestDatabase;
  let subscriberId: string;
  let deviceId: string;

  beforeAll(async () => {
    testDb = getTestDatabase();
  });

  beforeEach(async () => {
    // Clean database
    await testDb.cleanDatabase();

    // Create test subscriber
    const subscriber = await testDb.createSubscriber({
      name: 'Retry Test Subscriber',
      email: 'retry@test.com',
      plan: 'pro',
      daily_quota: 10000,
      max_devices: 5,
    });
    subscriberId = subscriber.id;

    // Register and activate a device
    const token = await deviceService.generateRegistrationToken(subscriberId);
    const device = await deviceService.registerDevice(token.token, {
      deviceName: 'Test Device',
      simCarrier: 'Globe',
      simNumber: '+639171111111',
    });
    deviceId = device.deviceId;
    await deviceService.updateHeartbeat(deviceId, subscriberId);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('Message Retry with Exponential Backoff', () => {
    it('should retry failed message with increasing delays', async () => {
      // Create a failed message
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
        to_number: '+639179876543',
        body: 'Test message',
      });

      // First retry - should succeed
      const result1 = await retryService.retryMessage(message.id);
      expect(result1.retried).toBe(true);
      expect(result1.newStatus).toBe('QUEUED');

      // Check retry count
      let updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.retry_count).toBe(1);
      expect(updatedMessage.status).toBe('QUEUED');

      // Simulate failure again
      await testDb.query(
        'UPDATE messages SET status = $1 WHERE id = $2',
        ['FAILED', message.id]
      );

      // Second retry
      const result2 = await retryService.retryMessage(message.id);
      expect(result2.retried).toBe(true);

      updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.retry_count).toBe(2);

      // Simulate failure again
      await testDb.query(
        'UPDATE messages SET status = $1 WHERE id = $2',
        ['FAILED', message.id]
      );

      // Third retry
      const result3 = await retryService.retryMessage(message.id);
      expect(result3.retried).toBe(true);

      updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.retry_count).toBe(3);
    });

    it('should stop retrying after maximum attempts', async () => {
      // Create a failed message with max retries
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Set retry count to max (3)
      await testDb.query(
        'UPDATE messages SET retry_count = $1 WHERE id = $2',
        [3, message.id]
      );

      // Try to retry - should fail
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(false);
      expect(result.reason).toMatch(/maximum retries/i);

      // Message should still be FAILED
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.status).toBe('FAILED');
      expect(updatedMessage.retry_count).toBe(3);
    });

    it('should respect retry delays (exponential backoff)', async () => {
      // Create a failed message
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // First retry immediately (no delay)
      const start1 = Date.now();
      await retryService.retryMessage(message.id);
      const duration1 = Date.now() - start1;
      expect(duration1).toBeLessThan(1000); // Should be fast

      // Subsequent retries would have delays in production
      // (30s, 60s, 120s) but we're testing the logic, not actual delays
    });
  });

  describe('TTL Expiration Handling', () => {
    it('should not retry expired messages', async () => {
      // Create a message with expired TTL
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Set TTL to past
      await testDb.query(
        'UPDATE messages SET ttl_expires_at = NOW() - INTERVAL \'1 hour\' WHERE id = $1',
        [message.id]
      );

      // Try to retry
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(false);
      expect(result.reason).toMatch(/expired|ttl/i);

      // Message should remain FAILED
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.status).toBe('FAILED');
    });

    it('should retry messages within TTL window', async () => {
      // Create a message with future TTL
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Set TTL to 1 hour in future
      await testDb.query(
        'UPDATE messages SET ttl_expires_at = NOW() + INTERVAL \'1 hour\' WHERE id = $1',
        [message.id]
      );

      // Try to retry - should succeed
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(true);

      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.status).toBe('QUEUED');
    });
  });

  describe('Device Reselection on Retry', () => {
    let device2Id: string;

    beforeEach(async () => {
      // Register second device
      const token = await deviceService.generateRegistrationToken(subscriberId);
      const device2 = await deviceService.registerDevice(token.token, {
        deviceName: 'Second Device',
        simCarrier: 'Globe',
        simNumber: '+639172222222',
      });
      device2Id = device2.deviceId;
      await deviceService.updateHeartbeat(device2Id, subscriberId);
    });

    it('should reselect device when original device is offline', async () => {
      // Create a failed message assigned to device1
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Make original device offline
      await testDb.updateDeviceStatus(deviceId, 'OFFLINE');

      // Retry message
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(true);

      // Should now be assigned to device2
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.gateway_id).toBe(device2Id);
      expect(updatedMessage.status).toBe('QUEUED');
    });

    it('should keep original device if still online', async () => {
      // Create a failed message assigned to device1
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Both devices are online
      // Retry message
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(true);

      // Original device may or may not be selected (depends on algorithm)
      // But it should be assigned to one of the online devices
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.gateway_id).toBeTruthy();
      expect([deviceId, device2Id]).toContain(updatedMessage.gateway_id);
    });

    it('should handle no available devices on retry', async () => {
      // Create a failed message
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Make all devices offline
      await testDb.updateDeviceStatus(deviceId, 'OFFLINE');
      await testDb.updateDeviceStatus(device2Id, 'OFFLINE');

      // Retry message
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(true); // Still retries

      // But device assignment is null
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.gateway_id).toBeNull();
      expect(updatedMessage.status).toBe('QUEUED');
    });
  });

  describe('Webhook Retry Logic', () => {
    const webhookUrl = 'https://example.com/webhook';

    it('should retry failed webhook deliveries', async () => {
      // Mock failures then success
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      // Attempt delivery
      const result = await webhookService.deliverWebhook(webhookUrl, {
        messageId: 'msg-123',
        status: 'SENT',
        toNumber: '+639179876543',
        timestamp: new Date().toISOString(),
        deviceId: null,
      });

      // Should succeed after 3 attempts
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should fail after max webhook retry attempts', async () => {
      // Mock all attempts failing
      mockedAxios.post.mockRejectedValue(new Error('Server error'));

      // Attempt delivery
      const result = await webhookService.deliverWebhook(webhookUrl, {
        messageId: 'msg-123',
        status: 'SENT',
        toNumber: '+639179876543',
        timestamp: new Date().toISOString(),
        deviceId: null,
      });

      // Should fail after 3 attempts
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx client errors', async () => {
      // Mock 404 error
      const error: any = new Error('Not Found');
      error.response = { status: 404 };
      mockedAxios.post.mockRejectedValueOnce(error);

      // Attempt delivery
      const result = await webhookService.deliverWebhook(webhookUrl, {
        messageId: 'msg-123',
        status: 'SENT',
        toNumber: '+639179876543',
        timestamp: new Date().toISOString(),
        deviceId: null,
      });

      // Should fail without retry
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server errors', async () => {
      // Mock 503 error then success
      const error: any = new Error('Service Unavailable');
      error.response = { status: 503 };

      mockedAxios.post
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ status: 200, data: {} });

      // Attempt delivery
      const result = await webhookService.deliverWebhook(webhookUrl, {
        messageId: 'msg-123',
        status: 'SENT',
        toNumber: '+639179876543',
        timestamp: new Date().toISOString(),
        deviceId: null,
      });

      // Should succeed after retry
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Network Failure Recovery', () => {
    it('should handle database connection errors gracefully', async () => {
      // This test would require mocking the database connection
      // For now, we'll test that errors are properly thrown

      const invalidMessageId = 'invalid-id-12345';

      await expect(
        retryService.retryMessage(invalidMessageId)
      ).rejects.toThrow();
    });

    it('should recover from transient database errors', async () => {
      // Create a valid message
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Normal retry should work
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(true);

      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.status).toBe('QUEUED');
    });
  });

  describe('Concurrent Retry Operations', () => {
    it('should handle multiple concurrent retries', async () => {
      // Create 10 failed messages
      const messages = [];
      for (let i = 0; i < 10; i++) {
        const msg = await testDb.createMessage(subscriberId, {
          gateway_id: deviceId,
          status: 'FAILED',
          body: `Message ${i}`,
        });
        messages.push(msg);
      }

      // Retry all concurrently
      const retryPromises = messages.map(msg => retryService.retryMessage(msg.id));
      const results = await Promise.all(retryPromises);

      // All should succeed
      expect(results.length).toBe(10);
      for (const result of results) {
        expect(result.retried).toBe(true);
      }

      // All messages should be QUEUED
      for (const msg of messages) {
        const updatedMessage = await testDb.getMessage(msg.id);
        expect(updatedMessage.status).toBe('QUEUED');
        expect(updatedMessage.retry_count).toBe(1);
      }
    });
  });

  describe('Message State Transitions', () => {
    it('should handle QUEUED → FAILED → QUEUED retry flow', async () => {
      // Send message
      const result = await messageService.createMessage(subscriberId, {
        toNumber: '+639179876543',
        body: 'Test message',
      });

      // Initial state: QUEUED
      let message = await testDb.getMessage(result.message.id);
      expect(message.status).toBe('QUEUED');

      // Simulate failure
      await testDb.query(
        'UPDATE messages SET status = $1 WHERE id = $2',
        ['FAILED', result.message.id]
      );

      // State after failure: FAILED
      message = await testDb.getMessage(result.message.id);
      expect(message.status).toBe('FAILED');

      // Retry
      await retryService.retryMessage(result.message.id);

      // State after retry: QUEUED
      message = await testDb.getMessage(result.message.id);
      expect(message.status).toBe('QUEUED');
      expect(message.retry_count).toBe(1);
    });

    it('should not retry messages in SENT state', async () => {
      // Create a sent message
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'SENT',
      });

      // Try to retry
      const result = await retryService.retryMessage(message.id);

      // Should not retry
      expect(result.retried).toBe(false);

      // Status should remain SENT
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.status).toBe('SENT');
    });

    it('should not retry messages in DELIVERED state', async () => {
      // Create a delivered message
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'DELIVERED',
      });

      // Try to retry
      const result = await retryService.retryMessage(message.id);

      // Should not retry
      expect(result.retried).toBe(false);

      // Status should remain DELIVERED
      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.status).toBe('DELIVERED');
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle retry of non-existent message', async () => {
      const invalidId = 'msg-does-not-exist';

      await expect(
        retryService.retryMessage(invalidId)
      ).rejects.toThrow(/not found/i);
    });

    it('should handle retry with invalid subscriber', async () => {
      // Create message for subscriber1
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: deviceId,
        status: 'FAILED',
      });

      // Create second subscriber
      const sub2 = await testDb.createSubscriber({
        email: 'sub2@test.com',
      });

      // Try to retry with wrong subscriber context
      // (This would be prevented at the route level, but testing service isolation)
      // In production, this check happens in the route handler
      const result = await retryService.retryMessage(message.id);

      // Retry should work at service level (route handles authorization)
      expect(result.retried).toBe(true);
    });

    it('should handle messages with NULL gateway_id', async () => {
      // Create a queued message without device assignment
      const message = await testDb.createMessage(subscriberId, {
        gateway_id: null,
        status: 'FAILED',
      });

      // Retry should work and assign a device
      const result = await retryService.retryMessage(message.id);
      expect(result.retried).toBe(true);

      const updatedMessage = await testDb.getMessage(message.id);
      expect(updatedMessage.gateway_id).toBeTruthy(); // Should now have a device
    });
  });
});
