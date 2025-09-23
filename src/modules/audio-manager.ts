import { AudioConfig, EnvironmentConfig } from '../types/index.js';
import { AUDIO_CHUNK_INTERVAL, AUDIO_FFT_SIZE } from '../config.js';

export class AudioManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;

  constructor(
    private audioConfig: AudioConfig,
    private environment: EnvironmentConfig
  ) { }

  public async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.audioConfig.sampleRate,
          channelCount: this.audioConfig.channelCount,
          echoCancellation: this.audioConfig.echoCancellation,
          noiseSuppression: this.audioConfig.noiseSuppression,
          autoGainControl: this.audioConfig.autoGainControl
        }
      });

      this.setupAudioAnalysis();
      this.setupMediaRecorder();

      this.mediaRecorder!.start(AUDIO_CHUNK_INTERVAL);

    } catch (error) {
      console.error('Failed to start recording:', error);
      throw new Error('Failed to access microphone');
    }
  }

  public stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public async processRecording(audioBlob: Blob): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'recording.webm');

      const response = await fetch(`${this.environment.apiBase}/api/transcribe`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      const transcription = data.transcription;

      if (!transcription || !transcription.trim()) {
        throw new Error('No speech detected');
      }

      return transcription;

    } catch (error) {
      console.error('Processing error:', error);
      throw error;
    }
  }

  public getAudioAnalyser(): AnalyserNode | null {
    return this.audioAnalyser;
  }

  public getVolumeData(): { volume: number; bass: number } | null {
    if (!this.audioAnalyser) return null;

    const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
    this.audioAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const volume = sum / dataArray.length / 255;

    const bassEnd = Math.floor(dataArray.length * 0.2);
    let bassSum = 0;
    for (let i = 0; i < bassEnd; i++) {
      bassSum += dataArray[i];
    }
    const bass = bassSum / bassEnd / 255;

    return { volume, bass };
  }

  public cleanup(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioAnalyser = null;
    this.recordedChunks = [];
  }

  private setupAudioAnalysis(): void {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.audioAnalyser = this.audioContext.createAnalyser();
    this.audioAnalyser.fftSize = AUDIO_FFT_SIZE;

    const source = this.audioContext.createMediaStreamSource(this.stream!);
    source.connect(this.audioAnalyser);
  }

  private setupMediaRecorder(): void {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ?
      'audio/webm;codecs=opus' : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream!, { mimeType });
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };
  }
}