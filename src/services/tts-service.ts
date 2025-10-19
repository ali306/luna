interface TTSOptions {
  speed?: number;
}

class TTSService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private apiBase: string = '';
  private onPlaybackStartCallback: (() => void) | null = null;


  private readonly FFT_SIZE = 1024;
  private readonly SMOOTHING = 0.3;

  constructor() { }

  setApiBase(apiBase: string): void {
    this.apiBase = apiBase;
    console.log('[TTS] API base set to:', apiBase);
  }

  async initialize(): Promise<void> {
    await this.ensureAudioContext();
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();


      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.FFT_SIZE;
      this.analyser.smoothingTimeConstant = this.SMOOTHING;
      this.analyser.connect(this.audioContext.destination);

      console.log('[TTS] Audio context initialized');
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    try {
      console.log('[TTS] Generating speech for text:', text.substring(0, 50) + '...');


      this.stop();


      const url = this.apiBase ? `${this.apiBase}/api/tts/generate` : '/api/tts/generate';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: 'af_heart',
          speed: options.speed || 1.0,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TTS generation failed: ${error}`);
      }


      const audioBlob = await response.blob();


      await this.playAudioBlob(audioBlob);
    } catch (error) {
      console.error('[TTS] Speech generation failed:', error);
      throw error;
    }
  }

  private async playAudioBlob(blob: Blob): Promise<void> {
    const audioContext = await this.ensureAudioContext();


    const arrayBuffer = await blob.arrayBuffer();


    if (!this.audioContext || !this.analyser) {
      console.log('[TTS] Playback aborted - service was cleaned up');
      return;
    }

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);


    if (!this.audioContext || !this.analyser) {
      console.log('[TTS] Playback aborted - service was cleaned up');
      return;
    }


    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;


    source.connect(this.analyser);

    this.isPlaying = true;
    this.currentSource = source;


    return new Promise((resolve) => {
      source.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        console.log('[TTS] Playback completed');
        resolve();
      };

      source.start(0);
      console.log('[TTS] Playback started');

      if (this.onPlaybackStartCallback) {
        this.onPlaybackStartCallback();
      }
    });
  }

  stop(): void {
    if (this.currentSource && this.isPlaying) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {

      }
      this.currentSource = null;
      this.isPlaying = false;
      console.log('[TTS] Stopped');
    }
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  onPlaybackStart(callback: () => void): void {
    this.onPlaybackStartCallback = callback;
  }

  cleanup(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }
    this.onPlaybackStartCallback = null;
  }
}


export const ttsService = new TTSService();
