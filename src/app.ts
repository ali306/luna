import { WebSocketManager } from './modules/websocket-manager';
import { AudioManager } from './modules/audio-manager';
import { AnimationEngine } from './modules/animation-engine';
import { UIStateManager } from './modules/ui-state-manager';
import { KeyboardHandler } from './modules/keyboard-handler';
import { DOMUtils } from './modules/dom-utils';

import {
  EnvironmentConfig,
  TimingConfig,
  AudioConfig,
  AnimationConfig,
  AudioAnalysisMessage,
  ChatResponseMessage,
  TTSCompleteMessage,
  StopMessage,
  ErrorMessage
} from './types/index';
import {
  BACKEND_PORT,
  HEALTH_CHECK_INTERVAL,
  TIMING_CONFIG,
  AUDIO_CONFIG,
  ANIMATION_CONFIG
} from './config';

export class VoiceAssistantApp {
  private wsManager: WebSocketManager;
  private audioManager: AudioManager;
  private animationEngine: AnimationEngine;
  private uiManager: UIStateManager;
  private keyboardHandler: KeyboardHandler;


  private environment: EnvironmentConfig;
  private timing: TimingConfig;
  private audioConfig: AudioConfig;
  private animationConfig: AnimationConfig;


  constructor() {

    this.environment = {
      isTauri: !!(window as any).__TAURI__,
      apiBase: !!(window as any).__TAURI__ ? `http://127.0.0.1:${BACKEND_PORT}` : '',
      wsUrl: !!(window as any).__TAURI__ ? `ws://127.0.0.1:${BACKEND_PORT}/ws` : null
    };

    this.timing = TIMING_CONFIG;

    this.audioConfig = AUDIO_CONFIG;

    this.animationConfig = ANIMATION_CONFIG;


    this.wsManager = new WebSocketManager(this.environment, this.timing);
    this.audioManager = new AudioManager(this.audioConfig, this.environment);
    this.animationEngine = new AnimationEngine(this.animationConfig);
    this.uiManager = new UIStateManager();
    this.keyboardHandler = new KeyboardHandler();

    this.setupModuleInteractions();
  }

  public async initialize(): Promise<void> {
    try {
      await this.uiManager.initialize();
      this.setupUIEventHandlers();


      const domElements = this.uiManager.getDOMElements();
      if (domElements.haloPath) {
        this.animationEngine.setHaloPathElement(domElements.haloPath);
      }


      this.animationEngine.setCallbacks(
        () => this.uiManager.getState().mode
      );

      this.animationEngine.start();
      this.wsManager.connect();
      this.startHealthCheck();

      console.log('Voice Assistant initialized successfully');
    } catch (error) {
      console.error('Initialization failed:', error);
      this.uiManager.showError('Failed to initialize. Please refresh the page.');
    }
  }

  public cleanup(): void {
    this.animationEngine.stop();
    this.audioManager.cleanup();
    this.wsManager.disconnect();
    this.keyboardHandler.cleanup();
  }

  private setupModuleInteractions(): void {

    this.wsManager.onMessage('chat_response', (data: ChatResponseMessage) => {
      this.handleChatResponse(data.response);
    });

    this.wsManager.onMessage('audio_analysis', (data: AudioAnalysisMessage) => {
      this.handleAudioAnalysis(data.analysis, data.duration, data.start_time, data.estimated_start_delay);
    });

    this.wsManager.onMessage('tts_complete', (_data: TTSCompleteMessage) => {
      this.handleTTSComplete();
    });

    this.wsManager.onMessage('stop', (_data: StopMessage) => {
      this.handleStop();
    });

    this.wsManager.onMessage('error', (data: ErrorMessage) => {
      this.uiManager.showStatus(`Error: ${data.message}`, false, 'error');
      this.uiManager.setMode('idle');
    });


    this.wsManager.onConnectionStateChange((connected: boolean) => {
      this.uiManager.setConnected(connected);
    });


  }

  private setupUIEventHandlers(): void {
    const domElements = this.uiManager.getDOMElements();
    this.keyboardHandler = new KeyboardHandler(domElements.textInput);

    this.keyboardHandler.setupEventListeners(
      {
        onSpace: () => this.handleSpaceKey(),
        onTextMode: () => this.toggleTextMode(),
        onEscape: () => this.handleEscape(),
        onToggleResponse: () => this.uiManager.toggleResponseVisibility(),
        onTextSubmit: () => this.sendTextMessage()
      },
      () => this.uiManager.getState(),
      DOMUtils.isTypingContext
    );
  }

  private async handleSpaceKey(): Promise<void> {
    const currentState = this.uiManager.getState();

    if (currentState.mode === 'idle') {
      await this.startRecording();
    } else if (currentState.mode === 'recording') {
      this.stopRecording();
    } else if (currentState.mode === 'speaking') {
      this.stopSpeaking();
    }
  }

  private handleEscape(): void {
    const currentState = this.uiManager.getState();

    if (currentState.mode === 'recording') {
      this.stopRecording();
    } else if (currentState.mode === 'speaking') {
      this.stopSpeaking();
    } else if (currentState.mode === 'text') {
      this.uiManager.setMode('idle');
      this.uiManager.clearTextInput();
      if (this.wsManager.isConnected()) {
        this.wsManager.send({
          type: 'mode_change',
          mode: 'idle'
        });
      }
      return;
    }
    this.uiManager.setMode('idle');
  }

  private toggleTextMode(): void {
    const currentState = this.uiManager.getState();

    if (currentState.mode === 'text') {
      this.uiManager.setMode('idle');
      this.uiManager.clearTextInput();
    } else if (currentState.mode === 'idle') {

      this.uiManager.setMode('text');
    }


    if (this.wsManager.isConnected()) {
      this.wsManager.send({
        type: 'mode_change',
        mode: this.uiManager.getState().mode
      });
    }
  }

  private async startRecording(): Promise<void> {
    const currentState = this.uiManager.getState();
    if (currentState.mode !== 'idle') return;

    try {
      await this.audioManager.startRecording();
      this.uiManager.setMode('recording');
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.uiManager.showStatus('Failed to access microphone', false, 'error');
      this.uiManager.setMode('idle');
    }
  }

  private stopRecording(): void {
    const currentState = this.uiManager.getState();
    if (currentState.mode !== 'recording') return;

    this.uiManager.setMode('processing');
    this.processRecording();
  }

  private async processRecording(): Promise<void> {
    try {
      const audioBlob = await this.audioManager.stopRecording();
      const transcription = await this.audioManager.processRecording(audioBlob);

      if (this.wsManager.isConnected()) {
        this.wsManager.send({
          type: 'chat',
          text: transcription
        });
      }
    } catch (error) {
      console.error('Processing error:', error);
      if (error instanceof Error && error.message === 'No speech detected') {
        this.uiManager.showStatus('No speech detected', false, 'error');
      } else {
        this.uiManager.showStatus('Processing failed', false, 'error');
      }
      this.uiManager.setMode('idle');
    }
  }

  private async sendTextMessage(): Promise<void> {
    const message = this.uiManager.getTextInputValue();
    if (!message) return;

    this.uiManager.clearTextInput();

    if (this.wsManager.isConnected()) {
      this.wsManager.send({
        type: 'chat',
        text: message
      });
      this.uiManager.setMode('processing');
    } else {
      this.uiManager.showStatus('Not connected', false, 'error');
    }
  }

  private handleChatResponse(response: string): void {
    if (!response) return;

    this.uiManager.displayAssistantResponse(response);

    if (this.wsManager.isConnected()) {
      this.wsManager.send({
        type: 'tts',
        text: response
      });
      this.uiManager.setMode('speaking');
    }
  }

  private handleAudioAnalysis(
    analysis: any[],
    duration: number,
    startTime: number,
    _estimatedStartDelay: number
  ): void {
    if (!Array.isArray(analysis)) return;

    this.animationEngine.setAudioAnalysisData(analysis, duration, startTime);



    const currentState = this.uiManager.getState();

    if (currentState.mode === 'speaking') {
      this.animationEngine.startSpeakingAnimation();
    } else {

      this.uiManager.setMode('speaking');
      this.animationEngine.startSpeakingAnimation();
    }
  }

  private handleTTSComplete(): void {
    this.animationEngine.clearAudioAnalysisData();
    this.uiManager.setMode('idle');
  }

  private handleStop(): void {
    this.uiManager.setMode('idle');
    this.animationEngine.clearAudioAnalysisData();
  }

  private stopSpeaking(): void {
    if (this.wsManager.isConnected()) {
      this.wsManager.send({ type: 'stop' });
    }
    this.uiManager.setMode('idle');
  }

  private async startHealthCheck(): Promise<void> {
    if (!this.environment.isTauri) return;

    try {
      const response = await fetch(`${this.environment.apiBase}/api/health`, {
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'healthy') {
          this.uiManager.setBackendReady(true);
          console.log('Backend is healthy');
          return;
        } else if (data.status === 'loading') {
          this.uiManager.showStatus('Loading speech recognition models...', true);
          setTimeout(() => this.startHealthCheck(), 1000);
          return;
        }
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }

    setTimeout(() => this.startHealthCheck(), HEALTH_CHECK_INTERVAL);
  }
}