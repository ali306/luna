import type { StatusType } from '../types/index';
import { UI_STATUS_DISPLAY_DURATION, MAX_RESPONSE_LENGTH, TRUNCATED_RESPONSE_LENGTH } from '../config';


class UIState {
  statusMessage = $state<string>('');
  statusType = $state<StatusType>('');
  statusVisible = $state<boolean>(false);
  statusPersistent = $state<boolean>(false);
  assistantResponse = $state<string>('');

  private statusTimeout: number | null = null;


  get displayResponse() {
    if (!this.assistantResponse) return '';

    if (this.assistantResponse.length > MAX_RESPONSE_LENGTH) {
      return this.assistantResponse.slice(0, TRUNCATED_RESPONSE_LENGTH) + '...';
    }

    return this.assistantResponse;
  }


  showStatus(message: string, persistent: boolean = false, type: StatusType = '') {
    this.statusMessage = message;
    this.statusType = type;
    this.statusVisible = true;
    this.statusPersistent = persistent;

    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    if (!persistent) {
      this.statusTimeout = setTimeout(() => {
        this.statusVisible = false;
      }, UI_STATUS_DISPLAY_DURATION) as unknown as number;
    }
  }

  hideStatus() {
    this.statusVisible = false;
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }
  }

  showError(message: string) {
    this.showStatus(message, false, 'error');
  }

  setAssistantResponse(response: string) {
    this.assistantResponse = response;
  }

  clearAssistantResponse() {
    this.assistantResponse = '';
  }
}


export const uiState = new UIState();
