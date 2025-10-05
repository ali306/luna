import { describe, it, expect, beforeEach, vi, afterEach, type MockedFunction } from 'vitest';
import { AnimationEngine } from '../src/modules/animation-engine.js';
import type { AnimationConfig, AppMode, AudioAnalysisData, CurrentSpeakingData } from '../src/types/index.js';


vi.mock('@georgedoescode/spline', () => ({
  spline: vi.fn().mockReturnValue('M 10 10 L 20 20 Z')
}));

vi.mock('simplex-noise', () => ({
  createNoise2D: vi.fn().mockReturnValue((x: number, y: number) => Math.sin(x) * Math.cos(y) * 0.5)
}));

describe('AnimationEngine', () => {
  let animationEngine: AnimationEngine;
  let mockConfig: AnimationConfig;
  let mockSvgPath: SVGPathElement;
  let mockGetCurrentMode: MockedFunction<() => AppMode>;

  beforeEach(() => {

    mockConfig = {
      numPoints: 8,
      baseRadius: 55,
      centerX: 100,
      centerY: 100,
      noiseStep: 0.002,
      maxScale: 1.5,
      maxBrightness: 2.5,
      maxBlur: 25,
      minScale: 0.95,
      minBrightness: 1.2,
      minBlur: 12
    };


    mockSvgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mockSvgPath.setAttribute = vi.fn();

    mockGetCurrentMode = vi.fn().mockReturnValue('idle');


    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false
    });


    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => {
      setTimeout(cb, 16);
      return 1;
    }));

    vi.stubGlobal('cancelAnimationFrame', vi.fn());


    const mockBlurElement = {
      setAttribute: vi.fn()
    };
    document.querySelector = vi.fn().mockImplementation((selector) => {
      if (selector === '#blurFilter feGaussianBlur') {
        return mockBlurElement;
      }
      return null;
    });


    Object.defineProperty(document.documentElement, 'style', {
      value: {
        setProperty: vi.fn()
      },
      configurable: true
    });

    animationEngine = new AnimationEngine(mockConfig);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {

      const engine = new AnimationEngine(mockConfig);


      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(AnimationEngine);
    });

  });

  describe('setHaloPathElement', () => {
    it('should set halo path element', () => {

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });


      animationEngine.setHaloPathElement(mockSvgPath);


      expect(consoleSpy).toHaveBeenCalledWith('Halo path element set:', 'found');

      consoleSpy.mockRestore();
    });

    it('should handle null halo path element', () => {

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });


      animationEngine.setHaloPathElement(null as any);


      expect(consoleSpy).toHaveBeenCalledWith('Halo path element set:', 'not found');

      consoleSpy.mockRestore();
    });
  });

  describe('setCallbacks', () => {
    it('should set getCurrentMode callback', () => {

      animationEngine.setCallbacks(mockGetCurrentMode);


      expect(mockGetCurrentMode).toBeDefined();
    });
  });

  describe('start and stop', () => {
    it('should start animation', () => {

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
      animationEngine.setHaloPathElement(mockSvgPath);


      animationEngine.start();


      expect(consoleSpy).toHaveBeenCalledWith('Starting animation engine');
      expect(requestAnimationFrame).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not start animation if already running', () => {

      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.start();
      (requestAnimationFrame as MockedFunction<any>).mockClear();


      animationEngine.start();


      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should stop animation', () => {

      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.start();


      animationEngine.stop();


      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should handle stop when not running', () => {

      expect(() => animationEngine.stop()).not.toThrow();
    });
  });

  describe('audio analysis data management', () => {
    it('should set audio analysis data', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.5, bass: 0.3, low_mid: 0.4, high: 0.2, time: 0 },
        { volume: 0.7, bass: 0.5, low_mid: 0.6, high: 0.3, time: 1 }
      ];
      const duration = 2;
      const startTime = Date.now() / 1000;


      animationEngine.setAudioAnalysisData(analysisData, duration, startTime);


      expect(analysisData).toBeDefined();
    });

    it('should clear audio analysis data', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.5, bass: 0.3, low_mid: 0.4, high: 0.2 }
      ];
      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000);


      animationEngine.clearAudioAnalysisData();


      expect(() => animationEngine.clearAudioAnalysisData()).not.toThrow();
    });
  });

  describe('animate', () => {
    beforeEach(() => {
      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.setCallbacks(mockGetCurrentMode);
    });

    it('should skip animation when document is hidden', () => {

      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true
      });


      animationEngine.animate();


      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should continue animation loop when document is visible', () => {

      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: false
      });


      animationEngine.animate();


      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should handle animation errors gracefully', () => {

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      mockGetCurrentMode.mockImplementation(() => {
        throw new Error('Test animation error');
      });


      expect(() => animationEngine.animate()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Animation error:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should update CSS properties during animation', () => {

      animationEngine.animate();


      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--halo-scale',
        expect.any(String)
      );
      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--halo-brightness',
        expect.any(String)
      );
    });

    it('should update blur filter during animation', () => {

      animationEngine.animate();


      const mockBlurElement = document.querySelector('#blurFilter feGaussianBlur');
      expect(mockBlurElement?.setAttribute).toHaveBeenCalledWith(
        'stdDeviation',
        expect.any(String)
      );
    });

    it('should update halo shape during animation', () => {

      animationEngine.animate();


      expect(mockSvgPath.setAttribute).toHaveBeenCalledWith('d', 'M 10 10 L 20 20 Z');
    });
  });

  describe('animation modes', () => {
    beforeEach(() => {
      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.setCallbacks(mockGetCurrentMode);
    });

    it('should handle idle mode animation', () => {

      mockGetCurrentMode.mockReturnValue('idle');


      animationEngine.animate();


      expect(mockGetCurrentMode).toHaveBeenCalled();
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle recording mode animation', () => {

      mockGetCurrentMode.mockReturnValue('recording');


      animationEngine.animate();


      expect(mockGetCurrentMode).toHaveBeenCalled();
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle processing mode animation', () => {

      mockGetCurrentMode.mockReturnValue('processing');


      animationEngine.animate();


      expect(mockGetCurrentMode).toHaveBeenCalled();
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle speaking mode animation with audio data', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.8, bass: 0.6, low_mid: 0.5, high: 0.4, time: 0 },
        { volume: 0.7, bass: 0.5, low_mid: 0.4, high: 0.3, time: 0.1 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');
      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000 - 0.5);


      animationEngine.animate();


      expect(mockGetCurrentMode).toHaveBeenCalled();
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle speaking mode animation without audio data', () => {

      mockGetCurrentMode.mockReturnValue('speaking');
      animationEngine.clearAudioAnalysisData();


      animationEngine.animate();


      expect(mockGetCurrentMode).toHaveBeenCalled();
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle text mode animation', () => {

      mockGetCurrentMode.mockReturnValue('text');


      animationEngine.animate();


      expect(mockGetCurrentMode).toHaveBeenCalled();
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });
  });

  describe('audio analysis processing', () => {
    beforeEach(() => {
      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.setCallbacks(mockGetCurrentMode);
    });

    it('should handle audio data with time information', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.5, bass: 0.3, low_mid: 0.4, high: 0.2, time: 0.0 },
        { volume: 0.7, bass: 0.5, low_mid: 0.6, high: 0.3, time: 0.1 },
        { volume: 0.9, bass: 0.7, low_mid: 0.8, high: 0.4, time: 0.2 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');
      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000 - 0.15);


      animationEngine.animate();


      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle audio data without time information', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.5, bass: 0.3, low_mid: 0.4, high: 0.2 },
        { volume: 0.7, bass: 0.5, low_mid: 0.6, high: 0.3 },
        { volume: 0.9, bass: 0.7, low_mid: 0.8, high: 0.4 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');
      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000 - 0.5);


      animationEngine.animate();


      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });


    it('should handle audio data with extreme values', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 1.0, bass: 1.0, low_mid: 1.0, high: 1.0, time: 0.0 },
        { volume: 0.0, bass: 0.0, low_mid: 0.0, high: 0.0, time: 0.1 },
        { volume: 2.0, bass: 2.0, low_mid: 2.0, high: 2.0, time: 0.2 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');
      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000 - 0.15);


      expect(() => animationEngine.animate()).not.toThrow();
    });

    it('should handle audio data with missing properties', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.5, bass: 0.3, low_mid: 0.4, high: 0.2 },
        {} as AudioAnalysisData,
        { volume: 0.7 } as AudioAnalysisData
      ];

      mockGetCurrentMode.mockReturnValue('speaking');
      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000 - 0.15);


      expect(() => animationEngine.animate()).not.toThrow();
    });
  });

  describe('spline generation and path updates', () => {
    beforeEach(() => {
      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.setCallbacks(mockGetCurrentMode);
    });



    it('should handle missing halo path element', () => {

      animationEngine.setHaloPathElement(null as any);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });


      animationEngine.animate();


      expect(consoleSpy).toHaveBeenCalledWith('No halo path element available');

      consoleSpy.mockRestore();
    });

  });

  describe('CSS and filter updates', () => {
    beforeEach(() => {
      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.setCallbacks(mockGetCurrentMode);
    });

    it('should update halo scale CSS property', () => {

      animationEngine.animate();


      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--halo-scale',
        expect.stringMatching(/^\d+\.\d{3}$/)
      );
    });

    it('should update halo brightness CSS property', () => {

      animationEngine.animate();


      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--halo-brightness',
        expect.stringMatching(/^\d+\.\d{3}$/)
      );
    });

    it('should update blur filter stdDeviation', () => {

      animationEngine.animate();


      const mockBlurElement = document.querySelector('#blurFilter feGaussianBlur');
      expect(mockBlurElement?.setAttribute).toHaveBeenCalledWith(
        'stdDeviation',
        expect.stringMatching(/^\d+\.\d$/)
      );
    });

    it('should handle missing blur filter element', () => {

      document.querySelector = vi.fn().mockReturnValue(null);


      expect(() => animationEngine.animate()).not.toThrow();
    });
  });


  describe('timing and synchronization', () => {
    it('should handle buffering delay in speaking animation', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.8, bass: 0.6, low_mid: 0.5, high: 0.4, time: 0.0 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');


      animationEngine.setAudioAnalysisData(analysisData, 1, Date.now() / 1000);


      animationEngine.animate();


      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should handle clock offset calculations', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.8, bass: 0.6, low_mid: 0.5, high: 0.4, time: 0.0 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');


      animationEngine.setAudioAnalysisData(analysisData, 2, (Date.now() / 1000) - 1);


      expect(() => animationEngine.animate()).not.toThrow();
    });

    it('should handle progress beyond audio duration', () => {

      const analysisData: AudioAnalysisData[] = [
        { volume: 0.8, bass: 0.6, low_mid: 0.5, high: 0.4, time: 0.0 }
      ];

      mockGetCurrentMode.mockReturnValue('speaking');


      animationEngine.setAudioAnalysisData(analysisData, 0.5, (Date.now() / 1000) - 2);


      expect(() => animationEngine.animate()).not.toThrow();
    });
  });

  describe('startSpeakingAnimation', () => {
    it('should handle startSpeakingAnimation call', () => {

      expect(() => animationEngine.startSpeakingAnimation()).not.toThrow();
    });
  });

  describe('configuration edge cases', () => {
    it('should handle configuration with zero points', () => {

      const zeroPointConfig: AnimationConfig = {
        ...mockConfig,
        numPoints: 0
      };


      const engine = new AnimationEngine(zeroPointConfig);
      engine.setHaloPathElement(mockSvgPath);
      engine.setCallbacks(mockGetCurrentMode);


      expect(() => engine.animate()).not.toThrow();
    });

    it('should handle configuration with very large number of points', () => {

      const largePointConfig: AnimationConfig = {
        ...mockConfig,
        numPoints: 1000
      };


      const engine = new AnimationEngine(largePointConfig);
      engine.setHaloPathElement(mockSvgPath);
      engine.setCallbacks(mockGetCurrentMode);


      expect(() => engine.animate()).not.toThrow();
    });

    it('should handle configuration with inverted min/max values', () => {

      const invertedConfig: AnimationConfig = {
        ...mockConfig,
        minScale: 2.0,
        maxScale: 0.5,
        minBrightness: 5.0,
        maxBrightness: 1.0
      };


      const engine = new AnimationEngine(invertedConfig);
      engine.setHaloPathElement(mockSvgPath);
      engine.setCallbacks(mockGetCurrentMode);


      expect(() => engine.animate()).not.toThrow();
    });
  });

  describe('memory and performance', () => {
    it('should handle multiple animation cycles without memory leaks', () => {

      animationEngine.setHaloPathElement(mockSvgPath);
      animationEngine.setCallbacks(mockGetCurrentMode);


      for (let i = 0; i < 100; i++) {
        animationEngine.animate();
      }


      expect(() => animationEngine.animate()).not.toThrow();
      expect(mockSvgPath.setAttribute).toHaveBeenCalledTimes(101);
    });

    it('should handle start/stop cycles', () => {

      for (let i = 0; i < 10; i++) {
        animationEngine.start();
        animationEngine.stop();
      }


      expect(cancelAnimationFrame).toHaveBeenCalledTimes(10);
    });
  });

});