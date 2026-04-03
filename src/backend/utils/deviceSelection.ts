/**
 * Device Selection Utility
 *
 * Implements algorithms for selecting the optimal device for message dispatch
 * with strict subscriber isolation (BYOD model)
 *
 * @module utils/deviceSelection
 */

import { createClient } from 'redis';
import {
  GatewayDevice,
  DeviceWithLoad,
  DeviceSelectionOptions,
  NoDeviceAvailableError,
  UnauthorizedDeviceAccessError,
  Message,
} from '../types';

// Redis client for load tracking
let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Initialize Redis client for device load tracking
 */
export async function initializeRedis(url: string): Promise<void> {
  redisClient = createClient({ url });
  await redisClient.connect();
}

/**
 * Get Redis client instance
 */
function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

/**
 * Get subscriber's available devices
 *
 * CRITICAL: This function ALWAYS filters by subscriber_id to ensure
 * messages only route to the subscriber's own devices (BYOD isolation)
 *
 * @param db - Database connection
 * @param subscriberId - Subscriber UUID
 * @param filters - Optional filters (carrier, specific device, etc.)
 * @returns Array of available devices owned by the subscriber
 */
export async function getSubscriberDevices(
  db: any,
  subscriberId: string,
  filters?: {
    status?: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
    carrier?: string;
    deviceId?: string;
  }
): Promise<GatewayDevice[]> {
  // SECURITY: Build query with subscriber_id filter (MANDATORY)
  const query: any = {
    subscriber_id: subscriberId, // CRITICAL: Ensures BYOD isolation
    deleted_at: null,
  };

  // Add optional filters
  if (filters?.status) {
    query.status = filters.status;
  }

  if (filters?.carrier) {
    query.sim_carrier = filters.carrier;
  }

  if (filters?.deviceId) {
    query.id = filters.deviceId;
  }

  // Query database
  const devices = await db.gateway_devices.findAll({
    where: query,
    order: [['last_heartbeat', 'DESC']],
  });

  return devices;
}

/**
 * Get current load for a device (in-flight messages)
 *
 * @param deviceId - Device UUID
 * @returns Number of messages currently being processed by device
 */
async function getDeviceLoad(deviceId: string): Promise<number> {
  const redis = getRedisClient();
  const load = await redis.get(`device:${deviceId}:load`);
  return load ? parseInt(load, 10) : 0;
}

/**
 * Increment device load counter
 *
 * @param deviceId - Device UUID
 * @param ttl - Time-to-live in seconds (default: 3600)
 */
export async function incrementDeviceLoad(deviceId: string, ttl: number = 3600): Promise<void> {
  const redis = getRedisClient();
  await redis.incr(`device:${deviceId}:load`);
  await redis.expire(`device:${deviceId}:load`, ttl);
}

/**
 * Decrement device load counter
 *
 * @param deviceId - Device UUID
 */
export async function decrementDeviceLoad(deviceId: string): Promise<void> {
  const redis = getRedisClient();
  const currentLoad = await getDeviceLoad(deviceId);

  if (currentLoad > 0) {
    await redis.decr(`device:${deviceId}:load`);
  }
}

/**
 * Get devices with their current load
 *
 * @param devices - Array of gateway devices
 * @returns Array of devices with inFlightMessages count
 */
async function getDevicesWithLoad(devices: GatewayDevice[]): Promise<DeviceWithLoad[]> {
  const devicesWithLoad = await Promise.all(
    devices.map(async (device) => {
      const inFlightMessages = await getDeviceLoad(device.id);
      return {
        ...device,
        inFlightMessages,
      };
    })
  );

  return devicesWithLoad;
}

/**
 * Select optimal device for message dispatch
 *
 * Algorithm:
 * 1. Filter by carrier match (if recipient carrier is known)
 * 2. Sort by least load (fewest in-flight messages)
 * 3. Consider device health (last heartbeat)
 * 4. Return device with best score
 *
 * @param devices - Array of available devices
 * @param message - Message to be sent
 * @param options - Selection options
 * @returns Selected device
 * @throws {NoDeviceAvailableError} If no suitable device found
 */
export async function selectOptimalDevice(
  devices: GatewayDevice[],
  message: Message,
  options?: DeviceSelectionOptions
): Promise<GatewayDevice> {
  if (devices.length === 0) {
    throw new NoDeviceAvailableError(
      message.subscriber_id,
      'No online devices available for this subscriber'
    );
  }

  let candidateDevices = devices;

  // STEP 1: If preferred device specified, try to use it
  if (options?.preferredDeviceId) {
    const preferredDevice = devices.find((d) => d.id === options.preferredDeviceId);
    if (preferredDevice && preferredDevice.status === 'ONLINE') {
      return preferredDevice;
    }
  }

  // STEP 2: Exclude devices if specified
  if (options?.excludeDeviceIds && options.excludeDeviceIds.length > 0) {
    candidateDevices = candidateDevices.filter(
      (d) => !options.excludeDeviceIds!.includes(d.id)
    );

    if (candidateDevices.length === 0) {
      throw new NoDeviceAvailableError(
        message.subscriber_id,
        'All available devices have been excluded'
      );
    }
  }

  // STEP 3: Carrier matching (optional optimization)
  if (options?.preferredCarrier) {
    const carrierMatches = candidateDevices.filter(
      (d) => d.sim_carrier === options.preferredCarrier
    );

    // Use carrier matches if available, otherwise use all candidates
    if (carrierMatches.length > 0) {
      candidateDevices = carrierMatches;
    }
  }

  // STEP 4: Get current load for each device
  const devicesWithLoad = await getDevicesWithLoad(candidateDevices);

  // STEP 5: Sort by load (ascending) - select least loaded device
  devicesWithLoad.sort((a, b) => {
    // Primary: Sort by load
    if (a.inFlightMessages !== b.inFlightMessages) {
      return a.inFlightMessages - b.inFlightMessages;
    }

    // Secondary: Prefer device with more recent heartbeat
    const aHeartbeat = a.last_heartbeat ? a.last_heartbeat.getTime() : 0;
    const bHeartbeat = b.last_heartbeat ? b.last_heartbeat.getTime() : 0;
    return bHeartbeat - aHeartbeat;
  });

  // STEP 6: Select the best device
  const selectedDevice = devicesWithLoad[0];

  return {
    id: selectedDevice.id,
    subscriber_id: selectedDevice.subscriber_id,
    name: selectedDevice.name,
    device_label: selectedDevice.device_label,
    device_token: selectedDevice.device_token,
    sim_carrier: selectedDevice.sim_carrier,
    sim_number: selectedDevice.sim_number,
    status: selectedDevice.status,
    is_enabled: selectedDevice.is_enabled,
    last_heartbeat: selectedDevice.last_heartbeat,
    app_version: selectedDevice.app_version,
    android_version: selectedDevice.android_version,
    total_messages_sent: selectedDevice.total_messages_sent,
    total_messages_failed: selectedDevice.total_messages_failed,
    notes: selectedDevice.notes,
    registered_at: selectedDevice.registered_at,
    updated_at: selectedDevice.updated_at,
    deleted_at: selectedDevice.deleted_at,
  };
}

/**
 * Validate device ownership
 *
 * SECURITY: Ensures that the device belongs to the message's subscriber
 * This prevents cross-subscriber routing attempts
 *
 * @param message - Message to be dispatched
 * @param device - Device to validate
 * @throws {UnauthorizedDeviceAccessError} If device doesn't belong to subscriber
 */
export function validateDeviceOwnership(message: Message, device: GatewayDevice): void {
  if (device.subscriber_id !== message.subscriber_id) {
    throw new UnauthorizedDeviceAccessError(
      device.id,
      message.subscriber_id
    );
  }
}

/**
 * Detect carrier from phone number (optional optimization)
 *
 * This is a simple implementation. In production, you might use a
 * carrier lookup service or database.
 *
 * @param phoneNumber - Phone number to analyze
 * @returns Carrier name or null if unknown
 */
export function detectCarrier(phoneNumber: string): string | null {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // Philippine mobile number patterns (example)
  if (digits.startsWith('63917') || digits.startsWith('63926') || digits.startsWith('63927')) {
    return 'Globe Telecom';
  }

  if (digits.startsWith('63918') || digits.startsWith('63919') || digits.startsWith('63920')) {
    return 'Smart Communications';
  }

  // Add more patterns as needed
  return null;
}

/**
 * Get device statistics for monitoring
 *
 * @param db - Database connection
 * @param subscriberId - Subscriber UUID
 * @returns Device statistics
 */
export async function getDeviceStatistics(
  db: any,
  subscriberId: string
): Promise<{
  total: number;
  online: number;
  offline: number;
  degraded: number;
}> {
  const devices = await getSubscriberDevices(db, subscriberId);

  return {
    total: devices.length,
    online: devices.filter((d) => d.status === 'ONLINE').length,
    offline: devices.filter((d) => d.status === 'OFFLINE').length,
    degraded: devices.filter((d) => d.status === 'DEGRADED').length,
  };
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
