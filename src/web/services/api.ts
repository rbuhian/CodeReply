/**
 * API Service
 * Centralized API client for CodeReply backend
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  Device,
  RegistrationToken,
  DeviceStats,
  DeviceLog,
  Message,
  SendMessageRequest,
  MessageFilters,
  ApiKey,
  Webhook,
  DashboardStats,
  PaginatedResponse,
  ApiResponse,
} from '../types';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Device endpoints
  devices = {
    list: async (): Promise<Device[]> => {
      const { data } = await this.client.get<ApiResponse<{ devices: Device[] }>>('/devices');
      return data.data.devices;
    },

    get: async (deviceId: string): Promise<Device> => {
      const { data } = await this.client.get<ApiResponse<Device>>(`/devices/${deviceId}`);
      return data.data;
    },

    generateRegistrationToken: async (): Promise<RegistrationToken> => {
      const { data } = await this.client.post<ApiResponse<RegistrationToken>>(
        '/devices/registration-token'
      );
      return data.data;
    },

    delete: async (deviceId: string): Promise<void> => {
      await this.client.delete(`/devices/${deviceId}`);
    },

    updateLabel: async (deviceId: string, label: string): Promise<Device> => {
      const { data } = await this.client.patch<ApiResponse<Device>>(`/devices/${deviceId}`, {
        label,
      });
      return data.data;
    },

    getStats: async (deviceId: string): Promise<DeviceStats> => {
      const { data } = await this.client.get<ApiResponse<DeviceStats>>(
        `/devices/${deviceId}/stats`
      );
      return data.data;
    },

    getLogs: async (
      deviceId: string,
      params?: { limit?: number; offset?: number }
    ): Promise<PaginatedResponse<DeviceLog>> => {
      const { data } = await this.client.get<ApiResponse<PaginatedResponse<DeviceLog>>>(
        `/devices/${deviceId}/logs`,
        { params }
      );
      return data.data;
    },
  };

  // Message endpoints
  messages = {
    list: async (filters?: MessageFilters): Promise<PaginatedResponse<Message>> => {
      const { data } = await this.client.get<ApiResponse<PaginatedResponse<Message>>>(
        '/messages',
        { params: filters }
      );
      return data.data;
    },

    get: async (messageId: string): Promise<Message> => {
      const { data } = await this.client.get<ApiResponse<Message>>(`/messages/${messageId}`);
      return data.data;
    },

    send: async (message: SendMessageRequest): Promise<Message> => {
      const { data } = await this.client.post<ApiResponse<Message>>('/messages', message);
      return data.data;
    },

    retry: async (messageId: string): Promise<Message> => {
      const { data } = await this.client.post<ApiResponse<Message>>(
        `/messages/${messageId}/retry`
      );
      return data.data;
    },
  };

  // Dashboard endpoints
  dashboard = {
    getStats: async (): Promise<DashboardStats> => {
      const { data } = await this.client.get<ApiResponse<DashboardStats>>('/dashboard/stats');
      return data.data;
    },
  };

  // API Key endpoints
  apiKeys = {
    list: async (): Promise<ApiKey[]> => {
      const { data } = await this.client.get<ApiResponse<{ apiKeys: ApiKey[] }>>('/api-keys');
      return data.data.apiKeys;
    },

    create: async (name: string): Promise<{ apiKey: ApiKey; fullKey: string }> => {
      const { data } = await this.client.post<
        ApiResponse<{ apiKey: ApiKey; fullKey: string }>
      >('/api-keys', { name });
      return data.data;
    },

    revoke: async (apiKeyId: string): Promise<void> => {
      await this.client.delete(`/api-keys/${apiKeyId}`);
    },
  };

  // Webhook endpoints
  webhooks = {
    get: async (): Promise<Webhook | null> => {
      try {
        const { data } = await this.client.get<ApiResponse<Webhook>>('/webhooks');
        return data.data;
      } catch (error) {
        if ((error as AxiosError).response?.status === 404) {
          return null;
        }
        throw error;
      }
    },

    create: async (url: string): Promise<Webhook> => {
      const { data } = await this.client.post<ApiResponse<Webhook>>('/webhooks', { url });
      return data.data;
    },

    update: async (webhookId: string, updates: Partial<Webhook>): Promise<Webhook> => {
      const { data } = await this.client.patch<ApiResponse<Webhook>>(
        `/webhooks/${webhookId}`,
        updates
      );
      return data.data;
    },

    test: async (webhookId: string): Promise<{ success: boolean; response: any }> => {
      const { data } = await this.client.post<
        ApiResponse<{ success: boolean; response: any }>
      >(`/webhooks/${webhookId}/test`);
      return data.data;
    },

    delete: async (webhookId: string): Promise<void> => {
      await this.client.delete(`/webhooks/${webhookId}`);
    },
  };

  // Auth endpoints
  auth = {
    login: async (email: string, password: string): Promise<{ token: string }> => {
      const { data } = await this.client.post<ApiResponse<{ token: string }>>('/auth/login', {
        email,
        password,
      });
      localStorage.setItem('authToken', data.data.token);
      return data.data;
    },

    register: async (
      email: string,
      password: string,
      name?: string
    ): Promise<{ token: string }> => {
      const { data } = await this.client.post<ApiResponse<{ token: string }>>(
        '/auth/register',
        { email, password, name }
      );
      localStorage.setItem('authToken', data.data.token);
      return data.data;
    },

    logout: () => {
      localStorage.removeItem('authToken');
    },
  };
}

export const api = new ApiClient();
