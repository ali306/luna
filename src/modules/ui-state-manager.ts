import type { AppState, AppMode, DOMElements, StatusType } from '../types/index.js';
import { DOMUtils } from './dom-utils.js';

export class UIStateManager {
  private state: AppState = {
    mode: 'idle',
    connected: false,
    backendReady: false,
    responseVisible: false
  };

  private domElements: DOMElements = {
    haloPath: null,
    status: null,
    assistantResponse: null,
    textInput: null,
    connectionDot: null,
    connectionText: null
  };

  private blurTimeoutId: number | null = null;

  async initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = 10000;

      const checkElements = (): boolean => {
        const haloPath = document.querySelector('.halo-path') as SVGPathElement;
        const status = document.getElementById('status') as HTMLElement;
        const assistantResponse = document.getElementById('assistantResponse') as HTMLElement;
        const textInput = document.getElementById('textInput') as HTMLInputElement;
        const connectionDot = document.getElementById('connectionDot') as HTMLElement;
        const connectionText = document.getElementById('connectionText') as HTMLElement;

        if (haloPath && status && assistantResponse && textInput && connectionDot && connectionText) {
          this.domElements = {
            haloPath,
            status,
            assistantResponse,
            textInput,
            connectionDot,
            connectionText
          };
          return true;
        }
        return false;
      };

      const observer = new MutationObserver(() => {
        if (checkElements()) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve();
        }
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Required DOM elements not found within timeout'));
      }, timeout);

      if (checkElements()) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve();
        return;
      }

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  getState(): AppState {
    return { ...this.state };
  }

  setState(updates: Partial<AppState>): void {
    const oldMode = this.state.mode;
    this.state = { ...this.state, ...updates };

    if (updates.mode !== undefined && oldMode !== updates.mode) {
      console.log(`State transition: ${oldMode} -> ${updates.mode}`);
    }

    // Handle blur timeout when exiting text mode
    if (oldMode === 'text' && updates.mode !== undefined && updates.mode !== 'text') {
      if (this.blurTimeoutId !== null) {
        clearTimeout(this.blurTimeoutId);
      }
      this.blurTimeoutId = window.setTimeout(() => {
        if (this.state.mode !== 'text' && this.domElements.textInput) {
          this.domElements.textInput.blur();
        }
        this.blurTimeoutId = null;
      }, 0);
    }

    // Cancel blur if returning to text mode
    if (updates.mode === 'text' && this.blurTimeoutId !== null) {
      clearTimeout(this.blurTimeoutId);
      this.blurTimeoutId = null;
    }

    this.updateUI();
  }

  getDOMElements(): DOMElements {
    return this.domElements;
  }

  setMode(mode: AppMode): void {
    this.setState({ mode });
  }

  setConnected(connected: boolean): void {
    this.setState({ connected });
  }

  setBackendReady(ready: boolean): void {
    this.setState({ backendReady: ready });
  }

  showStatus(message: string, persistent: boolean = false, type: StatusType = ''): void {
    if (!this.domElements.status) return;

    this.domElements.status.textContent = message;
    this.domElements.status.className = `status visible ${type}`;

    if (!persistent) {
      setTimeout(() => {
        if (this.domElements.status) {
          this.domElements.status.classList.remove('visible');
        }
      }, 3000);
    }
  }

  displayAssistantResponse(response: string): void {
    if (!this.domElements.assistantResponse) return;

    const maxLength = 140;
    const displayText = response.length > maxLength
      ? response.substring(0, 137) + '...'
      : response;

    this.domElements.assistantResponse.textContent = displayText;
    this.domElements.assistantResponse.title = response;

    if (this.state.responseVisible && response) {
      this.domElements.assistantResponse.classList.add('visible');
    }
  }

  toggleResponseVisibility(): void {
    const newVisibility = !this.state.responseVisible;
    this.setState({ responseVisible: newVisibility });

    if (!this.domElements.assistantResponse) return;

    if (newVisibility && this.domElements.assistantResponse.textContent) {
      this.domElements.assistantResponse.classList.add('visible');
    } else {
      this.domElements.assistantResponse.classList.remove('visible');
    }
  }

  getTextInputValue(): string {
    if (!this.domElements.textInput) return '';
    return this.domElements.textInput.value.trim();
  }

  clearTextInput(): void {
    if (!this.domElements.textInput) return;
    this.domElements.textInput.value = '';
  }

  focusTextInput(): void {
    if (!this.domElements.textInput) return;
    this.domElements.textInput.focus();
  }

  showError(message: string): void {
    DOMUtils.showError(message);
  }

  private updateUI(): void {
    this.updateConnectionIndicator();
    this.updateTextInputVisibility();
    this.updateBackendStatus();
  }

  private updateConnectionIndicator(): void {
    if (!this.domElements.connectionDot || !this.domElements.connectionText) return;

    this.domElements.connectionDot.className = '';

    if (this.state.mode === 'recording') {
      this.domElements.connectionDot.classList.add('recording');
      this.domElements.connectionText.textContent = 'Recording';
    } else if (this.state.connected) {
      this.domElements.connectionDot.classList.add('connected');
      this.domElements.connectionText.textContent = 'Connected';
    } else {
      this.domElements.connectionDot.classList.add('disconnected');
      this.domElements.connectionText.textContent = 'Not connected';
    }
  }

  private updateTextInputVisibility(): void {
    if (!this.domElements.textInput) return;

    if (this.state.mode === 'text') {
      this.domElements.textInput.classList.add('visible');
    } else {
      this.domElements.textInput.classList.remove('visible');
    }
  }

  private updateBackendStatus(): void {
    if (!this.domElements.status) return;

    if (!this.state.backendReady) {
      this.domElements.status.textContent = 'Waiting for backend to start';
      this.domElements.status.className = 'status visible';
    } else {
      this.domElements.status.classList.remove('visible');
    }
  }
}
