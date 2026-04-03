/**
 * CodeReply Backend Type Definitions
 *
 * Core types for the BYOD message routing system
 */

export interface Subscriber {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  daily_quota: number;
  max_devices: number;
  device_count: number;
  webhook_secret?: string;
  created_at: Date;
  updated_at: Date;
}

export interface GatewayDevice {
  id: string;
  subscriber_id: string;
  name: string;
  device_label?: string;
  device_token: string;
  sim_carrier?: string;
  sim_number?: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  is_enabled: boolean;
  last_heartbeat?: Date;
  app_version?: string;
  android_version?: string;
  total_messages_sent: number;
  total_messages_failed: number;
  notes?: string;
  registered_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface Message {
  id: string;
  subscriber_id: string;
  gateway_id?: string;
  to_number: string;
  body: string;
  status: 'QUEUED' | 'DISPATCHED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  retry_count: number;
  ttl: number;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  webhook_url?: string;
  metadata?: Record<string, any>;
  queued_at: Date;
  dispatched_at?: Date;
  sent_at?: Date;
  delivered_at?: Date;
  failed_at?: Date;
  error?: string;
}

export interface ApiKey {
  id: string;
  subscriber_id: string;
  key_hash: string;
  key_prefix: string;
  label?: string;
  is_active: boolean;
  last_used_at?: Date;
  created_at: Date;
}

export interface RegistrationToken {
  id: string;
  subscriber_id: string;
  token_hash: string;
  expires_at: Date;
  used: boolean;
  used_at?: Date;
  used_by_device?: string;
  revoked_at?: Date;
  created_at: Date;
}

export interface DeviceWithLoad extends GatewayDevice {
  inFlightMessages: number;
}

export interface DispatchResult {
  success: boolean;
  deviceId?: string;
  deviceName?: string;
  attempt: number;
  error?: string;
}

export interface DeviceSelectionOptions {
  preferredCarrier?: string;
  preferredDeviceId?: string;
  excludeDeviceIds?: string[];
}

export interface WebSocketConnection {
  ws: any; // WebSocket instance
  deviceId: string;
  subscriberId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

export interface MessageQueueJob {
  messageId: string;
  subscriberId: string;
  to: string;
  body: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  webhookUrl?: string;
  metadata?: Record<string, any>;
  attempt?: number;
}

export interface AuthRequest extends Express.Request {
  user?: {
    subscriberId: string;
    apiKeyId: string;
    plan: string;
  };
}

export interface DeviceRegistrationRequest {
  registrationToken: string;
  deviceName: string;
  simCarrier?: string;
  simNumber?: string;
  androidVersion: string;
  appVersion: string;
}

export interface DeviceRegistrationResponse {
  deviceId: string;
  deviceToken: string;
  websocketUrl: string;
  subscriberId: string;
  subscriberName: string;
  subscriberPlan: string;
  dailyQuota: number;
  deviceQuota: {
    current: number;
    max: number;
  };
}

export interface DeviceStats {
  messagesSentToday: number;
  totalMessages: number;
  successRate: number;
  averageDeliveryTime?: number;
  lastMessageAt?: Date;
}

/**
 * Custom error classes for better error handling
 */
export class NoDeviceAvailableError extends Error {
  constructor(subscriberId: string, message?: string) {
    super(message || `Subscriber ${subscriberId} has no online devices available`);
    this.name = 'NoDeviceAvailableError';
  }
}

export class DeviceOfflineError extends Error {
  constructor(deviceId: string) {
    super(`Device ${deviceId} is offline or disconnected`);
    this.name = 'DeviceOfflineError';
  }
}

export class DeviceQuotaExceededError extends Error {
  constructor(subscriberId: string, maxDevices: number) {
    super(`Subscriber ${subscriberId} has reached the maximum of ${maxDevices} devices`);
    this.name = 'DeviceQuotaExceededError';
  }
}

export class MessageDispatchFailedError extends Error {
  constructor(messageId: string, reason: string) {
    super(`Failed to dispatch message ${messageId}: ${reason}`);
    this.name = 'MessageDispatchFailedError';
  }
}

export class UnauthorizedDeviceAccessError extends Error {
  constructor(deviceId: string, subscriberId: string) {
    super(`Subscriber ${subscriberId} does not have access to device ${deviceId}`);
    this.name = 'UnauthorizedDeviceAccessError';
  }
}
