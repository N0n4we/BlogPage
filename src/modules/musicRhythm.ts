import {
  applyBlackout,
  applyGlitchCharsGroup,
  removeSomeGlitchSpans,
  restoreGlitchSpans,
  walkTextNodes,
} from '../utils/glitch';

export type GlitchIntensity = 'light' | 'heavy';
export type RhythmProfile = 'logo' | 'title' | 'meta' | 'body';

export interface MusicGlitchOptions {
  enabled: boolean;
  paused?: boolean;
  intensity: GlitchIntensity;
  profile: RhythmProfile;
}

type FrequencyBand = 'bass' | 'mid' | 'high' | 'full';
type MusicState = 'idle' | 'paused' | 'playing' | 'unsupported' | 'reduced';

interface RhythmSnapshot {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  beat: number;
}

interface RhythmTarget {
  element: HTMLElement;
  options: MusicGlitchOptions;
  nextCycleAt: number;
}

interface ProfileConfig {
  band: FrequencyBand;
  gain: number;
  beatChance: number;
  minDelay: number;
  maxDelay: number;
  maxMutations: number;
  maxLength: number;
}

const FFT_SIZE = 1024;
const CSS_UPDATE_INTERVAL = 1000 / 30;
const MIN_BEAT_INTERVAL = 110;

const INTENSITY_CONFIG: Record<GlitchIntensity, { actionProbability: number; removeProbability: number; blackoutRatio: number }> = {
  light: {
    actionProbability: 0.16,
    removeProbability: 0.22,
    blackoutRatio: 0.68,
  },
  heavy: {
    actionProbability: 0.48,
    removeProbability: 0.36,
    blackoutRatio: 0.5,
  },
};

const PROFILE_CONFIG: Record<RhythmProfile, ProfileConfig> = {
  logo: {
    band: 'bass',
    gain: 1.35,
    beatChance: 0.95,
    minDelay: 90,
    maxDelay: 260,
    maxMutations: 1,
    maxLength: 4,
  },
  title: {
    band: 'mid',
    gain: 1.08,
    beatChance: 0.78,
    minDelay: 110,
    maxDelay: 330,
    maxMutations: 1,
    maxLength: 5,
  },
  meta: {
    band: 'high',
    gain: 0.76,
    beatChance: 0.46,
    minDelay: 65,
    maxDelay: 190,
    maxMutations: 1,
    maxLength: 2,
  },
  body: {
    band: 'full',
    gain: 1.24,
    beatChance: 0.9,
    minDelay: 50,
    maxDelay: 180,
    maxMutations: 8,
    maxLength: 8,
  },
};

const EMPTY_SNAPSHOT: RhythmSnapshot = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  beat: 0,
};

const DISABLED_TARGET_OPTIONS: MusicGlitchOptions = {
  enabled: false,
  paused: true,
  intensity: 'light',
  profile: 'body',
};

interface WebkitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function readBand(data: Uint8Array<ArrayBufferLike>, start: number, end: number): number {
  const from = Math.max(0, start);
  const to = Math.min(data.length, end);
  if (from >= to) return 0;

  let total = 0;
  for (let index = from; index < to; index += 1) {
    total += data[index];
  }
  return total / (to - from) / 255;
}

/**
 * One page-wide music-to-glitch bridge.
 *
 * The player owns only one MediaElementAudioSourceNode. This controller keeps
 * that fragile Web Audio setup in one place, writes compositor-friendly CSS
 * variables, and coordinates DOM corruption so every target reacts to the
 * same beat rather than running unrelated timers.
 */
class MusicRhythmController {
  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private animationFrame = 0;
  private targets = new Map<HTMLElement, RhythmTarget>();
  private visibility = new WeakMap<HTMLElement, boolean>();
  private observer: IntersectionObserver | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private hasVisibilityListener = false;
  private desiredPlaying = false;
  private lastCssUpdateAt = 0;
  private lastFrameAt = 0;
  private lastBeatAt = 0;
  private energy = 0;
  private bass = 0;
  private mid = 0;
  private high = 0;
  private bassFloor = 0.04;
  private beatPulse = 0;

  registerTarget(element: HTMLElement): () => void {
    const target: RhythmTarget = {
      element,
      options: { ...DISABLED_TARGET_OPTIONS },
      nextCycleAt: 0,
    };
    this.targets.set(element, target);
    this.observe(element);
    this.updateTarget(element, DISABLED_TARGET_OPTIONS);

    return () => {
      if (this.targets.get(element) !== target) return;

      this.targets.delete(element);
      this.unobserve(element);
      restoreGlitchSpans(element);
      element.classList.remove(
        'music-glitch-target',
        `music-glitch-target--${target.options.profile}`,
      );
      delete element.dataset.musicRhythmProfile;
    };
  }

  updateTarget(element: HTMLElement, options: MusicGlitchOptions): void {
    const target = this.targets.get(element);
    if (!target) return;

    const previousProfile = target.options.profile;
    target.options = { ...options };

    element.classList.add('music-glitch-target');
    if (previousProfile !== options.profile) {
      element.classList.remove(`music-glitch-target--${previousProfile}`);
    }
    element.classList.add(`music-glitch-target--${options.profile}`);
    element.dataset.musicRhythmProfile = options.profile;

    if (!options.enabled) restoreGlitchSpans(element);
  }

  connect(audioElement: HTMLAudioElement | null): void {
    if (!audioElement) {
      this.disconnect();
      return;
    }

    if (audioElement === this.audioElement) return;

    this.disconnect();
    if (typeof window === 'undefined') return;

    this.ensureDocumentListeners();

    const AudioContextConstructor =
      window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      this.audioElement = audioElement;
      this.setState('unsupported');
      return;
    }

    try {
      const context = new AudioContextConstructor();
      this.audioElement = audioElement;
      this.audioContext = context;

      const source = context.createMediaElementSource(audioElement);
      this.sourceNode = source;
      const analyser = context.createAnalyser();
      this.analyserNode = analyser;
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;

      source.connect(analyser);
      analyser.connect(context.destination);

      this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
      this.resetSignal();
      this.setState(this.prefersReducedMotion() ? 'reduced' : 'paused');

      audioElement.addEventListener('play', this.resumeAudioContext);
    } catch (error) {
      console.warn('[musicRhythm] Audio analysis unavailable', error);
      this.teardownAudioGraph();
      this.audioElement = audioElement;
      this.setState('unsupported');
    }
  }

  disconnect(expectedAudioElement?: HTMLAudioElement | null): void {
    if (expectedAudioElement !== undefined && expectedAudioElement !== this.audioElement) return;

    this.desiredPlaying = false;
    this.stopLoop();
    this.teardownAudioGraph();
    this.resetSignal();
    this.writeCssVariables(EMPTY_SNAPSHOT);
    this.setState('idle');
  }

  setPlaying(isPlaying: boolean): void {
    this.desiredPlaying = isPlaying;

    if (!this.audioContext || !this.analyserNode) {
      if (this.audioElement) this.setState('unsupported');
      return;
    }

    if (this.prefersReducedMotion()) {
      this.stopLoop();
      this.setState('reduced');
      return;
    }

    if (!isPlaying) {
      this.stopLoop();
      this.setState('paused');
      return;
    }

    this.setState('playing');
    this.resumeAudioContext();
    this.startLoop();
  }

  private ensureDocumentListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (!this.mediaQuery) {
      this.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.mediaQuery.addEventListener('change', this.handleReducedMotionChange);
    }

    if (!this.hasVisibilityListener) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.hasVisibilityListener = true;
    }
  }

  private prefersReducedMotion(): boolean {
    return this.mediaQuery?.matches ?? false;
  }

  private handleReducedMotionChange = (): void => {
    if (this.prefersReducedMotion()) {
      this.stopLoop();
      this.setState('reduced');
      return;
    }

    if (this.desiredPlaying) {
      this.setState('playing');
      this.startLoop();
    } else if (this.audioContext) {
      this.setState('paused');
    }
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopLoop();
      return;
    }

    if (this.desiredPlaying && !this.prefersReducedMotion()) {
      this.startLoop();
    }
  };

  private resumeAudioContext = (): void => {
    if (this.audioContext?.state === 'suspended') {
      void this.audioContext.resume().catch(() => {});
    }
  };

  private teardownAudioGraph(): void {
    if (this.audioElement) {
      this.audioElement.removeEventListener('play', this.resumeAudioContext);
    }

    this.sourceNode?.disconnect();
    this.analyserNode?.disconnect();

    const context = this.audioContext;
    this.audioElement = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.frequencyData = null;
    this.audioContext = null;

    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
  }

  private startLoop(): void {
    if (this.animationFrame || !this.analyserNode || !this.frequencyData || document.hidden) return;

    this.lastFrameAt = performance.now();
    this.animationFrame = requestAnimationFrame(this.renderFrame);
  }

  private stopLoop(): void {
    if (!this.animationFrame) return;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  private renderFrame = (now: number): void => {
    this.animationFrame = 0;

    if (
      !this.desiredPlaying ||
      this.prefersReducedMotion() ||
      document.hidden ||
      !this.analyserNode ||
      !this.frequencyData
    ) {
      return;
    }

    this.analyserNode.getByteFrequencyData(this.frequencyData);

    const rawBass = readBand(this.frequencyData, 1, 13);
    const rawMid = readBand(this.frequencyData, 13, 88);
    const rawHigh = readBand(this.frequencyData, 88, 250);
    const rawEnergy = clamp(rawBass * 0.52 + rawMid * 0.32 + rawHigh * 0.16);
    const deltaMs = Math.max(1, now - this.lastFrameAt);
    this.lastFrameAt = now;

    this.energy += (rawEnergy - this.energy) * (rawEnergy > this.energy ? 0.32 : 0.1);
    this.bass += (rawBass - this.bass) * (rawBass > this.bass ? 0.38 : 0.13);
    this.mid += (rawMid - this.mid) * (rawMid > this.mid ? 0.3 : 0.1);
    this.high += (rawHigh - this.high) * (rawHigh > this.high ? 0.24 : 0.08);
    this.bassFloor += (rawBass - this.bassFloor) * 0.018;

    const beatThreshold = Math.max(0.075, this.bassFloor * 1.34);
    const isBeat =
      rawBass > beatThreshold &&
      rawBass > this.bass + 0.015 &&
      now - this.lastBeatAt >= MIN_BEAT_INTERVAL;

    if (isBeat) {
      this.lastBeatAt = now;
      this.beatPulse = 1;
    } else {
      this.beatPulse *= Math.pow(0.84, deltaMs / 16.67);
    }

    if (now - this.lastCssUpdateAt >= CSS_UPDATE_INTERVAL) {
      this.lastCssUpdateAt = now;
      const snapshot: RhythmSnapshot = {
        energy: clamp(this.energy),
        bass: clamp(this.bass),
        mid: clamp(this.mid),
        high: clamp(this.high),
        beat: clamp(this.beatPulse),
      };
      this.writeCssVariables(snapshot);
      this.runGlitchCycles(snapshot, now);
    }

    this.animationFrame = requestAnimationFrame(this.renderFrame);
  };

  private runGlitchCycles(snapshot: RhythmSnapshot, now: number): void {
    for (const target of this.targets.values()) {
      if (
        !target.options.enabled ||
        target.options.paused ||
        !target.element.isConnected ||
        !this.isTargetVisible(target.element)
      ) {
        continue;
      }

      const profile = PROFILE_CONFIG[target.options.profile];
      const signal = this.profileSignal(profile.band, snapshot);
      const level = clamp((signal * 0.72 + snapshot.energy * 0.48 + snapshot.beat * 0.64) * profile.gain);
      const isFreshBeat = now - this.lastBeatAt <= CSS_UPDATE_INTERVAL + 8;
      const beatBurst = isFreshBeat && Math.random() < profile.beatChance;

      if (!beatBurst && now < target.nextCycleAt) continue;

      const cadence = profile.minDelay + Math.random() * (profile.maxDelay - profile.minDelay);
      target.nextCycleAt = now + cadence / (1 + level * 1.8);

      if (!beatBurst && Math.random() > 0.22 + level * 0.72) continue;

      this.mutateTarget(target, profile, level, beatBurst);
    }
  }

  private mutateTarget(
    target: RhythmTarget,
    profile: ProfileConfig,
    level: number,
    beatBurst: boolean,
  ): void {
    const intensity = INTENSITY_CONFIG[target.options.intensity];
    const actionProbability = clamp(
      intensity.actionProbability * (0.5 + level * 0.85 + (beatBurst ? 0.3 : 0)),
    );
    const removeProbability = clamp(
      intensity.removeProbability * (0.55 + level * 0.45),
    );

    removeSomeGlitchSpans(target.element, removeProbability);

    let mutations = 0;
    walkTextNodes(target.element, (textNode) => {
      if (mutations >= profile.maxMutations || Math.random() >= actionProbability) return;

      const text = textNode.textContent ?? '';
      if (text.trim().length === 0) return;

      const maxLength = Math.min(
        text.length,
        Math.max(1, Math.ceil(profile.maxLength * (beatBurst ? 1.2 : 1))),
      );
      const length = Math.min(Math.ceil(Math.random() * maxLength), text.length);
      const start = Math.floor(Math.random() * (text.length - length + 1));

      if (Math.random() < intensity.blackoutRatio) {
        applyBlackout(textNode, start, length);
      } else {
        applyGlitchCharsGroup(textNode, start, length);
      }
      mutations += 1;
    });
  }

  private profileSignal(band: FrequencyBand, snapshot: RhythmSnapshot): number {
    switch (band) {
      case 'bass':
        return snapshot.bass;
      case 'mid':
        return snapshot.mid;
      case 'high':
        return snapshot.high;
      case 'full':
        return snapshot.energy;
    }
  }

  private observe(element: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return;

    if (!this.observer) {
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          this.visibility.set(entry.target as HTMLElement, entry.isIntersecting);
        }
      }, { rootMargin: '120px 0px' });
    }
    this.visibility.set(element, false);
    this.observer.observe(element);
  }

  private unobserve(element: HTMLElement): void {
    this.observer?.unobserve(element);
    this.visibility.delete(element);
  }

  private isTargetVisible(element: HTMLElement): boolean {
    if (typeof IntersectionObserver !== 'undefined') {
      return this.visibility.get(element) ?? false;
    }

    const rect = element.getBoundingClientRect();
    return rect.bottom >= -120 && rect.top <= window.innerHeight + 120;
  }

  private resetSignal(): void {
    this.lastCssUpdateAt = 0;
    this.lastFrameAt = 0;
    this.lastBeatAt = 0;
    this.energy = 0;
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.bassFloor = 0.04;
    this.beatPulse = 0;
  }

  private writeCssVariables(snapshot: RhythmSnapshot): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const reaction = clamp(snapshot.energy * 0.68 + snapshot.beat * 0.72);
    const tiers = [
      ['xs', 0.65],
      ['sm', 1],
      ['md', 1.38],
      ['lg', 1.9],
    ] as const;

    root.style.setProperty('--music-energy', snapshot.energy.toFixed(3));
    root.style.setProperty('--music-bass', snapshot.bass.toFixed(3));
    root.style.setProperty('--music-mid', snapshot.mid.toFixed(3));
    root.style.setProperty('--music-high', snapshot.high.toFixed(3));
    root.style.setProperty('--music-pulse', snapshot.beat.toFixed(3));
    root.style.setProperty('--music-chroma', (0.16 + reaction * 0.72).toFixed(3));
    root.style.setProperty('--music-glitch-front-duration', `${Math.round(180 - reaction * 122)}ms`);
    root.style.setProperty('--music-glitch-mid-duration', `${Math.round(240 - reaction * 128)}ms`);
    root.style.setProperty('--music-glitch-back-duration', `${Math.round(390 - reaction * 190)}ms`);

    for (const [name, gain] of tiers) {
      const shift = reaction * gain * 3.2;
      const verticalShift = (snapshot.high * 0.45 + snapshot.beat * 0.55) * gain * 1.35;
      const scale = 1 + reaction * gain * 0.012;
      const letterSpacing = reaction * gain * 0.016;

      root.style.setProperty(`--music-shift-${name}`, `${shift.toFixed(2)}px`);
      root.style.setProperty(`--music-shift-${name}-neg`, `${(-shift).toFixed(2)}px`);
      root.style.setProperty(`--music-shift-y-${name}`, `${verticalShift.toFixed(2)}px`);
      root.style.setProperty(`--music-scale-${name}`, scale.toFixed(4));
      root.style.setProperty(`--music-letter-${name}`, `${letterSpacing.toFixed(4)}em`);
    }
  }

  private setState(state: MusicState): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.musicState = state;
    }
  }
}

export const musicRhythm = new MusicRhythmController();
