import {
  AppState,
  AppMode,
  DOMElements,
  StatusType
} from '../types/index.js';
import { UI_STATUS_DISPLAY_DURATION, MAX_RESPONSE_LENGTH, TRUNCATED_RESPONSE_LENGTH } from '../config.js';
import { DOMUtils } from './dom-utils.js';

export class UIStateManager {
  private domElements: DOMElements;
  private state: AppState;

  constructor() {
    this.state = {
      mode: 'idle',
      connected: false,
      backendReady: false,
      responseVisible: false
    };

    this.domElements = {
      haloPath: null,
      status: null,
      assistantResponse: null,
      textInput: null,
      connectionDot: null,
      connectionText: null
    };
  }

  public async initialize(): Promise<void> {
    await this.waitForDOM();
  }

  public getState(): AppState {
    return { ...this.state };
  }

  public setState(newState: Partial<AppState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };

    if (oldState.mode !== this.state.mode) {
      console.log(`State transition: ${oldState.mode} -> ${this.state.mode}`);

      if (oldState.mode === 'text' && this.state.mode !== 'text') {

        setTimeout(() => {
          if (this.domElements.textInput && this.state.mode !== 'text') {
            this.domElements.textInput.blur();
          }
        }, 0);
      }
    }

    this.updateUI();
  }

  public setMode(mode: AppMode): void {
    this.setState({ mode });
  }

  public setConnected(connected: boolean): void {
    this.setState({ connected });
  }

  public setBackendReady(ready: boolean): void {
    this.setState({ backendReady: ready });
  }

  public getDOMElements(): DOMElements {
    return this.domElements;
  }

  public showStatus(message: string, persistent: boolean = false, type: StatusType = ''): void {
    const { status } = this.domElements;
    if (!status) return;

    status.textContent = message;
    status.className = `status visible ${type}`;

    if (!persistent) {
      setTimeout(() => {
        status.classList.remove('visible');
      }, UI_STATUS_DISPLAY_DURATION);
    }
  }

  public showError(message: string): void {
    DOMUtils.showError(message);
  }

  public displayAssistantResponse(response: string): void {
    if (!response || !this.domElements.assistantResponse) return;

    const truncated = response.length > MAX_RESPONSE_LENGTH ?
      response.slice(0, TRUNCATED_RESPONSE_LENGTH) + '...' : response;

    this.domElements.assistantResponse.textContent = truncated;
    this.domElements.assistantResponse.title = response;

    if (this.state.responseVisible) {
      this.domElements.assistantResponse.classList.add('visible');
    }
  }

  public toggleResponseVisibility(): void {
    this.state.responseVisible = !this.state.responseVisible;

    if (this.state.responseVisible &&
      this.domElements.assistantResponse &&
      this.domElements.assistantResponse.textContent) {
      this.domElements.assistantResponse.classList.add('visible');
    } else if (this.domElements.assistantResponse) {
      this.domElements.assistantResponse.classList.remove('visible');
    }
  }

  public getTextInputValue(): string {
    return this.domElements.textInput?.value.trim() || '';
  }

  public clearTextInput(): void {
    if (this.domElements.textInput) {
      this.domElements.textInput.value = '';
    }
  }

  public focusTextInput(): void {
    if (this.domElements.textInput) {
      this.domElements.textInput.focus();
    }
  }





  private async waitForDOM(): Promise<void> {
    const requiredIds = ['status', 'assistantResponse', 'textInput', 'connectionDot', 'connectionText'];
    const requiredSelectors = ['.halo-path'];

    return new Promise((resolve, reject) => {

      if (this.checkAndCacheElements(requiredIds, requiredSelectors)) {
        resolve();
        return;
      }


      const observer = new MutationObserver(() => {
        if (this.checkAndCacheElements(requiredIds, requiredSelectors)) {
          observer.disconnect();
          resolve();
        }
      });


      observer.observe(document.body, {
        childList: true,
        subtree: true
      });


      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Required DOM elements not found within timeout'));
      }, 10000);
    });
  }

  private checkAndCacheElements(requiredIds: string[], requiredSelectors: string[]): boolean {
    let allFound = true;


    for (const id of requiredIds) {
      const element = document.getElementById(id);
      if (element) {
        (this.domElements as any)[id] = element;
      } else {
        allFound = false;
      }
    }


    for (const selector of requiredSelectors) {
      const element = document.querySelector(selector);
      if (selector === '.halo-path' && element) {
        this.domElements.haloPath = element as SVGPathElement;
      } else if (!element) {
        allFound = false;
      }
    }

    return allFound;
  }

  private updateUI(): void {
    this.updateConnectionIndicator();
    this.updateTextInputVisibility();
    this.updateStatusDisplay();
  }

  private updateConnectionIndicator(): void {
    const { connectionDot, connectionText } = this.domElements;
    if (!connectionDot || !connectionText) return;

    connectionDot.className = 'connection-dot';

    if (this.state.mode === 'recording') {
      connectionDot.classList.add('recording');
      connectionText.textContent = 'Recording';
    } else if (this.state.connected) {
      connectionDot.classList.add('connected');
      connectionText.textContent = 'Connected';
    } else {
      connectionDot.classList.add('disconnected');
      connectionText.textContent = 'Not connected';
    }
  }

  private updateTextInputVisibility(): void {
    if (!this.domElements.textInput) return;

    if (this.state.mode === 'text') {
      this.domElements.textInput.classList.add('visible');
      setTimeout(() => {
        if (this.domElements.textInput && this.state.mode === 'text') {
          this.domElements.textInput.focus();
        }
      }, 0);
    } else {
      this.domElements.textInput.classList.remove('visible');
      setTimeout(() => {
        if (this.domElements.textInput && this.state.mode !== 'text') {
          this.domElements.textInput.blur();
        }
      }, 0);
    }
  }


  private updateStatusDisplay(): void {
    const { status } = this.domElements;
    if (!status) return;

    if (!this.state.backendReady) {
      status.textContent = 'Waiting for backend to start';
      status.className = 'status visible';
    } else {

      status.classList.remove('visible');
    }
  }

}