


export const BACKEND_PORT = 40000;


export const HEALTH_CHECK_INTERVAL = 3000;
export const UI_STATUS_DISPLAY_DURATION = 3000;
export const WEBSOCKET_PING_INTERVAL = 15000;


export const AUDIO_CHUNK_INTERVAL = 100;
export const AUDIO_FFT_SIZE = 256;


export const MAX_RESPONSE_LENGTH = 140;
export const TRUNCATED_RESPONSE_LENGTH = 137;
export const UI_DELAY_SHORT = 100;


export const ANIMATION_BUFFERING_DELAY = 150;
export const TIME_CONVERSION_MULTIPLIER = 1000;


export const ENVIRONMENT_CONFIG = {
    bufferingDelay: 150,
    estimatedStartDelay: 300,
    wsReconnectDelay: 1000,
    maxReconnectAttempts: 5
};


export const TIMING_CONFIG = {
    bufferingDelay: 150,
    estimatedStartDelay: 300,
    wsReconnectDelay: 1000,
    maxReconnectAttempts: 5
};


export const AUDIO_CONFIG = {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
};


export const ANIMATION_CONFIG = {
    numPoints: 8,
    baseRadius: 55,
    centerX: 100,
    centerY: 100,
    noiseStep: 0.002,
    maxScale: 1.5,
    maxBrightness: 8,
    maxBlur: 25,
    minScale: 0.95,
    minBrightness: 1.2,
    minBlur: 12
};