/**
 * Device Service
 * Business logic for device registration and management
 * Author: Bernadette (API Engineer)
 * Date: April 4, 2026
 */

import { pool } from '../config/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const REGISTRATION_TOKEN_EXPIRY_HOURS = 1;

/**
 * Device registration token response
 */
export interface RegistrationToken {
  token: string;
  tokenId: string;
  expiresAt: Date;
  expiresIn: number;
}

/**
 * Device registration response
 */
export interface RegisteredDevice {
  deviceId: string;
  deviceToken: string;
  subscriberId: string;
  deviceName: string;
}

/**
 * Generate a registration token for device enrollment
 *
 * @param subscriberId - UUID of the subscriber generating the token
 * @param label - Optional label for tracking
 * @returns Registration token data
 */
export async function generateRegistrationToken(
  subscriberId: string,
  label?: string
): Promise<RegistrationToken> {
  try {
    // Check if subscriber has reached device quota
    const quotaCheck = await pool.query(
      `SELECT device_count, max_devices FROM subscribers WHERE id = $1`,
      [subscriberId]
    );

    if (quotaCheck.rows.length === 0) {
      throw new Error('Subscriber not found');
    }

    const { device_count, max_devices } = quotaCheck.rows[0];

    if (device_count >= max_devices) {
      throw new Error(
        `Device quota exceeded. Current: ${device_count}, Maximum: ${max_devices}`
      );
    }

    // Generate random token value (32 bytes = 64 hex chars)
    const tokenValue = crypto.randomBytes(32).toString('hex');
    const token = `cr_reg_${tokenValue}`;

    // Hash the token for storage (same pattern as API keys)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + REGISTRATION_TOKEN_EXPIRY_HOURS);

    // Store token in database
    const result = await pool.query(
      `INSERT INTO registration_tokens (
        subscriber_id,
        token_hash,
        expires_at,
        metadata
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, expires_at`,
      [
        subscriberId,
        tokenHash,
        expiresAt,
        label ? JSON.stringify({ label }) : null,
      ]
    );

    const tokenId = result.rows[0].id;
    const expiresIn = REGISTRATION_TOKEN_EXPIRY_HOURS * 3600; // seconds

    logger.info('Registration token generated', {
      subscriberId,
      tokenId,
      expiresAt,
      label,
    });

    return {
      token,
      tokenId,
      expiresAt,
      expiresIn,
    };
  } catch (error) {
    logger.error('Failed to generate registration token', {
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Register a device using a registration token
 *
 * @param registrationToken - The registration token from generateRegistrationToken
 * @param deviceData - Device information (name, SIM, versions)
 * @returns Registered device with JWT token
 */
export async function registerDevice(
  registrationToken: string,
  deviceData: {
    deviceName: string;
    simCarrier?: string;
    simNumber?: string;
    androidVersion?: string;
    appVersion?: string;
  }
): Promise<RegisteredDevice> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Hash the token to look it up
    const tokenHash = crypto.createHash('sha256').update(registrationToken).digest('hex');

    // Validate token and get subscriber info
    const tokenResult = await client.query(
      `SELECT
        id,
        subscriber_id,
        used,
        expires_at,
        revoked_at
      FROM registration_tokens
      WHERE token_hash = $1`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      throw new Error('Invalid registration token');
    }

    const token = tokenResult.rows[0];

    // Validate token status
    if (token.used) {
      throw new Error('Registration token has already been used');
    }

    if (new Date(token.expires_at) < new Date()) {
      throw new Error('Registration token has expired');
    }

    if (token.revoked_at) {
      throw new Error('Registration token has been revoked');
    }

    // Check device quota again (race condition protection)
    const quotaCheck = await client.query(
      `SELECT device_count, max_devices FROM subscribers WHERE id = $1`,
      [token.subscriber_id]
    );

    const { device_count, max_devices } = quotaCheck.rows[0];

    if (device_count >= max_devices) {
      throw new Error(
        `Device quota exceeded. Current: ${device_count}, Maximum: ${max_devices}`
      );
    }

    // Create the device record
    const deviceResult = await client.query(
      `INSERT INTO gateway_devices (
        subscriber_id,
        name,
        sim_carrier,
        sim_number,
        android_version,
        app_version,
        status,
        last_heartbeat
      ) VALUES ($1, $2, $3, $4, $5, $6, 'OFFLINE', NOW())
      RETURNING id, subscriber_id, name`,
      [
        token.subscriber_id,
        deviceData.deviceName,
        deviceData.simCarrier || null,
        deviceData.simNumber || null,
        deviceData.androidVersion || null,
        deviceData.appVersion || null,
      ]
    );

    const device = deviceResult.rows[0];

    // Mark token as used
    await client.query(
      `UPDATE registration_tokens
       SET used = TRUE, used_by_device = $1
       WHERE id = $2`,
      [device.id, token.id]
    );

    // Generate JWT device token
    const deviceToken = jwt.sign(
      {
        deviceId: device.id,
        subscriberId: device.subscriber_id,
        deviceName: device.name,
        type: 'device',
      },
      JWT_SECRET,
      {
        expiresIn: '365d', // Device tokens last 1 year
        issuer: 'codereply-api',
        subject: device.id,
      }
    );

    await client.query('COMMIT');

    logger.info('Device registered successfully', {
      deviceId: device.id,
      subscriberId: device.subscriber_id,
      deviceName: device.name,
    });

    return {
      deviceId: device.id,
      deviceToken,
      subscriberId: device.subscriber_id,
      deviceName: device.name,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    logger.error('Failed to register device', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get subscriber's device quota information
 *
 * @param subscriberId - UUID of the subscriber
 * @returns Device quota details
 */
export async function getDeviceQuota(subscriberId: string): Promise<{
  current: number;
  maximum: number;
  available: number;
}> {
  const result = await pool.query(
    `SELECT device_count, max_devices FROM subscribers WHERE id = $1`,
    [subscriberId]
  );

  if (result.rows.length === 0) {
    throw new Error('Subscriber not found');
  }

  const { device_count, max_devices } = result.rows[0];

  return {
    current: device_count,
    maximum: max_devices,
    available: Math.max(0, max_devices - device_count),
  };
}

/**
 * Device information with statistics
 */
export interface Device {
  id: string;
  subscriberId: string;
  name: string;
  simCarrier: string | null;
  simNumber: string | null;
  androidVersion: string | null;
  appVersion: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  lastHeartbeat: Date;
  createdAt: Date;
  totalMessagesSent: number;
  totalMessagesFailed: number;
}

/**
 * Device list query options
 */
export interface ListDevicesOptions {
  status?: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'ALL';
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'name' | 'last_heartbeat' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Device list response
 */
export interface DeviceListResponse {
  devices: Device[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * List all devices for a subscriber with filtering and pagination
 *
 * @param subscriberId - UUID of the subscriber
 * @param options - Query options for filtering and pagination
 * @returns List of devices with pagination info
 */
export async function listDevices(
  subscriberId: string,
  options: ListDevicesOptions = {}
): Promise<DeviceListResponse> {
  try {
    const {
      status = 'ALL',
      limit = 20,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    // Build WHERE clause
    let whereClause = 'WHERE subscriber_id = $1 AND deleted_at IS NULL';
    const params: any[] = [subscriberId];

    if (status !== 'ALL') {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM gateway_devices ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get devices with pagination
    const validSortColumns = ['created_at', 'name', 'last_heartbeat', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    params.push(limit, offset);
    const devicesResult = await pool.query(
      `SELECT
        id,
        subscriber_id,
        name,
        sim_carrier,
        sim_number,
        android_version,
        app_version,
        status,
        last_heartbeat,
        created_at,
        total_messages_sent,
        total_messages_failed
      FROM gateway_devices
      ${whereClause}
      ORDER BY ${sortColumn} ${validSortOrder}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const devices: Device[] = devicesResult.rows.map((row) => ({
      id: row.id,
      subscriberId: row.subscriber_id,
      name: row.name,
      simCarrier: row.sim_carrier,
      simNumber: row.sim_number,
      androidVersion: row.android_version,
      appVersion: row.app_version,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      totalMessagesSent: row.total_messages_sent || 0,
      totalMessagesFailed: row.total_messages_failed || 0,
    }));

    logger.info('Devices listed', {
      subscriberId,
      total,
      returned: devices.length,
      filters: { status, limit, offset },
    });

    return {
      devices,
      total,
      limit,
      offset,
    };
  } catch (error) {
    logger.error('Failed to list devices', {
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get a single device by ID
 *
 * @param deviceId - UUID of the device
 * @param subscriberId - UUID of the subscriber (for ownership validation)
 * @returns Device information
 * @throws Error if device not found or subscriber doesn't own it
 */
export async function getDevice(
  deviceId: string,
  subscriberId: string
): Promise<Device> {
  try {
    const result = await pool.query(
      `SELECT
        id,
        subscriber_id,
        name,
        sim_carrier,
        sim_number,
        android_version,
        app_version,
        status,
        last_heartbeat,
        created_at,
        total_messages_sent,
        total_messages_failed
      FROM gateway_devices
      WHERE id = $1 AND deleted_at IS NULL`,
      [deviceId]
    );

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    const row = result.rows[0];

    // Validate ownership
    if (row.subscriber_id !== subscriberId) {
      throw new Error('Unauthorized: Device belongs to another subscriber');
    }

    logger.info('Device retrieved', {
      deviceId,
      subscriberId,
    });

    return {
      id: row.id,
      subscriberId: row.subscriber_id,
      name: row.name,
      simCarrier: row.sim_carrier,
      simNumber: row.sim_number,
      androidVersion: row.android_version,
      appVersion: row.app_version,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      totalMessagesSent: row.total_messages_sent || 0,
      totalMessagesFailed: row.total_messages_failed || 0,
    };
  } catch (error) {
    logger.error('Failed to get device', {
      deviceId,
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Update device settings
 *
 * @param deviceId - UUID of the device
 * @param subscriberId - UUID of the subscriber (for ownership validation)
 * @param updates - Fields to update
 * @returns Updated device information
 */
export async function updateDevice(
  deviceId: string,
  subscriberId: string,
  updates: {
    name?: string;
    simCarrier?: string;
    simNumber?: string | null;
  }
): Promise<Device> {
  try {
    // First verify ownership
    const existingDevice = await getDevice(deviceId, subscriberId);

    // Build update query
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }

    if (updates.simCarrier !== undefined) {
      updateFields.push(`sim_carrier = $${paramIndex++}`);
      params.push(updates.simCarrier);
    }

    if (updates.simNumber !== undefined) {
      updateFields.push(`sim_number = $${paramIndex++}`);
      params.push(updates.simNumber);
    }

    if (updateFields.length === 0) {
      // No fields to update, return existing device
      return existingDevice;
    }

    params.push(deviceId);
    const result = await pool.query(
      `UPDATE gateway_devices
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING
         id,
         subscriber_id,
         name,
         sim_carrier,
         sim_number,
         android_version,
         app_version,
         status,
         last_heartbeat,
         created_at,
         total_messages_sent,
         total_messages_failed`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Device not found or already deleted');
    }

    const row = result.rows[0];

    logger.info('Device updated', {
      deviceId,
      subscriberId,
      updates: Object.keys(updates),
    });

    return {
      id: row.id,
      subscriberId: row.subscriber_id,
      name: row.name,
      simCarrier: row.sim_carrier,
      simNumber: row.sim_number,
      androidVersion: row.android_version,
      appVersion: row.app_version,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      totalMessagesSent: row.total_messages_sent || 0,
      totalMessagesFailed: row.total_messages_failed || 0,
    };
  } catch (error) {
    logger.error('Failed to update device', {
      deviceId,
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Soft delete a device
 *
 * @param deviceId - UUID of the device
 * @param subscriberId - UUID of the subscriber (for ownership validation)
 * @returns Success status
 */
export async function deleteDevice(
  deviceId: string,
  subscriberId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // First verify ownership
    await getDevice(deviceId, subscriberId);

    // Soft delete the device
    const result = await pool.query(
      `UPDATE gateway_devices
       SET deleted_at = NOW()
       WHERE id = $1 AND subscriber_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [deviceId, subscriberId]
    );

    if (result.rows.length === 0) {
      throw new Error('Device not found or already deleted');
    }

    logger.info('Device deleted', {
      deviceId,
      subscriberId,
    });

    return {
      success: true,
      message: 'Device deleted successfully',
    };
  } catch (error) {
    logger.error('Failed to delete device', {
      deviceId,
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
