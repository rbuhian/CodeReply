/**
 * Integration Test: Complete Device Registration and Message Sending Flow
 *
 * Tests the full end-to-end flow:
 * 1. Subscriber creates registration token
 * 2. Device registers with token
 * 3. Device sends heartbeat
 * 4. Subscriber sends message via API
 * 5. Message routes to correct device
 * 6. Webhook is delivered (if configured)
 *
 * This validates the complete BYOD architecture from registration to message delivery.
 */

import { TestDatabase, getTestDatabase, closeTestDatabase } from '../../helpers/testDatabaseSetup';
import * as deviceService from '../../../services/deviceService';
import * as messageService from '../../../services/messageService';
import * as webhookService from '../../../services/webhookService';
import axios from 'axios';

// Mock axios for webhook testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Integration: Device Registration and Messaging Flow', () => {
  let testDb: TestDatabase;
  let subscriberId: string;
  let apiKeyHash: string;

  beforeAll(async () => {
    testDb = getTestDatabase();
  });

  beforeEach(async () => {
    // Clean database before each test
    await testDb.cleanDatabase();

    // Create test subscriber
    const subscriber = await testDb.createSubscriber({
      name: 'Integration Test Subscriber',
      email: 'integration@test.com',
      plan: 'pro',
      daily_quota: 10000,
      max_devices: 5,
    });
    subscriberId = subscriber.id;

    // Create API key for the subscriber
    const apiKey = await testDb.createApiKey(subscriberId, {
      key_hash: 'test_hash_123',
      key_prefix: 'cr_test',
      label: 'Integration Test Key',
    });
    apiKeyHash = apiKey.key_hash;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('Complete Device Registration Flow', () => {
    it('should register a device end-to-end with valid token', async () => {
      // Step 1: Generate registration token
      const tokenResult = await deviceService.generateRegistrationToken(subscriberId);

      expect(tokenResult).toHaveProperty('token');
      expect(tokenResult).toHaveProperty('expiresAt');
      expect(tokenResult.token).toMatch(/^cr_reg_[a-zA-Z0-9]+$/);

      // Verify token is stored in database
      const tokenInDb = await testDb.queryOne(
        'SELECT * FROM device_registration_tokens WHERE token = $1',
        [tokenResult.token]
      );
      expect(tokenInDb).toBeTruthy();
      expect(tokenInDb.subscriber_id).toBe(subscriberId);
      expect(tokenInDb.is_used).toBe(false);

      // Step 2: Register device with token
      const deviceData = {
        deviceName: 'Samsung Galaxy S21',
        simCarrier: 'Globe',
        simNumber: '+639171234567',
        deviceModel: 'SM-G991B',
        osVersion: 'Android 13',
      };

      const registrationResult = await deviceService.registerDevice(
        tokenResult.token,
        deviceData
      );

      expect(registrationResult).toHaveProperty('deviceId');
      expect(registrationResult).toHaveProperty('deviceToken');
      expect(registrationResult.deviceToken).toMatch(/^eyJ/); // JWT format

      // Verify device in database
      const device = await testDb.getDevice(registrationResult.deviceId);
      expect(device).toBeTruthy();
      expect(device.subscriber_id).toBe(subscriberId);
      expect(device.name).toBe(deviceData.deviceName);
      expect(device.sim_carrier).toBe(deviceData.simCarrier);
      expect(device.sim_number).toBe(deviceData.simNumber);
      expect(device.status).toBe('OFFLINE'); // Initially offline

      // Verify token is marked as used
      const usedToken = await testDb.queryOne(
        'SELECT * FROM device_registration_tokens WHERE token = $1',
        [tokenResult.token]
      );
      expect(usedToken.is_used).toBe(true);
      expect(usedToken.used_at).toBeTruthy();
      expect(usedToken.device_id).toBe(registrationResult.deviceId);

      // Step 3: Device sends heartbeat
      await deviceService.updateHeartbeat(registrationResult.deviceId, subscriberId);

      // Verify device is now ONLINE
      const onlineDevice = await testDb.getDevice(registrationResult.deviceId);
      expect(onlineDevice.status).toBe('ONLINE');
      expect(onlineDevice.last_heartbeat).toBeTruthy();
    });

    it('should enforce device quota during registration', async () => {
      // Create subscriber with max 1 device
      const limitedSubscriber = await testDb.createSubscriber({
        plan: 'starter',
        max_devices: 1,
      });

      // Register first device - should succeed
      const token1 = await deviceService.generateRegistrationToken(limitedSubscriber.id);
      await deviceService.registerDevice(token1.token, {
        deviceName: 'Device 1',
      });

      // Try to register second device - should fail
      const token2 = await deviceService.generateRegistrationToken(limitedSubscriber.id);

      await expect(
        deviceService.registerDevice(token2.token, {
          deviceName: 'Device 2',
        })
      ).rejects.toThrow(/quota/i);
    });
  });

  describe('Complete Message Sending Flow', () => {
    let deviceId: string;

    beforeEach(async () => {
      // Register a device for message testing
      const token = await deviceService.generateRegistrationToken(subscriberId);
      const device = await deviceService.registerDevice(token.token, {
        deviceName: 'Test Device',
        simCarrier: 'Globe',
        simNumber: '+639171111111',
      });
      deviceId = device.deviceId;

      // Make device online
      await deviceService.updateHeartbeat(deviceId, subscriberId);
    });

    it('should route message to online device end-to-end', async () => {
      // Step 1: Send message via API
      const messageData = {
        to: '+639179876543',
        body: 'Your OTP is 123456. Valid for 5 minutes.',
        webhookUrl: null,
        metadata: { purpose: 'otp', userId: 'user123' },
      };

      const sendResult = await messageService.sendMessage(subscriberId, messageData);

      expect(sendResult).toHaveProperty('messageId');
      expect(sendResult.status).toBe('QUEUED');
      expect(sendResult.to).toBe(messageData.to);

      // Step 2: Verify message in database
      const message = await testDb.getMessage(sendResult.messageId);
      expect(message).toBeTruthy();
      expect(message.subscriber_id).toBe(subscriberId);
      expect(message.to_number).toBe(messageData.to);
      expect(message.body).toBe(messageData.body);
      expect(message.status).toBe('QUEUED');
      expect(message.gateway_id).toBe(deviceId); // Should be assigned to our online device

      // Verify metadata
      expect(message.metadata).toBeTruthy();
      const metadata = typeof message.metadata === 'string'
        ? JSON.parse(message.metadata)
        : message.metadata;
      expect(metadata.purpose).toBe('otp');
      expect(metadata.userId).toBe('user123');
    });

    it('should select optimal device based on carrier matching', async () => {
      // Register second device with different carrier
      const token2 = await deviceService.generateRegistrationToken(subscriberId);
      const smartDevice = await deviceService.registerDevice(token2.token, {
        deviceName: 'Smart Device',
        simCarrier: 'Smart',
        simNumber: '+639181111111',
      });
      await deviceService.updateHeartbeat(smartDevice.deviceId, subscriberId);

      // Send message to Globe number - should route to Globe device
      const globeMessage = await messageService.sendMessage(subscriberId, {
        to: '+639171234567', // Globe prefix
        body: 'Test to Globe',
      });

      const globeMsg = await testDb.getMessage(globeMessage.messageId);
      expect(globeMsg.gateway_id).toBe(deviceId); // Should route to Globe device

      // Send message to Smart number - should route to Smart device
      const smartMessage = await messageService.sendMessage(subscriberId, {
        to: '+639181234567', // Smart prefix
        body: 'Test to Smart',
      });

      const smartMsg = await testDb.getMessage(smartMessage.messageId);
      expect(smartMsg.gateway_id).toBe(smartDevice.deviceId); // Should route to Smart device
    });

    it('should queue message when no devices are online', async () => {
      // Make device offline
      await testDb.updateDeviceStatus(deviceId, 'OFFLINE');

      // Send message
      const result = await messageService.sendMessage(subscriberId, {
        to: '+639179876543',
        body: 'Test message',
      });

      // Verify message is queued without device assignment
      const message = await testDb.getMessage(result.messageId);
      expect(message.status).toBe('QUEUED');
      expect(message.gateway_id).toBeNull(); // No device assigned
    });
  });

  describe('Complete Webhook Delivery Flow', () => {
    let deviceId: string;

    beforeEach(async () => {
      // Register and activate device
      const token = await deviceService.generateRegistrationToken(subscriberId);
      const device = await deviceService.registerDevice(token.token, {
        deviceName: 'Test Device',
      });
      deviceId = device.deviceId;
      await deviceService.updateHeartbeat(deviceId, subscriberId);

      // Mock successful webhook delivery
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { received: true },
      });
    });

    it('should deliver webhook after message is sent', async () => {
      const webhookUrl = 'https://example.com/webhook';

      // Send message with webhook
      const result = await messageService.sendMessage(subscriberId, {
        to: '+639179876543',
        body: 'Test message',
        webhookUrl,
      });

      // Simulate webhook delivery
      await webhookService.deliverWebhook(webhookUrl, {
        messageId: result.messageId,
        status: 'QUEUED',
        to: '+639179876543',
        timestamp: new Date().toISOString(),
      });

      // Verify webhook was called
      expect(mockedAxios.post).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          messageId: result.messageId,
          status: 'QUEUED',
        }),
        expect.objectContaining({
          timeout: 10000,
        })
      );

      // Verify webhook delivery in database
      const deliveries = await testDb.query(
        'SELECT * FROM webhook_deliveries WHERE message_id = $1',
        [result.messageId]
      );
      expect(deliveries.length).toBeGreaterThan(0);
      expect(deliveries[0].webhook_url).toBe(webhookUrl);
      expect(deliveries[0].success).toBe(true);
      expect(deliveries[0].attempts).toBe(1);
    });

    it('should retry failed webhook deliveries', async () => {
      const webhookUrl = 'https://example.com/webhook';

      // Mock first two attempts fail, third succeeds
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      // Attempt webhook delivery
      const result = await webhookService.deliverWebhook(webhookUrl, {
        messageId: 'msg-123',
        status: 'SENT',
      });

      // Should succeed after retries
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx client errors', async () => {
      const webhookUrl = 'https://example.com/webhook';

      // Mock 400 Bad Request
      const error: any = new Error('Bad Request');
      error.response = { status: 400 };
      mockedAxios.post.mockRejectedValueOnce(error);

      // Attempt webhook delivery
      const result = await webhookService.deliverWebhook(webhookUrl, {
        messageId: 'msg-123',
        status: 'SENT',
      });

      // Should fail without retry
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Complete Flow: Registration → Message → Webhook', () => {
    it('should complete the full end-to-end flow', async () => {
      const webhookUrl = 'https://example.com/webhook';

      // Mock webhook success
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      // Step 1: Generate registration token
      const token = await deviceService.generateRegistrationToken(subscriberId);
      expect(token.token).toMatch(/^cr_reg_/);

      // Step 2: Register device
      const device = await deviceService.registerDevice(token.token, {
        deviceName: 'Galaxy S21',
        simCarrier: 'Globe',
        simNumber: '+639171111111',
      });
      expect(device.deviceId).toBeTruthy();
      expect(device.deviceToken).toBeTruthy();

      // Step 3: Device sends heartbeat
      await deviceService.updateHeartbeat(device.deviceId, subscriberId);
      const onlineDevice = await testDb.getDevice(device.deviceId);
      expect(onlineDevice.status).toBe('ONLINE');

      // Step 4: Send message
      const message = await messageService.sendMessage(subscriberId, {
        to: '+639179876543',
        body: 'Your verification code is 123456',
        webhookUrl,
      });
      expect(message.messageId).toBeTruthy();
      expect(message.status).toBe('QUEUED');

      // Step 5: Verify message routing
      const messageInDb = await testDb.getMessage(message.messageId);
      expect(messageInDb.gateway_id).toBe(device.deviceId);
      expect(messageInDb.to_number).toBe('+639179876543');

      // Step 6: Deliver webhook
      await webhookService.deliverWebhook(webhookUrl, {
        messageId: message.messageId,
        status: 'SENT',
        to: '+639179876543',
        timestamp: new Date().toISOString(),
      });

      // Verify webhook delivery
      expect(mockedAxios.post).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          messageId: message.messageId,
          status: 'SENT',
        }),
        expect.any(Object)
      );

      // Verify complete flow in database
      const deliveries = await testDb.query(
        'SELECT * FROM webhook_deliveries WHERE message_id = $1',
        [message.messageId]
      );
      expect(deliveries[0].success).toBe(true);

      // Complete flow verified:
      // ✅ Token generated
      // ✅ Device registered
      // ✅ Device online
      // ✅ Message sent
      // ✅ Message routed to correct device
      // ✅ Webhook delivered successfully
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle device going offline mid-flow', async () => {
      // Register and activate device
      const token = await deviceService.generateRegistrationToken(subscriberId);
      const device = await deviceService.registerDevice(token.token, {
        deviceName: 'Test Device',
      });
      await deviceService.updateHeartbeat(device.deviceId, subscriberId);

      // Device is online
      let deviceStatus = await testDb.getDevice(device.deviceId);
      expect(deviceStatus.status).toBe('ONLINE');

      // Send first message - should succeed
      const msg1 = await messageService.sendMessage(subscriberId, {
        to: '+639171234567',
        body: 'First message',
      });
      const message1 = await testDb.getMessage(msg1.messageId);
      expect(message1.gateway_id).toBe(device.deviceId);

      // Device goes offline
      await testDb.updateDeviceStatus(device.deviceId, 'OFFLINE');

      // Send second message - should queue without device
      const msg2 = await messageService.sendMessage(subscriberId, {
        to: '+639171234568',
        body: 'Second message',
      });
      const message2 = await testDb.getMessage(msg2.messageId);
      expect(message2.gateway_id).toBeNull();
      expect(message2.status).toBe('QUEUED');
    });

    it('should handle expired registration token', async () => {
      // Generate token
      const token = await deviceService.generateRegistrationToken(subscriberId);

      // Manually expire the token in database
      await testDb.query(
        'UPDATE device_registration_tokens SET expires_at = NOW() - INTERVAL \'1 hour\' WHERE token = $1',
        [token.token]
      );

      // Try to register with expired token
      await expect(
        deviceService.registerDevice(token.token, {
          deviceName: 'Test Device',
        })
      ).rejects.toThrow(/expired/i);
    });

    it('should handle reusing a registration token', async () => {
      // Generate and use token
      const token = await deviceService.generateRegistrationToken(subscriberId);
      await deviceService.registerDevice(token.token, {
        deviceName: 'First Device',
      });

      // Try to use same token again
      await expect(
        deviceService.registerDevice(token.token, {
          deviceName: 'Second Device',
        })
      ).rejects.toThrow(/already been used/i);
    });
  });
});
