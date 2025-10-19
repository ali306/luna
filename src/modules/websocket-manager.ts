import {
  IncomingMessage,
  OutgoingMessage,
  EnvironmentConfig,
  TimingConfig
} from '../types/index.js';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private maxAttemptsExceeded: boolean = false;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private binaryMessageHandler: ((data: Uint8Array) => void) | null = null;
  private connectionStateCallback: ((connected: boolean) => void) | null = null;
  private isBackendConnected: boolean = false;

  constructor(
    private environment: EnvironmentConfig,
    private timing: TimingConfig
  ) { }

  public connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;

    this.cleanup();


    this.reconnectAttempts = 0;
    this.maxAttemptsExceeded = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = this.environment.wsUrl || `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('WebSocket opened, waiting for backend pong...');
        this.reconnectAttempts = 0;
        this.maxAttemptsExceeded = false;

        this.send({ type: 'ping', timestamp: Date.now() });
      };

      this.ws.onmessage = async (event) => {

        if (event.data instanceof ArrayBuffer) {
          const uint8Array = new Uint8Array(event.data);
          this.handleBinaryMessage(uint8Array);
          return;
        }


        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          this.handleBinaryMessage(uint8Array);
          return;
        }


        if (typeof event.data === 'string') {
          try {
            const data: IncomingMessage = JSON.parse(event.data);


            if (data.type === 'pong' && !this.isBackendConnected) {
              console.log('Backend confirmed via pong response');
              this.isBackendConnected = true;
              this.notifyConnectionState(true);
            }

            this.handleMessage(data);
          } catch (error) {
            console.error('Invalid WebSocket message:', error);
          }
        } else {
          console.warn('Received unknown WebSocket message type:', typeof event.data);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed. Code:', event.code, 'Reason:', event.reason);
        if (this.isBackendConnected) {
          this.isBackendConnected = false;
          this.notifyConnectionState(false);
        }
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
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isBackendConnected;
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

  public onBinaryMessage(handler: (data: Uint8Array) => void): void {
    this.binaryMessageHandler = handler;
  }

  public offBinaryMessage(): void {
    this.binaryMessageHandler = null;
  }

  private handleMessage(data: IncomingMessage): void {
    console.log('[WebSocketManager] Received message:', data.type);
    const handler = this.messageHandlers.get(data.type);
    if (handler) {
      handler(data);
    } else {
      console.warn('[WebSocketManager] No handler registered for message type:', data.type);
    }
  }

  private handleBinaryMessage(data: Uint8Array): void {
    if (this.binaryMessageHandler) {
      this.binaryMessageHandler(data);
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
    this.isBackendConnected = false;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();


    if (this.maxAttemptsExceeded) {
      console.warn('[WebSocketManager] Max reconnection attempts exceeded. Call connect() to retry.');
      return;
    }


    if (this.reconnectAttempts >= this.timing.maxReconnectAttempts) {
      console.error('[WebSocketManager] Max reconnection attempts reached. Stopping automatic reconnection.');
      this.maxAttemptsExceeded = true;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.timing.wsReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      10000
    );

    console.log(`[WebSocketManager] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.timing.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}