import { spline } from '@georgedoescode/spline';
import { createNoise2D } from 'simplex-noise';
import type { AnimationPoint, AnimationConfig, AppMode } from '../types/index.js';


interface AudioFeatures {
  volume: number;
  bass: number;
  mid: number;
  high: number;
}



const engineState = $state({
  mode: 'idle' as AppMode,
  analyser: null as AnalyserNode | null,
  haloPath: null as SVGPathElement | null
});


export function setMode(newMode: AppMode) {
  engineState.mode = newMode;
}

export function setAnalyser(newAnalyser: AnalyserNode | null) {
  engineState.analyser = newAnalyser;
}

export function setHaloPath(path: SVGPathElement | null) {
  engineState.haloPath = path;
}

class AnimationEngine {

  private config: AnimationConfig;
  private noise2D: (x: number, y: number) => number;
  private points: AnimationPoint[] = [];
  private animationId: number | null = null;


  private frequencyData: Uint8Array | null = null;
  private frequencyBinRanges: { bass: [number, number]; mid: [number, number]; high: [number, number] } | null = null;


  private smoothedScale = 1.0;
  private smoothedBrightness = 6;
  private smoothedBlur = 15;
  private smoothedDisplacement = 0;


  private smoothedVolume = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedHigh = 0;


  private proceduralNoiseTime = 0;
  private frameCount = 0;


  private readonly SMOOTHING_FACTOR = 0.25;

  constructor(config: AnimationConfig) {
    this.config = config;
    this.noise2D = createNoise2D();
    this.createPoints();


    this.startAnimationLoop();
  }

  private startAnimationLoop() {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);

      try {
        const displacement = this.updateAnimation();
        this.updateCSSProperties();
        this.updateHaloShape(displacement);
      } catch (error) {
        console.error('[AnimationEngine] Error:', error);
      }
    };

    animate();
  }

  private updateAnimation(): number {

    if (engineState.mode === 'speaking' && engineState.analyser) {
      return this.updateSpeakingAnimation();
    }
    return this.updateIdleAnimation();
  }

  connectAudioSource(analyserNode: AnalyserNode) {
    try {
      this.frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
      this.calculateFrequencyBinRanges(analyserNode);
      this.frameCount = 0;

      console.log('[AnimationEngine] Connected to audio source');
    } catch (error) {
      console.error('[AnimationEngine] Failed to connect:', error);
      this.frequencyData = null;
      this.frequencyBinRanges = null;
    }
  }

  disconnectAudioSource() {
    this.frequencyData = null;
    this.frequencyBinRanges = null;
    console.log('[AnimationEngine] Disconnected from audio source');
  }

  private calculateFrequencyBinRanges(analyser: AnalyserNode) {
    const sampleRate = analyser.context.sampleRate;
    const binCount = analyser.frequencyBinCount;
    const hzPerBin = sampleRate / (2 * binCount);

    const bassStart = Math.floor(20 / hzPerBin);
    const bassEnd = Math.floor(250 / hzPerBin);
    const midStart = bassEnd;
    const midEnd = Math.floor(2000 / hzPerBin);
    const highStart = midEnd;
    const highEnd = binCount;

    this.frequencyBinRanges = {
      bass: [bassStart, bassEnd],
      mid: [midStart, midEnd],
      high: [highStart, highEnd]
    };
  }

  private extractAudioFeatures(): AudioFeatures | null {
    if (!engineState.analyser || !this.frequencyData || !this.frequencyBinRanges) {
      return null;
    }

    engineState.analyser.getByteFrequencyData(this.frequencyData);

    const { bass: [bassStart, bassEnd], mid: [midStart, midEnd], high: [highStart, highEnd] } = this.frequencyBinRanges;

    let bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;

    for (let i = 0; i < this.frequencyData.length; i++) {
      const value = this.frequencyData[i];
      totalSum += value;

      if (i >= bassStart && i < bassEnd) bassSum += value;
      else if (i >= midStart && i < midEnd) midSum += value;
      else if (i >= highStart && i < highEnd) highSum += value;
    }

    const bassCount = bassEnd - bassStart;
    const midCount = midEnd - midStart;
    const highCount = highEnd - highStart;

    return {
      volume: this.clamp(totalSum / (this.frequencyData.length * 255), 0, 1),
      bass: this.clamp(bassSum / (bassCount * 255), 0, 1),
      mid: this.clamp(midSum / (midCount * 255), 0, 1),
      high: this.clamp(highSum / (highCount * 255), 0, 1)
    };
  }

  private updateSpeakingAnimation(): number {
    const features = this.extractAudioFeatures();

    if (!features) {
      return this.updateIdleAnimation();
    }


    this.smoothedVolume = this.lerp(this.smoothedVolume, features.volume, this.SMOOTHING_FACTOR);
    this.smoothedBass = this.lerp(this.smoothedBass, features.bass, this.SMOOTHING_FACTOR);
    this.smoothedMid = this.lerp(this.smoothedMid, features.mid, this.SMOOTHING_FACTOR);
    this.smoothedHigh = this.lerp(this.smoothedHigh, features.high, this.SMOOTHING_FACTOR);


    const volume = this.smoothedVolume * 2.5;
    const bass = this.smoothedBass * 2.2;
    const mid = this.smoothedMid * 2.3;
    const high = this.smoothedHigh * 2.0;


    if (this.frameCount < 30) {
      console.log('[AnimationEngine] Audio features:', { volume, bass, mid, high });
      this.frameCount++;
    }


    const targetScale = this.clamp(1.0 + volume * 0.25, this.config.minScale, this.config.maxScale);
    const targetBrightness = this.clamp(6 + mid * 2.5, 6, 10);
    const targetBlur = this.clamp(15 + bass * 12, 15, 30);

    this.smoothedScale = this.lerp(this.smoothedScale, targetScale, this.SMOOTHING_FACTOR);
    this.smoothedBrightness = this.lerp(this.smoothedBrightness, targetBrightness, this.SMOOTHING_FACTOR);
    this.smoothedBlur = this.lerp(this.smoothedBlur, targetBlur, this.SMOOTHING_FACTOR);


    const targetDisplacement = Math.min(volume * 18 + bass * 12 + high * 8, 30);
    this.smoothedDisplacement = this.lerp(this.smoothedDisplacement, targetDisplacement, this.SMOOTHING_FACTOR);

    return this.smoothedDisplacement;
  }

  private updateIdleAnimation(): number {

    const idleSmoothingFactor = 0.04;

    this.smoothedScale = this.lerp(this.smoothedScale, 1.0, idleSmoothingFactor);
    this.smoothedBrightness = this.lerp(this.smoothedBrightness, 6, idleSmoothingFactor);
    this.smoothedBlur = this.lerp(this.smoothedBlur, 15, idleSmoothingFactor);
    this.smoothedDisplacement = this.lerp(this.smoothedDisplacement, 0, idleSmoothingFactor);


    this.smoothedVolume = this.lerp(this.smoothedVolume, 0, idleSmoothingFactor);
    this.smoothedBass = this.lerp(this.smoothedBass, 0, idleSmoothingFactor);
    this.smoothedMid = this.lerp(this.smoothedMid, 0, idleSmoothingFactor);
    this.smoothedHigh = this.lerp(this.smoothedHigh, 0, idleSmoothingFactor);

    return 0;
  }

  private createPoints() {
    this.points = [];
    const angleStep = (Math.PI * 2) / this.config.numPoints;
    for (let i = 0; i < this.config.numPoints; i++) {
      const theta = i * angleStep;
      const x = this.config.centerX + Math.cos(theta) * this.config.baseRadius;
      const y = this.config.centerY + Math.sin(theta) * this.config.baseRadius;
      this.points.push({
        x,
        y,
        originX: x,
        originY: y,
        noiseOffsetX: Math.random() * 1000,
        noiseOffsetY: Math.random() * 1000
      });
    }
  }

  private updateCSSProperties() {
    document.documentElement.style.setProperty('--halo-scale', this.smoothedScale.toFixed(3));
    document.documentElement.style.setProperty('--halo-brightness', this.smoothedBrightness.toFixed(3));

    const blurFilter = document.querySelector('#blurFilter feGaussianBlur');
    if (blurFilter) {
      blurFilter.setAttribute('stdDeviation', this.smoothedBlur.toFixed(1));
    }
  }

  private updateHaloShape(additionalDisplacement: number) {
    if (!engineState.haloPath) return;


    const noiseSpeed = additionalDisplacement > 5 ? 0.003 : 0.0015;
    this.proceduralNoiseTime += noiseSpeed;

    const baseNoiseStep = 0.0032;
    const baseDisplacement = 20;
    const totalDisplacement = baseDisplacement + additionalDisplacement;

    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];

      const nX = this.noise2D(point.noiseOffsetX, this.proceduralNoiseTime);
      const nY = this.noise2D(point.noiseOffsetY, this.proceduralNoiseTime);

      const x = this.map(nX, -1, 1,
        point.originX - totalDisplacement,
        point.originX + totalDisplacement
      );

      const y = this.map(nY, -1, 1,
        point.originY - totalDisplacement,
        point.originY + totalDisplacement
      );

      point.x = isNaN(x) ? point.originX : x;
      point.y = isNaN(y) ? point.originY : y;

      point.noiseOffsetX += baseNoiseStep;
      point.noiseOffsetY += baseNoiseStep;
    }

    const pathData = spline(this.points, 1, true);
    if (pathData) {
      engineState.haloPath.setAttribute('d', pathData);
    }
  }

  private lerp(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private map(n: number, start1: number, end1: number, start2: number, end2: number): number {
    return ((n - start1) / (end1 - start1)) * (end2 - start2) + start2;
  }

  cleanup() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.disconnectAudioSource();
  }
}


export const defaultConfig: AnimationConfig = {
  numPoints: 12,
  baseRadius: 80,
  centerX: 100,
  centerY: 100,
  noiseStep: 0.005,
  maxScale: 0.9,
  maxBrightness: 10,
  maxBlur: 30,
  minScale: 0.8,
  minBrightness: 4,
  minBlur: 10
};


export const animationEngine = new AnimationEngine(defaultConfig);
