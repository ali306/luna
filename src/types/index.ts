
export interface AppState {
  mode: AppMode;
  connected: boolean;
  backendReady: boolean;
  responseVisible: boolean;
}

export type AppMode = 'idle' | 'recording' | 'processing' | 'speaking' | 'text';


export interface DOMElements {
  haloPath: SVGPathElement | null;
  status: HTMLElement | null;
  assistantResponse: HTMLElement | null;
  textInput: HTMLInputElement | null;
  connectionDot: HTMLElement | null;
  connectionText: HTMLElement | null;
}


export interface WebSocketMessage {
  type: string;
  timestamp?: number;
}

export interface PingMessage extends WebSocketMessage {
  type: 'ping';
  timestamp: number;
}

export interface PongMessage extends WebSocketMessage {
  type: 'pong';
}

export interface ChatMessage extends WebSocketMessage {
  type: 'chat';
  text: string;
}

export interface ChatResponseMessage extends WebSocketMessage {
  type: 'chat_response';
  response: string;
}

export interface AudioAnalysisMessage extends WebSocketMessage {
  type: 'audio_analysis';
  analysis: AudioAnalysisData[];
  duration: number;
  start_time: number;
  estimated_start_delay: number;
}

export interface TTSMessage extends WebSocketMessage {
  type: 'tts';
  text: string;
}

export interface TTSCompleteMessage extends WebSocketMessage {
  type: 'tts_complete';
}

export interface StopMessage extends WebSocketMessage {
  type: 'stop';
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  message: string;
}

export interface ModeChangeMessage extends WebSocketMessage {
  type: 'mode_change';
  mode: AppMode;
}

export type IncomingMessage =
  | PongMessage
  | ChatResponseMessage
  | AudioAnalysisMessage
  | TTSCompleteMessage
  | StopMessage
  | ErrorMessage;

export type OutgoingMessage =
  | PingMessage
  | ChatMessage
  | TTSMessage
  | StopMessage
  | ModeChangeMessage;


export interface AudioAnalysisData {
  time?: number;
  volume: number;
  bass: number;
  low_mid: number;
  high: number;
}

export interface CurrentSpeakingData {
  volume: number;
  bass: number;
  mid: number;
  high: number;
}


export interface AnimationPoint {
  x: number;
  y: number;
  originX: number;
  originY: number;
  noiseOffsetX: number;
  noiseOffsetY: number;
}

export interface AnimationConfig {
  numPoints: number;
  baseRadius: number;
  centerX: number;
  centerY: number;
  noiseStep: number;
  maxScale: number;
  maxBrightness: number;
  maxBlur: number;
  minScale: number;
  minBrightness: number;
  minBlur: number;
}


export interface AudioConfig {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}


export interface TimingConfig {
  bufferingDelay: number;
  estimatedStartDelay: number;
  wsReconnectDelay: number;
  maxReconnectAttempts: number;
}


export interface EnvironmentConfig {
  isTauri: boolean;
  apiBase: string;
  wsUrl: string | null;
}


export type KeyHandler = (event: KeyboardEvent) => void;
export type CleanupHandler = () => void;


export type StatusType = '' | 'error' | 'success';