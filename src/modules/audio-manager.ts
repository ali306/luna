import { AudioConfig, EnvironmentConfig } from '../types/index.js';
import { AUDIO_CHUNK_INTERVAL, AUDIO_FFT_SIZE } from '../config.js';

export class AudioManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private streamAcquisition: Promise<void> | null = null;
  private abortRecording: boolean = false;

  // Audio playback properties
  private playbackContext: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private playbackAnalyser: AnalyserNode | null = null;
  private audioChunks: Uint8Array[] = [];
  private expectedChunks: number = 0;
  // @ts-ignore - totalSize is stored for future audio stream management
  private totalSize: number = 0;
  private playbackCompleteCallback: (() => void) | null = null;
  private currentAudioUrl: string | null = null;

  constructor(
    private audioConfig: AudioConfig,
    private environment: EnvironmentConfig
  ) {
    // Pre-warm audio context to reduce latency
    this.initPlaybackContext();
  }

  private async initPlaybackContext(): Promise<void> {
    if (!this.playbackContext) {
      // Create AudioContext for analysis/visualization
      // Let browser handle sample rate conversion from audio file
      this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log(`Audio context initialized (sample rate: ${this.playbackContext.sampleRate}Hz)`);

      // Create analyser for visualization
      this.playbackAnalyser = this.playbackContext.createAnalyser();
      this.playbackAnalyser.fftSize = AUDIO_FFT_SIZE;
    }

    // Ensure context is running
    if (this.playbackContext.state === 'suspended') {
      try {
        await this.playbackContext.resume();
        console.log('Audio context resumed');
      } catch (error) {
        console.warn('Failed to resume audio context:', error);
      }
    }
  }

  public async startRecording(): Promise<void> {
    // Clear abort flag for new recording
    this.abortRecording = false;

    // Track the acquisition promise for cleanup
    this.streamAcquisition = (async () => {
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

        // Check if cleanup was called during acquisition
        if (this.abortRecording) {
          console.log('Recording aborted during stream acquisition');
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
          return;
        }

        this.setupAudioAnalysis();
        this.setupMediaRecorder();

        this.mediaRecorder!.start(AUDIO_CHUNK_INTERVAL);

      } catch (error) {
        console.error('Failed to start recording:', error);
        throw new Error('Failed to access microphone');
      } finally {
        this.streamAcquisition = null;
      }
    })();

    await this.streamAcquisition;
  }

  public stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        await this.cleanup();
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

  public initAudioStream(totalChunks: number, totalSize: number): void {
    console.log(`Initializing audio stream: ${totalChunks} chunks, ${totalSize} bytes total`);

    // Clean up previous audio
    this.stopPlayback();

    this.audioChunks = [];
    this.expectedChunks = totalChunks;
    this.totalSize = totalSize;

    // Ensure audio context is ready
    this.initPlaybackContext();
  }

  public addBinaryAudioChunk(chunk: Uint8Array): void {
    this.audioChunks.push(chunk);
    console.log(`Received binary chunk ${this.audioChunks.length}/${this.expectedChunks}, size: ${chunk.length} bytes`);

    // Play when all chunks are received
    if (this.audioChunks.length === this.expectedChunks) {
      console.log(`All chunks received (${this.expectedChunks}), starting playback`);
      this.playAudio().catch(error => {
        console.error('Playback failed:', error);
      });
    }
  }


  public async playAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      console.warn('No audio chunks to play');
      return;
    }

    try {
      // Ensure playback context is ready
      if (!this.playbackContext) await this.initPlaybackContext();
      if (!this.playbackContext) throw new Error('Failed to initialize audio context');

      if (this.playbackContext.state === 'suspended') {
        await this.playbackContext.resume();
      }

      // Concatenate all chunks into a single blob
      let totalBytes = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const audioData = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of this.audioChunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }

      // Create blob from WAV data
      const audioBlob = new Blob([audioData], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);

      // Store URL for cleanup
      if (this.currentAudioUrl) {
        URL.revokeObjectURL(this.currentAudioUrl);
      }
      this.currentAudioUrl = audioUrl;

      console.log(`Created audio blob: ${audioBlob.size} bytes`);

      // Create or reuse audio element
      if (!this.audioElement) {
        this.audioElement = new Audio();

        // Connect audio element to Web Audio API for visualization
        if (!this.mediaElementSource) {
          this.mediaElementSource = this.playbackContext.createMediaElementSource(this.audioElement);
          this.mediaElementSource.connect(this.playbackAnalyser!);
          this.playbackAnalyser!.connect(this.playbackContext.destination);
        }

        // Setup event handlers
        this.audioElement.onended = () => {
          console.log('Audio playback completed');
          if (this.playbackCompleteCallback) {
            this.playbackCompleteCallback();
          }
        };

        this.audioElement.onerror = (e) => {
          console.error('Audio playback error:', e);
        };
      }

      // Set source and play
      this.audioElement.src = audioUrl;
      await this.audioElement.play();

      console.log(`Playback started via HTML5 Audio`);
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }




  public stopPlayback(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }

    // Clean up blob URL
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    this.clearAudioChunks();
  }

  public clearAudioChunks(): void {
    this.audioChunks = [];
    this.expectedChunks = 0;
  }

  public getPlaybackAnalyser(): AnalyserNode | null {
    return this.playbackAnalyser;
  }

  public onPlaybackComplete(callback: () => void): void {
    this.playbackCompleteCallback = callback;
  }

  public async cleanup(): Promise<void> {
    // Signal any in-flight recording to abort
    this.abortRecording = true;

    // Wait for any pending stream acquisition to complete
    if (this.streamAcquisition) {
      try {
        await this.streamAcquisition;
      } catch (error) {
        console.error('Error during stream acquisition cleanup:', error);
      }
    }

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

    this.stopPlayback();

    // Clean up audio element
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }

    if (this.mediaElementSource) {
      this.mediaElementSource.disconnect();
      this.mediaElementSource = null;
    }

    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }

    this.audioAnalyser = null;
    this.playbackAnalyser = null;
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