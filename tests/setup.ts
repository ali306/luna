
import { beforeEach, vi } from 'vitest';


globalThis.vi = vi;


Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn()
  }
});


Object.defineProperty(window, 'WebSocket', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    readyState: 0,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    send: vi.fn(),
    close: vi.fn(),
    onopen: vi.fn(),
    onmessage: vi.fn(),
    onclose: vi.fn(),
    onerror: vi.fn()
  }))
});


Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: vi.fn((cb) => setTimeout(cb, 16))
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: vi.fn((id) => clearTimeout(id))
});


beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});