import {
  IncomingMessage,
  OutgoingMessage,
  EnvironmentConfig,
  TimingConfig
} from '../types/index.js';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private connectionStateCallback: ((connected: boolean) => void) | null = null;

  constructor(
    private environment: EnvironmentConfig,
    private timing: TimingConfig
  ) { }

  public connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;

    this.cleanup();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = this.environment.wsUrl || `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.notifyConnectionState(true);
        this.send({ type: 'ping', timestamp: Date.now() });
      };

      this.ws.onmessage = (event) => {
        try {
          const data: IncomingMessage = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.notifyConnectionState(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.cleanup();
    this.clearReconnectTimer();
  }

  public send(message: OutgoingMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  public offMessage(type: string): void {
    this.messageHandlers.delete(type);
  }

  public onConnectionStateChange(callback: (connected: boolean) => void): void {
    this.connectionStateCallback = callback;
  }

  private handleMessage(data: IncomingMessage): void {
    const handler = this.messageHandlers.get(data.type);
    if (handler) {
      handler(data);
    }
  }

  private notifyConnectionState(connected: boolean): void {
    if (this.connectionStateCallback) {
      this.connectionStateCallback(connected);
    }
  }

  private cleanup(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (this.reconnectAttempts >= this.timing.maxReconnectAttempts) {
      this.reconnectAttempts = 0;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.timing.wsReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      10000
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}