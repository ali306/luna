import { describe, it, expect, beforeEach, vi, afterEach, type MockedFunction } from 'vitest';
import { KeyboardHandler, type KeyboardHandlerCallbacks } from '../src/modules/keyboard-handler.js';
import type { AppState } from '../src/types/index.js';

describe('KeyboardHandler', () => {
  let keyboardHandler: KeyboardHandler;
  let mockCallbacks: KeyboardHandlerCallbacks;
  let mockGetState: MockedFunction<() => AppState>;
  let mockIsTypingContext: MockedFunction<(target: Element | null) => boolean>;
  let textInputElement: HTMLInputElement;

  beforeEach(() => {

    textInputElement = document.createElement('input');
    textInputElement.type = 'text';
    document.body.appendChild(textInputElement);

    mockCallbacks = {
      onSpace: vi.fn(),
      onTextMode: vi.fn(),
      onEscape: vi.fn(),
      onToggleResponse: vi.fn(),
      onTextSubmit: vi.fn()
    };

    mockGetState = vi.fn().mockReturnValue({
      mode: 'idle',
      connected: true,
      backendReady: true,
      responseVisible: false
    });

    mockIsTypingContext = vi.fn().mockReturnValue(false);

    keyboardHandler = new KeyboardHandler(textInputElement);
  });

  afterEach(() => {
    keyboardHandler.cleanup();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should initialize with text input element', () => {

      const handler = new KeyboardHandler(textInputElement);


      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(KeyboardHandler);
    });

    it('should initialize without text input element', () => {

      const handler = new KeyboardHandler();


      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(KeyboardHandler);
    });

    it('should initialize with null text input element', () => {

      const handler = new KeyboardHandler(null);


      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(KeyboardHandler);
    });
  });

  describe('setupEventListeners', () => {
    beforeEach(() => {
      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);
    });

    describe('global keyboard events', () => {
      it('should handle Space key press', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'Space',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onSpace).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });

      it('should handle T key press', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'KeyT',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onTextMode).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });

      it('should handle R key press when not in text mode', () => {

        mockGetState.mockReturnValue({
          mode: 'idle',
          connected: true,
          backendReady: true,
          responseVisible: false
        });

        const event = new KeyboardEvent('keydown', {
          code: 'KeyR',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onToggleResponse).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });

      it('should not handle R key press when in text mode', () => {

        mockGetState.mockReturnValue({
          mode: 'text',
          connected: true,
          backendReady: true,
          responseVisible: false
        });

        const event = new KeyboardEvent('keydown', {
          code: 'KeyR',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onToggleResponse).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should handle Escape key press', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'Escape',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onEscape).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });

      it('should handle Escape key even in typing context', () => {

        mockIsTypingContext.mockReturnValue(true);
        const event = new KeyboardEvent('keydown', {
          code: 'Escape',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onEscape).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });
    });

    describe('modifier key handling', () => {
      it('should ignore key presses with Ctrl modifier', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'Space',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onSpace).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore key presses with Alt modifier', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'KeyT',
          altKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onTextMode).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore key presses with Meta modifier', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'KeyR',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onToggleResponse).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore Space key with Shift modifier', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'Space',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onSpace).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore T key with Shift modifier', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'KeyT',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onTextMode).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore R key with Shift modifier', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'KeyR',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onToggleResponse).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should process Escape key even with modifiers', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'Escape',
          ctrlKey: true,
          altKey: true,
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onEscape).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });
    });

    describe('typing context handling', () => {
      it('should ignore keys when in typing context (except Escape)', () => {

        mockIsTypingContext.mockReturnValue(true);
        const events = [
          new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
          new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true, cancelable: true }),
          new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true, cancelable: true })
        ];


        events.forEach(event => {
          document.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(false);
        });

        expect(mockCallbacks.onSpace).not.toHaveBeenCalled();
        expect(mockCallbacks.onTextMode).not.toHaveBeenCalled();
        expect(mockCallbacks.onToggleResponse).not.toHaveBeenCalled();
      });

      it('should process Escape key even in typing context', () => {

        mockIsTypingContext.mockReturnValue(true);
        const event = new KeyboardEvent('keydown', {
          code: 'Escape',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onEscape).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });
    });

    describe('text input event handling', () => {
      it('should handle Enter key in text input', () => {

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: textInputElement,
          configurable: true
        });


        textInputElement.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });

      it('should ignore Enter key with Shift modifier', () => {

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: textInputElement,
          configurable: true
        });


        textInputElement.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore Enter key with Ctrl modifier', () => {

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: textInputElement,
          configurable: true
        });


        textInputElement.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore Enter key with Alt modifier', () => {

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          altKey: true,
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: textInputElement,
          configurable: true
        });


        textInputElement.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore Enter key with Meta modifier', () => {

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: textInputElement,
          configurable: true
        });


        textInputElement.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should ignore Enter key from different element', () => {

        const otherInput = document.createElement('input');
        document.body.appendChild(otherInput);

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: otherInput,
          configurable: true
        });


        otherInput.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });

      it('should handle non-Enter keys in text input without action', () => {

        const event = new KeyboardEvent('keydown', {
          key: 'a',
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, 'target', {
          value: textInputElement,
          configurable: true
        });


        expect(() => textInputElement.dispatchEvent(event)).not.toThrow();
        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });
    });

    describe('keyboard handler without text input element', () => {
      it('should handle setup without text input element', () => {

        const handlerWithoutInput = new KeyboardHandler();


        expect(() => {
          handlerWithoutInput.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);
        }).not.toThrow();

        handlerWithoutInput.cleanup();
      });

      it('should not handle Enter key when no text input element', () => {

        const handlerWithoutInput = new KeyboardHandler();
        handlerWithoutInput.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();

        handlerWithoutInput.cleanup();
      });
    });

    describe('unknown/unhandled keys', () => {
      it('should ignore unknown key codes', () => {

        const event = new KeyboardEvent('keydown', {
          code: 'KeyX',
          bubbles: true,
          cancelable: true
        });


        document.dispatchEvent(event);


        expect(event.defaultPrevented).toBe(false);

        Object.values(mockCallbacks).forEach(callback => {
          if (callback !== mockCallbacks.onEscape) {
            expect(callback).not.toHaveBeenCalled();
          }
        });
      });

      it('should handle key events with undefined code', () => {

        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true
        });


        expect(() => document.dispatchEvent(event)).not.toThrow();
        expect(event.defaultPrevented).toBe(false);
      });
    });
  });

  describe('getKeyboardShortcuts', () => {
    it('should return correct keyboard shortcuts', () => {

      const shortcuts = keyboardHandler.getKeyboardShortcuts();


      expect(shortcuts).toEqual({
        'Space': 'Start/stop recording or stop speaking',
        'T': 'Toggle text input mode',
        'R': 'Toggle assistant response visibility',
        'Escape': 'Exit current mode/cancel action',
        'Enter': 'Submit text message (when in text mode)'
      });
    });

    it('should return a new object each time', () => {

      const shortcuts1 = keyboardHandler.getKeyboardShortcuts();
      const shortcuts2 = keyboardHandler.getKeyboardShortcuts();


      expect(shortcuts1).not.toBe(shortcuts2);
      expect(shortcuts1).toEqual(shortcuts2);
    });
  });

  describe('cleanup', () => {
    it('should remove global event listeners', () => {

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);


      keyboardHandler.cleanup();


      const event = new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);


      expect(mockCallbacks.onSpace).not.toHaveBeenCalled();
    });

    it('should remove text input event listeners', () => {

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);


      keyboardHandler.cleanup();


      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(event, 'target', {
        value: textInputElement,
        configurable: true
      });
      textInputElement.dispatchEvent(event);


      expect(mockCallbacks.onTextSubmit).not.toHaveBeenCalled();
    });

    it('should handle multiple cleanup calls', () => {

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);


      expect(() => {
        keyboardHandler.cleanup();
        keyboardHandler.cleanup();
        keyboardHandler.cleanup();
      }).not.toThrow();
    });

    it('should handle cleanup without setup', () => {

      expect(() => keyboardHandler.cleanup()).not.toThrow();
    });

    it('should handle cleanup with null text input element', () => {

      const handlerWithNullInput = new KeyboardHandler(null);
      handlerWithNullInput.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);


      expect(() => handlerWithNullInput.cleanup()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle errors in global key handler gracefully', () => {

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      mockGetState.mockImplementation(() => {
        throw new Error('Test error');
      });

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

      const event = new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true
      });


      expect(() => document.dispatchEvent(event)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Error in keyHandler:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle errors in text input handler gracefully', () => {

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      mockCallbacks.onTextSubmit = vi.fn().mockImplementation(() => {
        throw new Error('Text submit error');
      });

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(event, 'target', {
        value: textInputElement,
        configurable: true
      });


      expect(() => textInputElement.dispatchEvent(event)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Error in textInputHandler:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle errors in cleanup gracefully', () => {

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);


      const originalRemoveEventListener = document.removeEventListener;
      document.removeEventListener = vi.fn().mockImplementation(() => {
        throw new Error('Remove listener error');
      });


      expect(() => keyboardHandler.cleanup()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Error during event listener cleanup:', expect.any(Error));


      document.removeEventListener = originalRemoveEventListener;
      consoleSpy.mockRestore();
    });

    it('should handle callback errors without affecting other processing', () => {

      mockCallbacks.onSpace = vi.fn().mockImplementation(() => {
        throw new Error('Space callback error');
      });

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

      const spaceEvent = new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true
      });

      const tEvent = new KeyboardEvent('keydown', {
        code: 'KeyT',
        bubbles: true,
        cancelable: true
      });


      document.dispatchEvent(spaceEvent);
      document.dispatchEvent(tEvent);


      expect(mockCallbacks.onTextMode).toHaveBeenCalled();
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle isTypingContext returning undefined', () => {

      mockIsTypingContext.mockReturnValue(undefined as any);
      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

      const event = new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true
      });


      expect(() => document.dispatchEvent(event)).not.toThrow();
      expect(mockCallbacks.onSpace).toHaveBeenCalled();
    });

    it('should handle getState returning partial state', () => {

      mockGetState.mockReturnValue({ mode: 'text' } as any);
      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

      const event = new KeyboardEvent('keydown', {
        code: 'KeyR',
        bubbles: true,
        cancelable: true
      });


      document.dispatchEvent(event);


      expect(mockCallbacks.onToggleResponse).not.toHaveBeenCalled();
    });

    it('should handle event with null target', () => {

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);

      const event = new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(event, 'target', {
        value: null,
        configurable: true
      });


      expect(() => document.dispatchEvent(event)).not.toThrow();
      expect(mockCallbacks.onSpace).toHaveBeenCalled();
    });

    it('should handle rapid successive key events', () => {

      keyboardHandler.setupEventListeners(mockCallbacks, mockGetState, mockIsTypingContext);


      for (let i = 0; i < 100; i++) {
        const event = new KeyboardEvent('keydown', {
          code: 'Space',
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(event);
      }


      expect(mockCallbacks.onSpace).toHaveBeenCalledTimes(100);
    });
  });
});