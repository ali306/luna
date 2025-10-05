// @ts-ignore
import { spline } from '@georgedoescode/spline';
import { createNoise2D } from 'simplex-noise';

import {
  AnimationPoint,
  AnimationConfig,
  CurrentSpeakingData,
  AudioAnalysisData,
  AppMode
} from '../types/index.js';
import { ANIMATION_BUFFERING_DELAY, TIME_CONVERSION_MULTIPLIER } from '../config.js';

export class AnimationEngine {
  private noise2D: (x: number, y: number) => number;
  private points: AnimationPoint[] = [];
  private animationId: number | null = null;
  private haloPathElement: SVGPathElement | null = null;
  private getCurrentModeCallback: (() => AppMode) | null = null;
  private smoothedHaloScale: number = 1.0;
  private smoothedHaloBrightness: number = 6;
  private smoothedHaloBlur: number = 15;
  private smoothedDisplacement: number = 0;
  private speakingSmoothVolume: number = 0;
  private speakingSmoothBass: number = 0;
  private speakingSmoothMid: number = 0;


  private audioAnalysisData: AudioAnalysisData[] | null = null;
  private speakingDuration: number = 0;
  private serverStartTime: number = 0;
  private clientStartTime: number = 0;
  private clockOffset: number = 0;
  private bufferingDelay: number = ANIMATION_BUFFERING_DELAY;

  constructor(private config: AnimationConfig) {
    this.noise2D = createNoise2D();
    this.createPoints();
  }

  public setHaloPathElement(element: SVGPathElement): void {
    this.haloPathElement = element;
    console.log('Halo path element set:', element ? 'found' : 'not found');
  }

  public setCallbacks(
    getCurrentMode: () => AppMode
  ): void {
    this.getCurrentModeCallback = getCurrentMode;
  }

  public start(): void {
    if (!this.animationId) {
      console.log('Starting animation engine');
      this.animate();
    }
  }

  public stop(): void {
    if (this.animationId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public setAudioAnalysisData(
    analysis: AudioAnalysisData[],
    duration: number,
    startTime: number
  ): void {
    this.audioAnalysisData = analysis;
    this.speakingDuration = duration * TIME_CONVERSION_MULTIPLIER;
    this.serverStartTime = startTime * TIME_CONVERSION_MULTIPLIER;
    this.clientStartTime = Date.now();
    this.clockOffset = this.clientStartTime - this.serverStartTime;
  }

  public clearAudioAnalysisData(): void {
    this.audioAnalysisData = null;
  }

  public startSpeakingAnimation(): void {

  }

  public animate(): void {
    if (typeof document !== 'undefined' && document.hidden) return;

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationId = requestAnimationFrame(() => this.animate());
    }

    try {
      const mode = this.getCurrentMode();
      const additionalDisplacement = this.updateAnimationState(mode);

      this.updateCSSProperties();
      this.updateHaloShape(additionalDisplacement);
    } catch (error) {
      console.error('Animation error:', error);
    }
  }

  private getCurrentMode(): AppMode {
    return this.getCurrentModeCallback ? this.getCurrentModeCallback() : 'idle';
  }

  private updateAnimationState(mode: AppMode): number {
    if (mode === 'speaking' && this.audioAnalysisData) {
      return this.updateSpeakingAnimation();
    } else {
      return this.updateIdleAnimation();
    }
  }

  private updateSpeakingAnimation(): number {
    const speakingData = this.getCurrentSpeakingData();
    if (!speakingData) return 0;

    const serverTimeNow = Date.now() - this.clockOffset;
    const elapsed = serverTimeNow - this.serverStartTime;
    const adjustedElapsed = Math.max(0, elapsed - this.bufferingDelay);
    const adjustedProgress = Math.min(adjustedElapsed / this.speakingDuration, 1);

    if (adjustedProgress > 1) return 0;

    this.updateAudioSmoothing(speakingData);
    const audioInfluences = this.calculateAudioInfluences();
    this.updateHaloProperties(audioInfluences);

    return this.calculateDisplacement(audioInfluences);
  }

  private updateIdleAnimation(): number {
    this.smoothedHaloScale = this.dynamicSmooth(this.smoothedHaloScale, 1.0, 0.08);
    this.smoothedHaloBrightness = this.dynamicSmooth(this.smoothedHaloBrightness, 6, 0.08);
    this.smoothedHaloBlur = this.dynamicSmooth(this.smoothedHaloBlur, 15, 0.08);

    // Smoothly transition speaking-related values back to zero
    this.speakingSmoothVolume = this.dynamicSmooth(this.speakingSmoothVolume, 0, 0.08);
    this.speakingSmoothBass = this.dynamicSmooth(this.speakingSmoothBass, 0, 0.08);
    this.speakingSmoothMid = this.dynamicSmooth(this.speakingSmoothMid, 0, 0.08);
    this.smoothedDisplacement = this.dynamicSmooth(this.smoothedDisplacement, 0, 0.08);

    return this.smoothedDisplacement;
  }

  private updateAudioSmoothing(speakingData: CurrentSpeakingData): void {
    const sFactor = 0.2;
    this.speakingSmoothVolume = this.lerp(this.speakingSmoothVolume, speakingData.volume, sFactor);
    this.speakingSmoothBass = this.lerp(this.speakingSmoothBass, speakingData.bass, sFactor);
    this.speakingSmoothMid = this.lerp(this.speakingSmoothMid, speakingData.mid, sFactor);
  }

  private calculateAudioInfluences(): { audio: number; bass: number } {
    const volumeNorm = this.clamp(this.speakingSmoothVolume * 3.0, 0, 1);
    const bassNorm = this.clamp(this.speakingSmoothBass * volumeNorm * 1.2, 0, 1);

    return {
      audio: volumeNorm,
      bass: bassNorm
    };
  }

  private updateHaloProperties(influences: { audio: number; bass: number }): void {
    const targetScale = this.clamp(
      1 + influences.audio * 0.4 + influences.bass * 0.3,
      this.config.minScale,
      this.config.maxScale
    );
    const targetBrightness = this.clamp(
      6 + influences.audio * 1.2 + influences.bass * 0.8,
      this.config.minBrightness,
      this.config.maxBrightness
    );
    const targetBlur = this.clamp(
      15 + influences.bass * 12,
      this.config.minBlur,
      this.config.maxBlur
    );

    this.smoothedHaloScale = this.dynamicSmooth(this.smoothedHaloScale, targetScale, 0.25);
    this.smoothedHaloBrightness = this.dynamicSmooth(this.smoothedHaloBrightness, targetBrightness, 0.25);
    this.smoothedHaloBlur = this.dynamicSmooth(this.smoothedHaloBlur, targetBlur, 0.25);
  }

  private calculateDisplacement(influences: { audio: number; bass: number }): number {
    const targetDisplacement = Math.min(
      influences.audio * 50 + influences.bass * 30 + this.speakingSmoothMid * 20,
      80
    );
    this.smoothedDisplacement = this.dynamicSmooth(this.smoothedDisplacement, targetDisplacement, 0.2);
    return this.smoothedDisplacement;
  }


  private getCurrentSpeakingData(): CurrentSpeakingData | null {
    if (!this.audioAnalysisData) return null;

    const elapsedSec = this.calculateElapsedSeconds();
    const dataIndex = this.findDataIndex(elapsedSec);
    const dataPoint = this.audioAnalysisData[dataIndex];

    return this.createCurrentSpeakingData(dataPoint);
  }

  private calculateElapsedSeconds(): number {
    const serverTimeNow = Date.now() - this.clockOffset;
    const elapsedMs = serverTimeNow - this.serverStartTime;
    return Math.max(0, (elapsedMs - this.bufferingDelay) / TIME_CONVERSION_MULTIPLIER);
  }

  private findDataIndex(elapsedSec: number): number {
    const hasTimeData = typeof this.audioAnalysisData?.[0]?.time === 'number';

    if (hasTimeData) {
      return this.binarySearchByTime(elapsedSec);
    } else {
      return this.calculateIndexByProgress(elapsedSec);
    }
  }

  private binarySearchByTime(elapsedSec: number): number {
    let left = 0;
    let right = this.audioAnalysisData!.length - 1;
    let result = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const time = this.audioAnalysisData![mid].time || 0;

      if (time <= elapsedSec) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  private calculateIndexByProgress(elapsedSec: number): number {
    const elapsedMs = elapsedSec * TIME_CONVERSION_MULTIPLIER;
    const progress = Math.min(elapsedMs / this.speakingDuration, 1);
    return Math.floor(progress * this.audioAnalysisData!.length);
  }

  private createCurrentSpeakingData(dataPoint: AudioAnalysisData): CurrentSpeakingData {
    return {
      volume: Math.min(dataPoint.volume || 0, 1),
      bass: Math.min(dataPoint.bass || 0, 1),
      mid: Math.min(dataPoint.low_mid || 0, 1),
      high: Math.min(dataPoint.high || 0, 1)
    };
  }

  private createPoints(): void {
    this.points = [];
    const angleStep = (Math.PI * 2) / this.config.numPoints;
    for (let i = 0; i < this.config.numPoints; i++) {
      const theta = i * angleStep;
      const x = this.config.centerX + Math.cos(theta) * this.config.baseRadius;
      const y = this.config.centerY + Math.sin(theta) * this.config.baseRadius;
      this.points.push({
        x: x,
        y: y,
        originX: x,
        originY: y,
        noiseOffsetX: Math.random() * TIME_CONVERSION_MULTIPLIER,
        noiseOffsetY: Math.random() * TIME_CONVERSION_MULTIPLIER
      });
    }
  }

  private updateCSSProperties(): void {
    document.documentElement.style.setProperty('--halo-scale', this.smoothedHaloScale.toFixed(3));
    document.documentElement.style.setProperty('--halo-brightness', this.smoothedHaloBrightness.toFixed(3));


    const blurFilter = document.querySelector('#blurFilter feGaussianBlur');
    if (blurFilter) {
      blurFilter.setAttribute('stdDeviation', this.smoothedHaloBlur.toFixed(1));
    }
  }

  private updateHaloShape(additionalDisplacement: number): void {

    let currentNoiseStep = this.config.noiseStep;


    currentNoiseStep = 0.0032;


    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];
      const nX = this.noise(point.noiseOffsetX, point.noiseOffsetX);
      const nY = this.noise(point.noiseOffsetY, point.noiseOffsetY);

      const baseDisplacement = 20;
      const totalDisplacement = Math.min(baseDisplacement + additionalDisplacement, 100);

      const x = this.map(nX, -1, 1, point.originX - totalDisplacement, point.originX + totalDisplacement);
      const y = this.map(nY, -1, 1, point.originY - totalDisplacement, point.originY + totalDisplacement);

      point.x = isNaN(x) ? point.originX : x;
      point.y = isNaN(y) ? point.originY : y;

      point.noiseOffsetX += currentNoiseStep;
      point.noiseOffsetY += currentNoiseStep;
    }

    const pathData = spline(this.points, 1, true);
    if (pathData && this.haloPathElement) {
      this.haloPathElement.setAttribute('d', pathData);
    } else if (!pathData) {
      console.error('Failed to generate spline path data');
    } else if (!this.haloPathElement) {
      console.error('No halo path element available');
    }
  }

  private lerp(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

  private dynamicSmooth(current: number, target: number, baseFactor: number = 0.1): number {
    const diff = Math.abs(target - current);
    const dynamicFactor = Math.min(baseFactor * (1 + diff * 0.5), 0.3);
    return current + (target - current) * dynamicFactor;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private map(n: number, start1: number, end1: number, start2: number, end2: number): number {
    return ((n - start1) / (end1 - start1)) * (end2 - start2) + start2;
  }

  private noise(x: number, y: number): number {
    return this.noise2D(x, y);
  }
}