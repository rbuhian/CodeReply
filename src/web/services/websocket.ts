/**
 * WebSocket Service
 * Real-time updates for device status and message delivery
 */

import { io, Socket } from 'socket.io-client';
import type { Device, Message } from '../types';

type EventCallback<T = any> = (data: T) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  connect() {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const token = localStorage.getItem('authToken');

    this.socket = io(wsUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
      this.isConnecting = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      this.isConnecting = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      this.reconnectAttempts++;
      this.isConnecting = false;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WebSocket] Max reconnection attempts reached');
        this.disconnect();
      }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  // Device events
  onDeviceStatus(callback: EventCallback<Device>) {
    this.socket?.on('device.status', callback);
  }

  onDeviceAdded(callback: EventCallback<Device>) {
    this.socket?.on('device.added', callback);
  }

  onDeviceRemoved(callback: EventCallback<{ deviceId: string }>) {
    this.socket?.on('device.removed', callback);
  }

  offDeviceStatus(callback: EventCallback<Device>) {
    this.socket?.off('device.status', callback);
  }

  offDeviceAdded(callback: EventCallback<Device>) {
    this.socket?.off('device.added', callback);
  }

  offDeviceRemoved(callback: EventCallback<{ deviceId: string }>) {
    this.socket?.off('device.removed', callback);
  }

  // Message events
  onMessageUpdated(callback: EventCallback<Message>) {
    this.socket?.on('message.updated', callback);
  }

  onMessageSent(callback: EventCallback<Message>) {
    this.socket?.on('message.sent', callback);
  }

  onMessageDelivered(callback: EventCallback<Message>) {
    this.socket?.on('message.delivered', callback);
  }

  onMessageFailed(callback: EventCallback<Message>) {
    this.socket?.on('message.failed', callback);
  }

  offMessageUpdated(callback: EventCallback<Message>) {
    this.socket?.off('message.updated', callback);
  }

  offMessageSent(callback: EventCallback<Message>) {
    this.socket?.off('message.sent', callback);
  }

  offMessageDelivered(callback: EventCallback<Message>) {
    this.socket?.off('message.delivered', callback);
  }

  offMessageFailed(callback: EventCallback<Message>) {
    this.socket?.off('message.failed', callback);
  }

  // Generic event handlers
  on<T = any>(event: string, callback: EventCallback<T>) {
    this.socket?.on(event, callback);
  }

  off<T = any>(event: string, callback: EventCallback<T>) {
    this.socket?.off(event, callback);
  }

  emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const ws = new WebSocketService();
