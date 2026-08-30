import {
  applyBlackout,
  applyGlitchCharsGroup,
  applyColorDispersion,
  applyDepthBlackout,
  collectTextNodes,
  removeSomeGlitchSpans,
  restoreGlitchSpans,
} from '../utils/glitch';

export type GlitchIntensity = 'light' | 'heavy';
export type RhythmProfile = 'logo' | 'title' | 'meta' | 'body';

export interface MusicGlitchOptions {
  enabled: boolean;
  paused?: boolean;
  intensity: GlitchIntensity;
  profile: RhythmProfile;
}

type FrequencyBand = 'bass' | 'macro';
type FineBand = 'sub' | 'bass' | 'lowMid' | 'mid' | 'presence' | 'high';
type MusicState = 'idle' | 'paused' | 'playing' | 'unsupported' | 'reduced';
type FrequencyRange = readonly [lowHz: number, highHz: number];
type FineLevels = Record<FineBand, number>;

interface RhythmSnapshot {
  bass: number;
  mid: number;
  high: number;
  bassPulse: number;
  midPulse: number;
  highPulse: number;
  fine: FineLevels;
  finePulse: FineLevels;
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
  beatBurstEnabled: boolean;
  minDelay: number;
  maxDelay: number;
  cadenceResponse: number;
  refreshScale: number;
  maxMutations: number;
  maxLength: number;
}

const FFT_SIZE = 1024;
const CSS_UPDATE_INTERVAL = 1000 / 40;
const MIN_BEAT_INTERVAL = 140;
const RHYTHM_PULSE_THRESHOLD = 0.12;

// These boundaries separate the actual DOM effects: sub/kick cuts, bass depth,
// vocal/synth symbol corruption, and high-frequency chromatic dispersion.
const MACRO_BANDS = {
  bass: [20, 250],
  mid: [250, 2000],
  high: [2000, 12000],
} as const satisfies Record<'bass' | 'mid' | 'high', FrequencyRange>;

const FINE_BANDS: Record<FineBand, FrequencyRange> = {
  sub: [20, 60],
  bass: [60, 250],
  lowMid: [250, 500],
  mid: [500, 2000],
  presence: [2000, 4000],
  high: [4000, 12000],
};

const FINE_BAND_NAMES: FineBand[] = ['sub', 'bass', 'lowMid', 'mid', 'presence', 'high'];
const FINE_RISE_GAIN: Record<FineBand, number> = {
  sub: 5.4,
  bass: 4.8,
  lowMid: 5.1,
  mid: 5.4,
  presence: 5.9,
  high: 6.2,
};

type GlitchKind = 'blackout' | 'depth' | 'dispersion' | 'symbols';

const GLITCH_KIND_BANDS: Record<GlitchKind, readonly FineBand[]> = {
  blackout: ['sub'],
  depth: ['bass', 'lowMid'],
  dispersion: ['presence', 'high'],
  symbols: ['mid'],
};
const GLITCH_KINDS: readonly GlitchKind[] = ['blackout', 'depth', 'dispersion', 'symbols'];

function createFineLevels(): FineLevels {
  return {
    sub: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    presence: 0,
    high: 0,
  };
}

const INTENSITY_CONFIG: Record<GlitchIntensity, { actionProbability: number; removeProbability: number }> = {
  light: {
    actionProbability: 0.22,
    removeProbability: 0.26,
  },
  heavy: {
    actionProbability: 0.56,
    removeProbability: 0.3,
  },
};

const PROFILE_CONFIG: Record<RhythmProfile, ProfileConfig> = {
  logo: {
    band: 'bass',
    gain: 1.32,
    beatChance: 0.98,
    beatBurstEnabled: true,
    minDelay: 90,
    maxDelay: 260,
    cadenceResponse: 2.4,
    refreshScale: 1,
    maxMutations: 1,
    maxLength: 4,
  },
  title: {
    band: 'macro',
    gain: 1.3,
    beatChance: 0.9,
    beatBurstEnabled: true,
    minDelay: 110,
    maxDelay: 330,
    cadenceResponse: 2.2,
    refreshScale: 1,
    maxMutations: 1,
    maxLength: 5,
  },
  meta: {
    band: 'macro',
    gain: 1.42,
    beatChance: 0.72,
    beatBurstEnabled: true,
    minDelay: 80,
    maxDelay: 230,
    cadenceResponse: 2,
    refreshScale: 1,
    maxMutations: 1,
    maxLength: 2,
  },
  body: {
    band: 'macro',
    gain: 1.22,
    beatChance: 1,
    beatBurstEnabled: true,
    minDelay: 150,
    maxDelay: 360,
    cadenceResponse: 8,
    refreshScale: 0.9,
    maxMutations: 6,
    maxLength: 12,
  },
};

const EMPTY_SNAPSHOT: RhythmSnapshot = {
  bass: 0,
  mid: 0,
  high: 0,
  bassPulse: 0,
  midPulse: 0,
  highPulse: 0,
  fine: createFineLevels(),
  finePulse: createFineLevels(),
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

function readBand(
  data: Uint8Array<ArrayBufferLike>,
  range: FrequencyRange,
  sampleRate: number,
  fftSize: number,
): number {
  // Bin 0 is DC, not audible bass; excluding it prevents a DC offset from
  // keeping the logo reaction artificially high.
  const from = Math.max(1, Math.floor((range[0] * fftSize) / sampleRate));
  const to = Math.min(data.length, Math.ceil((range[1] * fftSize) / sampleRate));
  if (from >= to) return 0;

  let total = 0;
  for (let index = from; index < to; index += 1) {
    total += data[index];
  }
  return total / (to - from) / 255;
}

// Pick from evenly spaced sections of a post so a small mutation budget still
// reaches the middle and the end instead of being consumed by leading nodes.
function sampleAcrossText<T>(items: readonly T[], count: number): T[] {
  if (count >= items.length) return [...items];

  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * items.length) / count);
    const end = Math.floor(((index + 1) * items.length) / count);
    const selectedIndex = start + Math.floor(Math.random() * Math.max(1, end - start));
    selected.push(items[selectedIndex]);
  }
  return selected;
}

function pickGlitchKind(snapshot: RhythmSnapshot): GlitchKind {
  let totalWeight = 0;
  let strongestKind = GLITCH_KINDS[0];
  let strongestWeight = 0;
  const weights = GLITCH_KINDS.map((kind) => {
    const weight = Math.max(
      ...GLITCH_KIND_BANDS[kind].map((band) =>
        // Spectral rises lead the decision; the local envelope only keeps a
        // sustained instrument from falling back to the first glitch kind.
        snapshot.finePulse[band] * 0.84 + snapshot.fine[band] * 0.16,
      ),
    );
    if (weight > strongestWeight) {
      strongestKind = kind;
      strongestWeight = weight;
    }
    totalWeight += weight;
    return weight;
  });

  if (totalWeight <= 0) return strongestKind;

  let cursor = Math.random() * totalWeight;
  for (let index = 0; index < GLITCH_KINDS.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return GLITCH_KINDS[index];
  }
  return strongestKind;
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
  private bass = 0;
  private mid = 0;
  private high = 0;
  private bassPulse = 0;
  private midPulse = 0;
  private highPulse = 0;
  private fineEnvelope = createFineLevels();
  private finePulse = createFineLevels();
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
      // Keep kick transients readable without making the text jitter at the
      // analyser frame rate.
      analyser.smoothingTimeConstant = 0.64;

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

    const sampleRate = this.audioContext?.sampleRate ?? 44100;
    const rawBass = readBand(this.frequencyData, MACRO_BANDS.bass, sampleRate, FFT_SIZE);
    const rawMid = readBand(this.frequencyData, MACRO_BANDS.mid, sampleRate, FFT_SIZE);
    const rawHigh = readBand(this.frequencyData, MACRO_BANDS.high, sampleRate, FFT_SIZE);
    const rawFine = createFineLevels();
    for (const band of FINE_BAND_NAMES) {
      rawFine[band] = readBand(this.frequencyData, FINE_BANDS[band], sampleRate, FFT_SIZE);
    }
    const deltaMs = Math.max(1, now - this.lastFrameAt);
    this.lastFrameAt = now;

    // A smoothed envelope is useful for broad element motion, but it hides the
    // attacks that distinguish individual glitch types. Keep those upward
    // changes as short-lived fine-band pulses as well.
    const bassRise = clamp((rawBass - this.bass) * 4.6);
    const midRise = clamp((rawMid - this.mid) * 5.4);
    const highRise = clamp((rawHigh - this.high) * 6.2);

    this.bass += (rawBass - this.bass) * (rawBass > this.bass ? 0.38 : 0.13);
    this.mid += (rawMid - this.mid) * (rawMid > this.mid ? 0.3 : 0.1);
    this.high += (rawHigh - this.high) * (rawHigh > this.high ? 0.24 : 0.08);
    const pulseDecay = Math.pow(0.76, deltaMs / 16.67);
    this.bassPulse = Math.max(bassRise, this.bassPulse * pulseDecay);
    this.midPulse = Math.max(midRise, this.midPulse * pulseDecay);
    this.highPulse = Math.max(highRise, this.highPulse * pulseDecay);
    for (const band of FINE_BAND_NAMES) {
      const fineDelta = rawFine[band] - this.fineEnvelope[band];
      const fineRise = clamp(fineDelta * FINE_RISE_GAIN[band]);
      this.fineEnvelope[band] += fineDelta * (fineDelta > 0 ? 0.3 : 0.11);
      this.finePulse[band] = Math.max(fineRise, this.finePulse[band] * pulseDecay);
    }
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
        bass: clamp(this.bass),
        mid: clamp(this.mid),
        high: clamp(this.high),
        bassPulse: clamp(this.bassPulse),
        midPulse: clamp(this.midPulse),
        highPulse: clamp(this.highPulse),
        fine: { ...this.fineEnvelope },
        finePulse: { ...this.finePulse },
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
      const pulse = this.profilePulse(profile.band, snapshot);
      const level = clamp(
        (pulse * 1.28 + snapshot.beat * 0.72) * profile.gain,
      );
      // A rhythmic hit can be a bass beat or a strong rise in any macro band.
      // Let the pulse decay window produce a few quick refreshes instead of
      // waiting for the target's ordinary cadence timer.
      const isFreshRhythm =
        snapshot.beat >= 0.72 || pulse >= RHYTHM_PULSE_THRESHOLD;
      const beatBurst =
        profile.beatBurstEnabled &&
        isFreshRhythm &&
        Math.random() < profile.beatChance;

      if (!beatBurst && now < target.nextCycleAt) continue;

      const cadence = profile.minDelay + Math.random() * (profile.maxDelay - profile.minDelay);
      target.nextCycleAt = now +
        (cadence * profile.refreshScale) /
        (1 + level * profile.cadenceResponse);

      if (!beatBurst && Math.random() > 0.18 + level * 0.82) continue;

      this.mutateTarget(target, profile, level, beatBurst, snapshot);
    }
  }

  private mutateTarget(
    target: RhythmTarget,
    profile: ProfileConfig,
    level: number,
    beatBurst: boolean,
    snapshot: RhythmSnapshot,
  ): void {
    const intensity = INTENSITY_CONFIG[target.options.intensity];
    const actionProbability = clamp(
      intensity.actionProbability * (0.58 + level * 1.0 + (beatBurst ? 0.4 : 0)),
    );
    const removeProbability = clamp(
      intensity.removeProbability * (0.55 + level * 0.45) +
        (target.options.profile === 'body' ? level * 0.45 : 0),
    );

    removeSomeGlitchSpans(target.element, removeProbability);

    const candidates = collectTextNodes(target.element).filter((textNode) => {
      const text = textNode.textContent ?? '';
      return text.trim().length > 0;
    });
    if (candidates.length === 0) return;

    const expectedMutations = profile.maxMutations * actionProbability;
    const peakCoverage =
      target.options.profile === 'body' ? clamp((level - 0.25) / 0.75) : 0;
    // At a real peak, readability is intentionally sacrificed: cover the
    // complete eligible text set so a long post does not look mostly intact.
    const coverageMutations =
      peakCoverage > 0 ? Math.ceil(candidates.length * peakCoverage) : 0;
    const mutationCount = Math.min(
      candidates.length,
      Math.max(
        1,
        coverageMutations ||
          Math.floor(expectedMutations) +
            (Math.random() < expectedMutations % 1 ? 1 : 0),
      ),
    );
    for (const textNode of sampleAcrossText(candidates, mutationCount)) {
      const text = textNode.textContent ?? '';

      const maxLength = Math.min(
        text.length,
        peakCoverage > 0
          ? Math.max(1, Math.ceil(text.length * (0.25 + peakCoverage * 0.75)))
          : Math.max(1, Math.ceil(profile.maxLength * (beatBurst ? 1.2 : 1))),
      );
      const length =
        peakCoverage >= 0.9
          ? text.length
          : Math.min(Math.ceil(Math.random() * maxLength), text.length);
      const start = Math.floor(Math.random() * (text.length - length + 1));
      const kind = pickGlitchKind(snapshot);

      switch (kind) {
        case 'blackout':
          applyBlackout(textNode, start, length);
          break;
        case 'depth':
          applyDepthBlackout(textNode, start, length);
          break;
        case 'dispersion':
          applyColorDispersion(textNode, start, length);
          break;
        case 'symbols':
          applyGlitchCharsGroup(textNode, start, length);
          break;
      }
    }
  }

  private profilePulse(band: FrequencyBand, snapshot: RhythmSnapshot): number {
    switch (band) {
      case 'bass':
        return snapshot.bassPulse;
      case 'macro':
        return Math.max(snapshot.bassPulse, snapshot.midPulse, snapshot.highPulse);
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
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.bassPulse = 0;
    this.midPulse = 0;
    this.highPulse = 0;
    this.fineEnvelope = createFineLevels();
    this.finePulse = createFineLevels();
    this.bassFloor = 0.04;
    this.beatPulse = 0;
  }

  private writeCssVariables(snapshot: RhythmSnapshot): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const macroPulse = Math.max(
      snapshot.bassPulse,
      snapshot.midPulse,
      snapshot.highPulse,
    );
    const reaction = clamp(macroPulse * 1.15 + snapshot.beat * 0.82);
    const tiers = [
      ['xs', 0.65],
      ['sm', 1],
      ['md', 1.38],
      ['lg', 1.9],
    ] as const;

    root.style.setProperty('--music-spectrum-pulse', macroPulse.toFixed(3));
    root.style.setProperty('--music-bass', snapshot.bass.toFixed(3));
    root.style.setProperty('--music-mid', snapshot.mid.toFixed(3));
    root.style.setProperty('--music-high', snapshot.high.toFixed(3));
    root.style.setProperty('--music-pulse', snapshot.beat.toFixed(3));
    root.style.setProperty('--music-chroma', (0.18 + reaction * 0.8).toFixed(3));
    root.style.setProperty('--music-glitch-front-duration', `${Math.round(340 - reaction * 100)}ms`);
    root.style.setProperty('--music-glitch-mid-duration', `${Math.round(500 - reaction * 140)}ms`);
    root.style.setProperty('--music-glitch-back-duration', `${Math.round(760 - reaction * 220)}ms`);

    const bodyReaction = clamp(macroPulse * 1.45 + snapshot.beat * 1.05);
    root.style.setProperty('--music-body-glitch-front-duration', `${Math.round(310 - bodyReaction * 250)}ms`);
    root.style.setProperty('--music-body-glitch-mid-duration', `${Math.round(460 - bodyReaction * 360)}ms`);
    root.style.setProperty('--music-body-glitch-back-duration', `${Math.round(700 - bodyReaction * 520)}ms`);

    for (const [name, gain] of tiers) {
      const shift = reaction * gain * 4.8;
      const verticalShift = (
        snapshot.highPulse * 0.55 +
        Math.max(snapshot.finePulse.presence, snapshot.finePulse.high) * 0.25 +
        snapshot.beat * 0.7
      ) * gain * 1.8;
      const scale = 1 + reaction * gain * 0.018;
      const letterSpacing = reaction * gain * 0.022;

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
