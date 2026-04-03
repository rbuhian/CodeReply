/**
 * Message Types
 * Type definitions for SMS messages
 */

export interface Message {
  id: string;
  subscriberId: string;
  deviceId?: string;

  // Message content
  to: string;
  body: string;

  // Status
  status: MessageStatus;
  statusDetails?: string;

  // Delivery
  queuedAt: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;

  // Metadata
  priority: MessagePriority;
  retryCount: number;
  webhookUrl?: string;

  // Performance
  queueTimeMs?: number;
  sendTimeMs?: number;
  deliveryTimeMs?: number;
}

export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'expired';

export type MessagePriority = 'low' | 'normal' | 'high';

export interface SendMessageRequest {
  to: string;
  body: string;
  priority?: MessagePriority;
  webhookUrl?: string;
}

export interface MessageFilters {
  status?: MessageStatus;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface MessageStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  successRate: number;
}
