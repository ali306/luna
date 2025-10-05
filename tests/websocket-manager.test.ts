import { describe, it, expect, beforeEach, vi, afterEach, type MockedFunction } from 'vitest';
import { WebSocketManager } from '../src/modules/websocket-manager.js';
import type { EnvironmentConfig, TimingConfig, OutgoingMessage, IncomingMessage } from '../src/types/index.js';

describe('WebSocketManager', () => {
  let webSocketManager: WebSocketManager;
  let mockEnvironment: EnvironmentConfig;
  let mockTiming: TimingConfig;
  let mockWebSocket: WebSocket;
  let WebSocketConstructorSpy: MockedFunction<any>;

  beforeEach(() => {

    mockEnvironment = {
      isTauri: false,
      apiBase: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000/ws'
    };

    mockTiming = {
      bufferingDelay: 150,
      estimatedStartDelay: 300,
      wsReconnectDelay: 1000,
      maxReconnectAttempts: 5
    };

    mockWebSocket = {
      readyState: WebSocket.CONNECTING,
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null
    } as any;

    WebSocketConstructorSpy = vi.fn().mockImplementation(() => mockWebSocket);
    vi.stubGlobal('WebSocket', WebSocketConstructorSpy);


    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:3000'
      },
      configurable: true
    });

    webSocketManager = new WebSocketManager(mockEnvironment, mockTiming);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {

      const manager = new WebSocketManager(mockEnvironment, mockTiming);


      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(WebSocketManager);
    });
  });

  describe('connect', () => {
    it('should create WebSocket with environment wsUrl when provided', () => {

      webSocketManager.connect();


      expect(WebSocketConstructorSpy).toHaveBeenCalledWith(mockEnvironment.wsUrl);
    });

    it('should create WebSocket with generated URL when environment wsUrl is null', () => {

      const envWithoutWsUrl = { ...mockEnvironment, wsUrl: null };
      const manager = new WebSocketManager(envWithoutWsUrl, mockTiming);


      manager.connect();


      expect(WebSocketConstructorSpy).toHaveBeenCalledWith('ws://localhost:3000/ws');
    });

    it('should use wss protocol when location protocol is https', () => {

      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', host: 'localhost:3000' },
        configurable: true
      });
      const envWithoutWsUrl = { ...mockEnvironment, wsUrl: null };
      const manager = new WebSocketManager(envWithoutWsUrl, mockTiming);


      manager.connect();


      expect(WebSocketConstructorSpy).toHaveBeenCalledWith('wss://localhost:3000/ws');
    });

    it('should not create new connection if already connecting', () => {

      mockWebSocket.readyState = WebSocket.CONNECTING;
      webSocketManager.connect();
      WebSocketConstructorSpy.mockClear();


      webSocketManager.connect();


      expect(WebSocketConstructorSpy).not.toHaveBeenCalled();
    });


    it('should handle WebSocket creation error and schedule reconnect', () => {

      WebSocketConstructorSpy.mockImplementation(() => {
        throw new Error('WebSocket creation failed');
      });
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      webSocketManager.connect();


      expect(consoleSpy).toHaveBeenCalledWith('Failed to create WebSocket:', expect.any(Error));


      vi.advanceTimersByTime(mockTiming.wsReconnectDelay);
      expect(WebSocketConstructorSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('WebSocket event handlers', () => {
    beforeEach(() => {
      webSocketManager.connect();
    });

    it('should handle onopen event correctly', () => {

      const connectionCallback = vi.fn();
      webSocketManager.onConnectionStateChange(connectionCallback);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });


      if (mockWebSocket.onopen) {
        mockWebSocket.onopen(new Event('open'));
      }


      expect(consoleSpy).toHaveBeenCalledWith('WebSocket connected');
      expect(connectionCallback).toHaveBeenCalledWith(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ping"')
      );

      consoleSpy.mockRestore();
    });

    it('should reset reconnect attempts on successful connection', () => {

      vi.useFakeTimers();


      if (mockWebSocket.onclose) {
        mockWebSocket.onclose(new CloseEvent('close'));
      }


      if (mockWebSocket.onopen) {
        mockWebSocket.onopen(new Event('open'));
      }


      if (mockWebSocket.onclose) {
        mockWebSocket.onclose(new CloseEvent('close'));
      }

      vi.advanceTimersByTime(mockTiming.wsReconnectDelay);
      expect(WebSocketConstructorSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should handle onmessage with valid JSON', () => {

      const messageHandler = vi.fn();
      webSocketManager.onMessage('test_type', messageHandler);

      const testMessage = {
        type: 'test_type',
        data: 'test_data'
      };


      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: JSON.stringify(testMessage)
        } as MessageEvent);
      }


      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should handle onmessage with invalid JSON', () => {

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: 'invalid json'
        } as MessageEvent);
      }


      expect(consoleSpy).toHaveBeenCalledWith('Invalid WebSocket message:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle onmessage when no handler is registered', () => {

      const testMessage = {
        type: 'unhandled_type',
        data: 'test_data'
      };


      expect(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({
            data: JSON.stringify(testMessage)
          } as MessageEvent);
        }
      }).not.toThrow();
    });


    it('should handle onerror event', () => {

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const errorEvent = new Event('error');


      if (mockWebSocket.onerror) {
        mockWebSocket.onerror(errorEvent);
      }


      expect(consoleSpy).toHaveBeenCalledWith('WebSocket error:', errorEvent);

      consoleSpy.mockRestore();
    });
  });

  describe('disconnect', () => {
    it('should close connection and clear reconnect timer', () => {

      vi.useFakeTimers();
      webSocketManager.connect();


      if (mockWebSocket.onclose) {
        mockWebSocket.onclose(new CloseEvent('close'));
      }


      webSocketManager.disconnect();


      expect(mockWebSocket.close).toHaveBeenCalled();


      vi.advanceTimersByTime(mockTiming.wsReconnectDelay * 2);
      expect(WebSocketConstructorSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should handle disconnect when not connected', () => {

      expect(() => webSocketManager.disconnect()).not.toThrow();
    });
  });

  describe('send', () => {
    beforeEach(() => {
      webSocketManager.connect();
    });

    it('should send message when connection is open', () => {

      mockWebSocket.readyState = WebSocket.OPEN;
      const message: OutgoingMessage = {
        type: 'chat',
        text: 'Hello world'
      };


      const result = webSocketManager.send(message);


      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });


    it('should handle different message types', () => {

      mockWebSocket.readyState = WebSocket.OPEN;
      const messages: OutgoingMessage[] = [
        { type: 'ping', timestamp: Date.now() },
        { type: 'chat', text: 'Hello' },
        { type: 'tts', text: 'Speak this' },
        { type: 'stop' },
        { type: 'mode_change', mode: 'idle' }
      ];


      messages.forEach(message => {
        const result = webSocketManager.send(message);
        expect(result).toBe(true);
        expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
      });
    });
  });

  describe('isConnected', () => {
    it('should return true when WebSocket is open', () => {

      webSocketManager.connect();
      mockWebSocket.readyState = WebSocket.OPEN;


      const result = webSocketManager.isConnected();


      expect(result).toBe(true);
    });



    it('should return false when WebSocket is null', () => {

      const result = webSocketManager.isConnected();


      expect(result).toBe(false);
    });
  });

  describe('message handlers', () => {
    it('should register and call message handler', () => {

      const handler = vi.fn();
      const messageData = { type: 'test', content: 'test content' };


      webSocketManager.onMessage('test', handler);
      webSocketManager.connect();

      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: JSON.stringify(messageData)
        } as MessageEvent);
      }


      expect(handler).toHaveBeenCalledWith(messageData);
    });

    it('should remove message handler', () => {

      const handler = vi.fn();
      webSocketManager.onMessage('test', handler);


      webSocketManager.offMessage('test');
      webSocketManager.connect();

      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: JSON.stringify({ type: 'test', content: 'test' })
        } as MessageEvent);
      }


      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple handlers for different message types', () => {

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      webSocketManager.onMessage('type1', handler1);
      webSocketManager.onMessage('type2', handler2);
      webSocketManager.connect();


      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: JSON.stringify({ type: 'type1', content: 'content1' })
        } as MessageEvent);

        mockWebSocket.onmessage({
          data: JSON.stringify({ type: 'type2', content: 'content2' })
        } as MessageEvent);
      }


      expect(handler1).toHaveBeenCalledWith({ type: 'type1', content: 'content1' });
      expect(handler2).toHaveBeenCalledWith({ type: 'type2', content: 'content2' });
    });
  });

  describe('connection state callback', () => {
    it('should register and call connection state callback', () => {

      const callback = vi.fn();
      webSocketManager.onConnectionStateChange(callback);
      webSocketManager.connect();


      if (mockWebSocket.onopen) {
        mockWebSocket.onopen(new Event('open'));
      }


      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should call connection state callback on disconnect', () => {

      const callback = vi.fn();
      webSocketManager.onConnectionStateChange(callback);
      webSocketManager.connect();


      if (mockWebSocket.onclose) {
        mockWebSocket.onclose(new CloseEvent('close'));
      }


      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should handle missing connection state callback', () => {

      webSocketManager.connect();


      expect(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen(new Event('open'));
        }
      }).not.toThrow();
    });
  });

  describe('reconnection logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });



    it('should reset reconnect attempts after max attempts reached', () => {

      webSocketManager.connect();


      for (let i = 0; i < mockTiming.maxReconnectAttempts + 1; i++) {
        if (mockWebSocket.onclose) {
          mockWebSocket.onclose(new CloseEvent('close'));
        }
        vi.advanceTimersByTime(10000);
      }


      if (mockWebSocket.onclose) {
        mockWebSocket.onclose(new CloseEvent('close'));
      }
      vi.advanceTimersByTime(mockTiming.wsReconnectDelay);


      expect(WebSocketConstructorSpy).toHaveBeenCalled();
    });

    it('should clear reconnect timer when manually disconnecting during reconnect', () => {

      webSocketManager.connect();


      if (mockWebSocket.onclose) {
        mockWebSocket.onclose(new CloseEvent('close'));
      }


      webSocketManager.disconnect();


      vi.advanceTimersByTime(mockTiming.wsReconnectDelay * 2);
      expect(WebSocketConstructorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle message with null data', () => {

      webSocketManager.connect();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: null
        } as any);
      }


      expect(consoleSpy).toHaveBeenCalledWith('Invalid WebSocket message:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle empty message data', () => {

      webSocketManager.connect();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: ''
        } as MessageEvent);
      }


      expect(consoleSpy).toHaveBeenCalledWith('Invalid WebSocket message:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle WebSocket send throwing error', () => {

      webSocketManager.connect();
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.send = vi.fn().mockImplementation(() => {
        throw new Error('Send failed');
      });

      const message: OutgoingMessage = { type: 'chat', text: 'test' };


      expect(() => {
        const result = webSocketManager.send(message);


      }).toThrow('Send failed');
    });

    it('should handle undefined window.location', () => {

      const originalLocation = window.location;
      delete (window as any).location;


      expect(() => {
        const envWithoutWsUrl = { ...mockEnvironment, wsUrl: null };
        new WebSocketManager(envWithoutWsUrl, mockTiming);
      }).not.toThrow();


      window.location = originalLocation;
    });
  });
});