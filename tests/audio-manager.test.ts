import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { AudioManager } from '../src/modules/audio-manager.js';
import type { AudioConfig, EnvironmentConfig } from '../src/types/index.js';

describe('AudioManager', () => {
  let audioManager: AudioManager;
  let mockAudioConfig: AudioConfig;
  let mockEnvironment: EnvironmentConfig;
  let mockStream: MediaStream;
  let mockMediaRecorder: MediaRecorder;
  let mockAudioContext: AudioContext;

  beforeEach(() => {

    mockAudioConfig = {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };

    mockEnvironment = {
      isTauri: false,
      apiBase: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000/ws'
    };


    const mockTrack = { stop: vi.fn() };
    mockStream = {
      getTracks: vi.fn(() => [mockTrack])
    } as any;


    mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      state: 'inactive',
      ondataavailable: vi.fn(),
      onstop: vi.fn()
    } as any;


    mockAudioContext = {
      createAnalyser: vi.fn(() => ({
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn()
      })),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn()
      })),
      close: vi.fn()
    } as any;


    const MediaRecorderMock = vi.fn(() => mockMediaRecorder);
    MediaRecorderMock.isTypeSupported = vi.fn().mockReturnValue(true);
    global.MediaRecorder = MediaRecorderMock as any;
    global.AudioContext = vi.fn(() => mockAudioContext) as any;
    (navigator.mediaDevices.getUserMedia as MockedFunction<any>).mockResolvedValue(mockStream);

    audioManager = new AudioManager(mockAudioConfig, mockEnvironment);
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {

      const manager = new AudioManager(mockAudioConfig, mockEnvironment);


      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(AudioManager);
    });
  });

  describe('startRecording', () => {
    it('should successfully start recording with valid configuration', async () => {

      await audioManager.startRecording();


      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          sampleRate: mockAudioConfig.sampleRate,
          channelCount: mockAudioConfig.channelCount,
          echoCancellation: mockAudioConfig.echoCancellation,
          noiseSuppression: mockAudioConfig.noiseSuppression,
          autoGainControl: mockAudioConfig.autoGainControl
        }
      });
      expect(mockMediaRecorder.start).toHaveBeenCalledWith(100);
    });

    it('should setup audio analysis when starting recording', async () => {

      await audioManager.startRecording();


      expect(AudioContext).toHaveBeenCalled();
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
    });

    it('should throw error when getUserMedia fails', async () => {

      const error = new Error('Permission denied');
      (navigator.mediaDevices.getUserMedia as MockedFunction<any>).mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      await expect(audioManager.startRecording()).rejects.toThrow('Failed to access microphone');
      expect(consoleSpy).toHaveBeenCalledWith('Failed to start recording:', error);

      consoleSpy.mockRestore();
    });

    it('should handle different audio configurations', async () => {

      const customConfig: AudioConfig = {
        sampleRate: 44100,
        channelCount: 2,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      };
      const customManager = new AudioManager(customConfig, mockEnvironment);


      await customManager.startRecording();


      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: customConfig
      });
    });
  });

  describe('stopRecording', () => {
    it('should successfully stop recording and return audio blob', async () => {

      await audioManager.startRecording();
      mockMediaRecorder.state = 'recording';
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });


      const promise = audioManager.stopRecording();


      setTimeout(() => {
        if (mockMediaRecorder.onstop) {
          mockMediaRecorder.onstop(new Event('stop'));
        }
      }, 0);

      const result = await promise;


      expect(mockMediaRecorder.stop).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('audio/webm');
    });

    it('should reject when no active recording', async () => {

      await expect(audioManager.stopRecording()).rejects.toThrow('No active recording');
    });

    it('should reject when MediaRecorder is not in recording state', async () => {

      await audioManager.startRecording();
      mockMediaRecorder.state = 'inactive';


      await expect(audioManager.stopRecording()).rejects.toThrow('No active recording');
    });

    it('should cleanup resources after stopping', async () => {

      await audioManager.startRecording();
      mockMediaRecorder.state = 'recording';


      const promise = audioManager.stopRecording();

      setTimeout(() => {
        if (mockMediaRecorder.onstop) {
          mockMediaRecorder.onstop(new Event('stop'));
        }
      }, 0);

      await promise;


      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  describe('processRecording', () => {
    it('should successfully process audio blob and return transcription', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ transcription: 'Hello world' })
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);


      const result = await audioManager.processRecording(mockBlob);


      expect(fetch).toHaveBeenCalledWith(
        `${mockEnvironment.apiBase}/api/transcribe`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      );
      expect(result).toBe('Hello world');
    });

    it('should throw error when transcription API returns error status', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const mockResponse = { ok: false, status: 500 };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      await expect(audioManager.processRecording(mockBlob)).rejects.toThrow('Transcription failed: 500');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error when transcription is empty', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ transcription: '' })
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      await expect(audioManager.processRecording(mockBlob)).rejects.toThrow('No speech detected');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error when transcription is only whitespace', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ transcription: '   \n\t  ' })
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      await expect(audioManager.processRecording(mockBlob)).rejects.toThrow('No speech detected');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error when transcription is null', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ transcription: null })
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      await expect(audioManager.processRecording(mockBlob)).rejects.toThrow('No speech detected');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle network errors', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const networkError = new Error('Network error');
      global.fetch = vi.fn().mockRejectedValue(networkError);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      await expect(audioManager.processRecording(mockBlob)).rejects.toThrow('Network error');
      expect(consoleSpy).toHaveBeenCalledWith('Processing error:', networkError);

      consoleSpy.mockRestore();
    });

    it('should create proper FormData with correct file name', async () => {

      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ transcription: 'test' })
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);


      await audioManager.processRecording(mockBlob);


      const fetchCall = (fetch as MockedFunction<any>).mock.calls[0];
      const formData = fetchCall[1].body as FormData;
      const uploadedFile = formData.get('audio_file');
      expect(uploadedFile).toBeInstanceOf(Blob);
      expect((uploadedFile as Blob).type).toBe(mockBlob.type);
    });
  });

  describe('getAudioAnalyser', () => {
    it('should return null when not initialized', () => {

      const result = audioManager.getAudioAnalyser();


      expect(result).toBeNull();
    });

    it('should return analyser after starting recording', async () => {

      const mockAnalyser = { fftSize: 256 };
      mockAudioContext.createAnalyser = vi.fn().mockReturnValue(mockAnalyser);


      await audioManager.startRecording();
      const result = audioManager.getAudioAnalyser();


      expect(result).toBe(mockAnalyser);
    });
  });

  describe('getVolumeData', () => {
    it('should return null when analyser is not available', () => {

      const result = audioManager.getVolumeData();


      expect(result).toBeNull();
    });

    it('should return volume and bass data when analyser is available', async () => {

      const mockData = new Uint8Array([100, 150, 200, 50, 25, 75, 125, 175]);
      const mockAnalyser = {
        fftSize: 256,
        frequencyBinCount: 8,
        getByteFrequencyData: vi.fn((data) => {
          data.set(mockData);
        })
      };
      mockAudioContext.createAnalyser = vi.fn().mockReturnValue(mockAnalyser);

      await audioManager.startRecording();


      const result = audioManager.getVolumeData();


      expect(result).not.toBeNull();

      expect(result?.volume).toBeCloseTo(0.441, 3);


      expect(result?.bass).toBeCloseTo(0.392, 2);
    });

    it('should handle edge case with single frequency bin', async () => {

      const mockData = new Uint8Array([255]);
      const mockAnalyser = {
        fftSize: 256,
        frequencyBinCount: 1,
        getByteFrequencyData: vi.fn((data) => {
          data.set(mockData);
        })
      };
      mockAudioContext.createAnalyser = vi.fn().mockReturnValue(mockAnalyser);

      await audioManager.startRecording();


      const result = audioManager.getVolumeData();


      expect(result?.volume).toBe(1.0);

      expect(result?.bass).toBeNaN();
    });

    it('should handle zero data', async () => {

      const mockData = new Uint8Array([0, 0, 0, 0]);
      const mockAnalyser = {
        fftSize: 256,
        frequencyBinCount: 4,
        getByteFrequencyData: vi.fn((data) => {
          data.set(mockData);
        })
      };
      mockAudioContext.createAnalyser = vi.fn().mockReturnValue(mockAnalyser);

      await audioManager.startRecording();


      const result = audioManager.getVolumeData();


      expect(result?.volume).toBe(0);

      expect(result?.bass).toBeNaN();
    });
  });

  describe('cleanup', () => {
    it('should stop recording if active', async () => {

      await audioManager.startRecording();
      mockMediaRecorder.state = 'recording';


      audioManager.cleanup();


      expect(mockMediaRecorder.stop).toHaveBeenCalled();
    });

    it('should stop all stream tracks', async () => {

      await audioManager.startRecording();


      audioManager.cleanup();


      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('should close audio context', async () => {

      await audioManager.startRecording();


      audioManager.cleanup();


      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('should handle cleanup when not initialized', () => {

      expect(() => audioManager.cleanup()).not.toThrow();
    });

    it('should handle cleanup when MediaRecorder is not recording', async () => {

      await audioManager.startRecording();
      mockMediaRecorder.state = 'inactive';


      expect(() => audioManager.cleanup()).not.toThrow();
      expect(mockMediaRecorder.stop).not.toHaveBeenCalled();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle MediaRecorder.isTypeSupported returning false', async () => {

      const originalIsTypeSupported = MediaRecorder.isTypeSupported;
      MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false);


      await audioManager.startRecording();


      expect(MediaRecorder).toHaveBeenCalledWith(mockStream, { mimeType: 'audio/webm' });


      MediaRecorder.isTypeSupported = originalIsTypeSupported;
    });

    it('should handle ondataavailable with valid data', async () => {

      await audioManager.startRecording();
      const mockData = new Blob(['test'], { type: 'audio/webm' });


      if (mockMediaRecorder.ondataavailable) {
        mockMediaRecorder.ondataavailable({
          data: mockData
        } as any);
      }


      expect(mockData.size).toBeGreaterThan(0);
    });

    it('should handle ondataavailable with empty data', async () => {

      await audioManager.startRecording();
      const mockData = new Blob([], { type: 'audio/webm' });


      expect(() => {
        if (mockMediaRecorder.ondataavailable) {
          mockMediaRecorder.ondataavailable({
            data: mockData
          } as any);
        }
      }).not.toThrow();
    });

    it('should handle multiple start/stop cycles', async () => {

      const getUserMediaSpy = navigator.mediaDevices.getUserMedia as MockedFunction<any>;
      const mockTrack = mockStream.getTracks()[0];


      getUserMediaSpy.mockClear();
      mockTrack.stop.mockClear();


      await audioManager.startRecording();
      audioManager.cleanup();
      await audioManager.startRecording();
      audioManager.cleanup();


      expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
      expect(mockTrack.stop).toHaveBeenCalledTimes(2);
    });
  });
});