import type { AppMode } from '../types/index';

class AppState {
  mode = $state<AppMode>('idle');
  connected = $state<boolean>(false);
  backendReady = $state<boolean>(false);
  responseVisible = $state<boolean>(false);

  connectionStatus = $derived(
    this.mode === 'recording' ? { text: 'Recording', class: 'recording' }
      : (this.connected && this.backendReady) ? { text: 'Connected', class: 'connected' }
        : { text: 'Not connected', class: 'disconnected' }
  );

  resetToIdle() {
    this.mode = 'idle';
  }

  setRecording() {
    this.mode = 'recording';
  }

  setProcessing() {
    this.mode = 'processing';
  }

  setSpeaking() {
    this.mode = 'speaking';
  }

  setTextMode() {
    this.mode = 'text';
  }

  toggleTextMode() {
    this.mode = this.mode === 'text' ? 'idle' : 'text';
  }

  toggleResponseVisibility() {
    this.responseVisible = !this.responseVisible;
  }

  setConnected(value: boolean) {
    this.connected = value;
  }

  setBackendReady(value: boolean) {
    this.backendReady = value;
  }

  setMode(value: AppMode) {
    this.mode = value;
  }
}


export const appState = new AppState();
