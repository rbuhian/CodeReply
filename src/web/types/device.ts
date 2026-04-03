/**
 * Device Types
 * Type definitions for gateway device management
 */

export interface Device {
  id: string;
  subscriberId: string;
  name: string;
  label?: string;

  // Status
  status: DeviceStatus;
  isOnline: boolean;
  lastHeartbeat: string;

  // SIM Information
  simCarrier?: string;
  simNumber?: string;
  simCountryCode?: string;

  // Statistics
  messagesSentToday: number;
  messagesSentTotal: number;
  successRate: number;

  // Device Information
  deviceModel?: string;
  androidVersion?: string;
  appVersion?: string;

  // Performance
  signalStrength?: number;
  batteryLevel?: number;

  // Timestamps
  registeredAt: string;
  updatedAt: string;
}

export type DeviceStatus = 'online' | 'offline' | 'degraded' | 'error';

export interface RegistrationToken {
  registrationToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface DeviceStats {
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  avgDeliveryTime: number;
  lastMessageAt?: string;
}

export interface DeviceLog {
  id: string;
  deviceId: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface DeviceQuota {
  current: number;
  max: number;
  percentage: number;
}

export interface DeviceHealthCheck {
  deviceId: string;
  timestamp: string;
  batteryLevel: number;
  signalStrength: number;
  memoryUsage: number;
  storageAvailable: number;
  isCharging: boolean;
}
