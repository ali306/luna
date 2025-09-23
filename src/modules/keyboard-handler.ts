import { AppState, KeyHandler, CleanupHandler } from '../types/index.js';

export interface KeyboardHandlerCallbacks {
  onSpace: () => void;
  onTextMode: () => void;
  onEscape: () => void;
  onToggleResponse: () => void;
  onTextSubmit: () => void;
}

export class KeyboardHandler {
  private cleanupHandlers: CleanupHandler[] = [];
  private textInputElement: HTMLInputElement | null = null;

  constructor(textInputElement: HTMLInputElement | null = null) {
    this.textInputElement = textInputElement;
  }

  public setupEventListeners(
    callbacks: KeyboardHandlerCallbacks,
    getState: () => AppState,
    isTypingContext: (target: Element | null) => boolean
  ): void {
    const keyHandler: KeyHandler = (e) => {
      try {
        const currentState = getState();
        const isInTypingContext = isTypingContext(e.target as Element);


        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          callbacks.onEscape();
          return;
        }


        if (isInTypingContext) return;


        if (e.ctrlKey || e.altKey || e.metaKey) return;


        switch (e.code) {
          case 'Space':
            if (!e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              callbacks.onSpace();
            }
            break;

          case 'KeyT':
            if (!e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              callbacks.onTextMode();
            }
            break;

          case 'KeyR':
            if (!e.shiftKey && currentState.mode !== 'text') {
              e.preventDefault();
              e.stopPropagation();
              callbacks.onToggleResponse();
            }
            break;
        }
      } catch (error) {
        console.error('Error in keyHandler:', error);
      }
    };

    const textInputHandler: KeyHandler = (e) => {
      try {

        if (e.target === this.textInputElement &&
          e.key === 'Enter' &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          callbacks.onTextSubmit();
        }
      } catch (error) {
        console.error('Error in textInputHandler:', error);
      }
    };


    document.addEventListener('keydown', keyHandler, { capture: true, passive: false });

    if (this.textInputElement) {
      this.textInputElement.addEventListener('keydown', textInputHandler, { capture: false, passive: false });
    }

    this.cleanupHandlers.push(() => {
      try {
        document.removeEventListener('keydown', keyHandler, { capture: true });
        if (this.textInputElement) {
          this.textInputElement.removeEventListener('keydown', textInputHandler);
        }
      } catch (error) {
        console.error('Error during event listener cleanup:', error);
      }
    });
  }

  public getKeyboardShortcuts(): Record<string, string> {
    return {
      'Space': 'Start/stop recording or stop speaking',
      'T': 'Toggle text input mode',
      'R': 'Toggle assistant response visibility',
      'Escape': 'Exit current mode/cancel action',
      'Enter': 'Submit text message (when in text mode)'
    };
  }

  public cleanup(): void {
    this.cleanupHandlers.forEach(handler => handler());
    this.cleanupHandlers = [];
  }
}