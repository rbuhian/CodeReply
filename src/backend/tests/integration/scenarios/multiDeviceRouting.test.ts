/**
 * Integration Test: Multi-Device Routing Scenarios
 *
 * Tests complex routing scenarios with multiple devices:
 * - Load balancing across devices
 * - Carrier matching and fallback
 * - Device prioritization
 * - Concurrent message handling
 * - Device failure scenarios
 *
 * Validates the device selection algorithm under real-world conditions.
 */

import { TestDatabase, getTestDatabase, closeTestDatabase } from '../../helpers/testDatabaseSetup';
import * as messageService from '../../../services/messageService';
import * as deviceService from '../../../services/deviceService';

describe('Integration: Multi-Device Routing Scenarios', () => {
  let testDb: TestDatabase;
  let subscriberId: string;
  let devices: Array<{ id: string; carrier: string; number: string }> = [];

  beforeAll(async () => {
    testDb = getTestDatabase();
  });

  beforeEach(async () => {
    // Clean database
    await testDb.cleanDatabase();

    // Create test subscriber with Pro plan (5 devices max)
    const subscriber = await testDb.createSubscriber({
      name: 'Multi-Device Test Subscriber',
      email: 'multidevice@test.com',
      plan: 'pro',
      daily_quota: 10000,
      max_devices: 5,
    });
    subscriberId = subscriber.id;

    // Reset devices array
    devices = [];
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  /**
   * Helper: Register and activate multiple devices
   */
  async function registerDevices(count: number, carriers: string[] = ['Globe', 'Smart', 'Globe', 'Smart', 'Sun']) {
    const registered = [];

    for (let i = 0; i < count; i++) {
      const carrier = carriers[i % carriers.length];
      const prefix = carrier === 'Globe' ? '+6391712' : carrier === 'Smart' ? '+6391812' : '+6394212';
      const number = `${prefix}${String(i).padStart(5, '0')}`;

      const token = await deviceService.generateRegistrationToken(subscriberId);
      const device = await deviceService.registerDevice(token.token, {
        deviceName: `${carrier} Device ${i + 1}`,
        simCarrier: carrier,
        simNumber: number,
      });

      // Make device online
      await deviceService.updateHeartbeat(device.deviceId, subscriberId);

      registered.push({
        id: device.deviceId,
        carrier,
        number,
      });
    }

    devices = registered;
    return registered;
  }

  /**
   * Helper: Send multiple messages
   */
  async function sendMessages(count: number, toNumbers: string[]) {
    const results = [];

    for (let i = 0; i < count; i++) {
      const to = toNumbers[i % toNumbers.length];
      const result = await messageService.sendMessage(subscriberId, {
        to,
        body: `Test message ${i + 1}`,
      });
      results.push(result);
    }

    return results;
  }

  describe('Load Balancing Across Devices', () => {
    it('should distribute messages across multiple devices', async () => {
      // Register 3 devices with same carrier
      await registerDevices(3, ['Globe', 'Globe', 'Globe']);

      // Send 30 messages
      const messages = await sendMessages(30, ['+639171234567']);

      // Get message distribution
      const distribution = new Map<string, number>();
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        const deviceId = message.gateway_id;
        distribution.set(deviceId, (distribution.get(deviceId) || 0) + 1);
      }

      // All 3 devices should have received messages
      expect(distribution.size).toBe(3);

      // Each device should have roughly 10 messages (±5)
      for (const count of distribution.values()) {
        expect(count).toBeGreaterThanOrEqual(5);
        expect(count).toBeLessThanOrEqual(15);
      }
    });

    it('should handle uneven device availability', async () => {
      // Register 3 devices
      await registerDevices(3, ['Globe', 'Globe', 'Globe']);

      // Make one device offline
      await testDb.updateDeviceStatus(devices[2].id, 'OFFLINE');

      // Send 20 messages
      const messages = await sendMessages(20, ['+639171234567']);

      // Get message distribution
      const distribution = new Map<string, number>();
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        const deviceId = message.gateway_id;
        distribution.set(deviceId, (distribution.get(deviceId) || 0) + 1);
      }

      // Only 2 online devices should have received messages
      expect(distribution.size).toBe(2);
      expect(distribution.has(devices[2].id)).toBe(false);

      // Messages should be distributed across 2 devices
      for (const [deviceId, count] of distribution.entries()) {
        expect(count).toBeGreaterThanOrEqual(8);
        expect(count).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('Carrier Matching and Routing', () => {
    it('should prefer same-carrier devices for routing', async () => {
      // Register 1 Globe and 1 Smart device
      await registerDevices(2, ['Globe', 'Smart']);

      // Send 10 messages to Globe numbers
      const globeMessages = await sendMessages(10, ['+639171111111', '+639171111112', '+639171111113']);

      // All should route to Globe device
      for (const msg of globeMessages) {
        const message = await testDb.getMessage(msg.messageId);
        const device = await testDb.getDevice(message.gateway_id);
        expect(device.sim_carrier).toBe('Globe');
      }

      // Send 10 messages to Smart numbers
      const smartMessages = await sendMessages(10, ['+639181111111', '+639181111112', '+639181111113']);

      // All should route to Smart device
      for (const msg of smartMessages) {
        const message = await testDb.getMessage(msg.messageId);
        const device = await testDb.getDevice(message.gateway_id);
        expect(device.sim_carrier).toBe('Smart');
      }
    });

    it('should fallback to any available device when no carrier match', async () => {
      // Register only Globe devices
      await registerDevices(2, ['Globe', 'Globe']);

      // Send message to Smart number
      const result = await messageService.sendMessage(subscriberId, {
        to: '+639181234567', // Smart number
        body: 'Test message',
      });

      // Should still assign to a Globe device
      const message = await testDb.getMessage(result.messageId);
      expect(message.gateway_id).toBeTruthy();

      const device = await testDb.getDevice(message.gateway_id);
      expect(device.sim_carrier).toBe('Globe');
    });

    it('should handle multiple carriers with carrier-specific routing', async () => {
      // Register 2 of each carrier
      await registerDevices(4, ['Globe', 'Smart', 'Globe', 'Smart']);

      const testCases = [
        { to: '+639171234567', expectedCarrier: 'Globe' },
        { to: '+639181234567', expectedCarrier: 'Smart' },
        { to: '+639172345678', expectedCarrier: 'Globe' },
        { to: '+639182345678', expectedCarrier: 'Smart' },
      ];

      for (const testCase of testCases) {
        const result = await messageService.sendMessage(subscriberId, {
          to: testCase.to,
          body: 'Test',
        });

        const message = await testDb.getMessage(result.messageId);
        const device = await testDb.getDevice(message.gateway_id);
        expect(device.sim_carrier).toBe(testCase.expectedCarrier);
      }
    });
  });

  describe('Device Prioritization and Selection', () => {
    it('should prioritize recently active devices', async () => {
      // Register 3 devices
      await registerDevices(3);

      // Update last_heartbeat to create priority
      await testDb.query(
        'UPDATE gateway_devices SET last_heartbeat = NOW() - INTERVAL \'10 minutes\' WHERE id = $1',
        [devices[0].id]
      );
      await testDb.query(
        'UPDATE gateway_devices SET last_heartbeat = NOW() - INTERVAL \'5 minutes\' WHERE id = $1',
        [devices[1].id]
      );
      await testDb.query(
        'UPDATE gateway_devices SET last_heartbeat = NOW() WHERE id = $1',
        [devices[2].id]
      );

      // Send 10 messages
      const messages = await sendMessages(10, ['+639171234567']);

      // Most recent device should get more messages
      const distribution = new Map<string, number>();
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        distribution.set(message.gateway_id, (distribution.get(message.gateway_id) || 0) + 1);
      }

      // Most recent device (devices[2]) should have highest count
      const recentDeviceCount = distribution.get(devices[2].id) || 0;
      const oldDeviceCount = distribution.get(devices[0].id) || 0;

      expect(recentDeviceCount).toBeGreaterThanOrEqual(oldDeviceCount);
    });

    it('should skip disabled devices', async () => {
      // Register 3 devices
      await registerDevices(3);

      // Disable middle device
      await testDb.query(
        'UPDATE gateway_devices SET is_enabled = false WHERE id = $1',
        [devices[1].id]
      );

      // Send messages
      const messages = await sendMessages(20, ['+639171234567']);

      // Disabled device should not receive any messages
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        expect(message.gateway_id).not.toBe(devices[1].id);
      }
    });

    it('should skip deleted devices', async () => {
      // Register 3 devices
      await registerDevices(3);

      // Soft delete one device
      await testDb.softDeleteDevice(devices[1].id);

      // Send messages
      const messages = await sendMessages(20, ['+639171234567']);

      // Deleted device should not receive any messages
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        expect(message.gateway_id).not.toBe(devices[1].id);
      }
    });
  });

  describe('Concurrent Message Handling', () => {
    it('should handle concurrent message sends to multiple devices', async () => {
      // Register 3 devices
      await registerDevices(3);

      // Send 30 messages concurrently
      const promises = [];
      for (let i = 0; i < 30; i++) {
        promises.push(
          messageService.sendMessage(subscriberId, {
            to: `+6391712${String(i).padStart(5, '0')}`,
            body: `Concurrent message ${i}`,
          })
        );
      }

      const results = await Promise.all(promises);

      // All messages should succeed
      expect(results.length).toBe(30);
      for (const result of results) {
        expect(result.messageId).toBeTruthy();
        expect(result.status).toBe('QUEUED');
      }

      // Messages should be distributed across devices
      const distribution = new Map<string, number>();
      for (const result of results) {
        const message = await testDb.getMessage(result.messageId);
        distribution.set(message.gateway_id, (distribution.get(message.gateway_id) || 0) + 1);
      }

      // All 3 devices should have messages
      expect(distribution.size).toBe(3);
    });

    it('should maintain message order per device', async () => {
      // Register 1 device
      await registerDevices(1);

      // Send 10 messages sequentially
      const messageIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = await messageService.sendMessage(subscriberId, {
          to: '+639171234567',
          body: `Message ${i}`,
        });
        messageIds.push(result.messageId);
      }

      // Verify messages in database maintain order
      const messages = await testDb.query(
        'SELECT id, body, queued_at FROM messages WHERE subscriber_id = $1 ORDER BY queued_at ASC',
        [subscriberId]
      );

      expect(messages.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(messages[i].body).toBe(`Message ${i}`);
      }
    });
  });

  describe('Device Failure and Recovery Scenarios', () => {
    it('should reroute messages when device goes offline', async () => {
      // Register 3 devices
      await registerDevices(3);

      // Send first batch of messages
      const batch1 = await sendMessages(10, ['+639171234567']);

      // Make first device offline
      await testDb.updateDeviceStatus(devices[0].id, 'OFFLINE');

      // Send second batch
      const batch2 = await sendMessages(10, ['+639171234567']);

      // Second batch should not go to offline device
      for (const msg of batch2) {
        const message = await testDb.getMessage(msg.messageId);
        expect(message.gateway_id).not.toBe(devices[0].id);
      }
    });

    it('should handle all devices going offline', async () => {
      // Register 2 devices
      await registerDevices(2);

      // Make all devices offline
      await testDb.updateDeviceStatus(devices[0].id, 'OFFLINE');
      await testDb.updateDeviceStatus(devices[1].id, 'OFFLINE');

      // Send messages
      const messages = await sendMessages(5, ['+639171234567']);

      // All messages should be queued without device assignment
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        expect(message.status).toBe('QUEUED');
        expect(message.gateway_id).toBeNull();
      }
    });

    it('should reassign messages when device comes back online', async () => {
      // Register 2 devices
      await registerDevices(2);

      // Make all devices offline
      await testDb.updateDeviceStatus(devices[0].id, 'OFFLINE');
      await testDb.updateDeviceStatus(devices[1].id, 'OFFLINE');

      // Send message - should queue without device
      const result = await messageService.sendMessage(subscriberId, {
        to: '+639171234567',
        body: 'Test message',
      });

      let message = await testDb.getMessage(result.messageId);
      expect(message.gateway_id).toBeNull();

      // Bring device back online
      await deviceService.updateHeartbeat(devices[0].id, subscriberId);

      // Send another message - should now route to online device
      const result2 = await messageService.sendMessage(subscriberId, {
        to: '+639171234568',
        body: 'Test message 2',
      });

      const message2 = await testDb.getMessage(result2.messageId);
      expect(message2.gateway_id).toBe(devices[0].id);
    });
  });

  describe('High-Volume Scenarios', () => {
    it('should handle 100 messages across 5 devices', async () => {
      // Register maximum devices for Pro plan
      await registerDevices(5);

      // Send 100 messages
      const messages = await sendMessages(100, ['+639171234567']);

      // All messages should be assigned
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        expect(message.gateway_id).toBeTruthy();
        expect(message.status).toBe('QUEUED');
      }

      // Messages should be evenly distributed
      const distribution = new Map<string, number>();
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        distribution.set(message.gateway_id, (distribution.get(message.gateway_id) || 0) + 1);
      }

      // All 5 devices should have messages
      expect(distribution.size).toBe(5);

      // Each device should have roughly 20 messages (±10)
      for (const count of distribution.values()) {
        expect(count).toBeGreaterThanOrEqual(10);
        expect(count).toBeLessThanOrEqual(30);
      }
    });

    it('should handle mixed carrier traffic', async () => {
      // Register multiple devices of each carrier
      await registerDevices(4, ['Globe', 'Smart', 'Globe', 'Smart']);

      // Prepare mixed numbers
      const numbers = [
        '+639171111111', // Globe
        '+639181111111', // Smart
        '+639172222222', // Globe
        '+639182222222', // Smart
        '+639173333333', // Globe
        '+639183333333', // Smart
      ];

      // Send 60 messages with mixed carriers
      const messages = await sendMessages(60, numbers);

      // Count messages by carrier
      const carrierCounts = new Map<string, number>();
      for (const msg of messages) {
        const message = await testDb.getMessage(msg.messageId);
        const device = await testDb.getDevice(message.gateway_id);
        const carrier = device.sim_carrier;
        carrierCounts.set(carrier, (carrierCounts.get(carrier) || 0) + 1);
      }

      // Both carriers should have messages
      expect(carrierCounts.size).toBe(2);

      // Should be roughly 50/50 split (±10)
      const globeCount = carrierCounts.get('Globe') || 0;
      const smartCount = carrierCounts.get('Smart') || 0;

      expect(globeCount).toBeGreaterThanOrEqual(20);
      expect(globeCount).toBeLessThanOrEqual(40);
      expect(smartCount).toBeGreaterThanOrEqual(20);
      expect(smartCount).toBeLessThanOrEqual(40);
    });
  });
});
