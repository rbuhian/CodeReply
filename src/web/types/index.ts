/**
 * Central Type Exports
 */

export * from './device';
export * from './message';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: 'subscriber' | 'admin';
  createdAt: string;
}

export interface ApiKey {
  id: string;
  subscriberId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface Webhook {
  id: string;
  subscriberId: string;
  url: string;
  secret: string;
  enabled: boolean;
  lastTriggeredAt?: string;
  failureCount: number;
  createdAt: string;
}

export interface DashboardStats {
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  successRate: number;
  activeDevices: number;
  totalDevices: number;
  avgDeliveryTime: number;
}
