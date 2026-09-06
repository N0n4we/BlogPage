import {
  applyBlackout,
  applyGlitchCharsGroup,
  applyDepthBlackout,
  collectTextNodes,
  getBlackoutCoverage,
  removeSomeGlitchSpans,
  restoreGlitchSpans,
} from '../utils/glitch';

export type GlitchIntensity = 'light' | 'heavy';
export type RhythmProfile = 'logo' | 'title' | 'meta' | 'body';

export interface MusicGlitchOptions {
  /** Enables blackout and character-corruption DOM mutations. */
  enabled: boolean;
  /** Keeps music-driven CSS motion active when mutations are disabled. */
  rhythmEnabled?: boolean;
  paused?: boolean;
  intensity: GlitchIntensity;
  profile: RhythmProfile;
}

export interface MusicRhythmCalibration {
  blackoutSustainThreshold: number;
  blackoutPulseThreshold: number;
  dispersionSustainThreshold: number;
  heavyLowBlockThreshold: number;
  heavyLowBlockRange: number;
  heavyLoudnessThreshold: number;
  heavyLoudnessRange: number;
  bodyLoudnessThreshold: number;
  bodyLoudnessRange: number;
  bodyLowThreshold: number;
  bodyLowRange: number;
  bodyCoverageMinimum: number;
  bodyCoverageRange: number;
}

// These values are calibrated from the bundled MP3s using a 1024-point
// Blackman FFT, 40 Hz sampling, and the same analyser smoothing as the page.
// The blackout gates use the smoothed macro bass envelope, not a one-frame
// fine-band attack: that keeps large blocks on sustained climaxes instead of
// isolated kicks. The bundled tracks have materially different low-end and
// high-frequency profiles, so they need independent gates.
export const MUSIC_RHYTHM_CALIBRATIONS = {
  mia: {
    blackoutSustainThreshold: 0.835,
    blackoutPulseThreshold: 0.22,
    dispersionSustainThreshold: 0.5,
    heavyLowBlockThreshold: 0.815,
    heavyLowBlockRange: 0.055,
    heavyLoudnessThreshold: 0.735,
    heavyLoudnessRange: 0.05,
    bodyLoudnessThreshold: 0.725,
    bodyLoudnessRange: 0.045,
    bodyLowThreshold: 0.805,
    bodyLowRange: 0.045,
    bodyCoverageMinimum: 0.02,
    bodyCoverageRange: 0.98,
  },
  inMyBed: {
    blackoutSustainThreshold: 0.805,
    blackoutPulseThreshold: 0.2,
    dispersionSustainThreshold: 0.28,
    heavyLowBlockThreshold: 0.785,
    heavyLowBlockRange: 0.055,
    heavyLoudnessThreshold: 0.67,
    heavyLoudnessRange: 0.05,
    bodyLoudnessThreshold: 0.66,
    bodyLoudnessRange: 0.045,
    bodyLowThreshold: 0.775,
    bodyLowRange: 0.04,
    bodyCoverageMinimum: 0.02,
    bodyCoverageRange: 0.98,
  },
  becauseItHurtsToLose: {
    blackoutSustainThreshold: 0.84,
    blackoutPulseThreshold: 0.21,
    dispersionSustainThreshold: 0.24,
    heavyLowBlockThreshold: 0.82,
    heavyLowBlockRange: 0.055,
    heavyLoudnessThreshold: 0.685,
    heavyLoudnessRange: 0.05,
    bodyLoudnessThreshold: 0.675,
    bodyLoudnessRange: 0.045,
    bodyLowThreshold: 0.81,
    bodyLowRange: 0.04,
    bodyCoverageMinimum: 0.02,
    bodyCoverageRange: 0.98,
  },
} as const satisfies Record<string, MusicRhythmCalibration>;

const DEFAULT_RHYTHM_CALIBRATION: MusicRhythmCalibration =
  MUSIC_RHYTHM_CALIBRATIONS.mia;

type FineBand = 'sub' | 'bass' | 'lowMid' | 'mid' | 'presence' | 'high';
type MusicState = 'idle' | 'paused' | 'playing' | 'unsupported' | 'reduced';
type FrequencyRange = readonly [lowHz: number, highHz: number];
type FineLevels = Record<FineBand, number>;
type GlitchChannel = 'blackout' | 'dispersion';
type BlackoutKind = 'blackout' | 'depth';

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
  nextCycleAt: Record<GlitchChannel, number>;
  bodyCoverageFloor: number;
  bodyCoverageUpdatedAt: number;
}

interface ProfileConfig {
  gain: number;
  beatChance: number;
  minDelay: number;
  maxDelay: number;
  cadenceResponse: number;
  refreshScale: number;
  minimumDelayScale: number;
  maxMutations: number;
  maxLength: number;
}

interface ChannelSignal {
  level: number;
  sustainLevel: number;
  pulse: number;
}

interface ChannelConfig {
  minDelayScale: number;
  maxDelayScale: number;
  minimumDelay: number;
  mutationScale: number;
  sustainedActionFloor: number;
  removalScale: number;
  // A pulse is a relative change, so it needs a minimum pulse and absolute
  // energy floors before it can be treated as an attack. Otherwise a tiny
  // change near silence can look exactly like a real beat.
  attackPulseFloor: number;
  attackLevelFloor: number;
  attackEnvelopeFloor: number;
  // A sustained passage may use a lower gate than a transient attack, while
  // the calibrated threshold still represents full retention.
  sustainHoldRatio: number;
  sustainedRemovalRetention: number;
}

interface ChannelActivity {
  hasAttack: boolean;
  hasSustainedSignal: boolean;
  removalRetention: number;
}

interface GlitchSpectrum {
  flatBlackout: number;
  depthBlackout: number;
  low: number;
  high: number;
}

const FFT_SIZE = 1024;
const CSS_UPDATE_INTERVAL = 1000 / 40;
const MIN_BEAT_INTERVAL = 140;
const DISPERSION_PULSE_THRESHOLD = 0.12;
const BODY_COVERAGE_DECAY_HALF_LIFE = 700;
const ANALYSER_MIN_DECIBELS = -100;
const ANALYSER_MAX_DECIBELS = 0;
const BASS_FLOOR_RISE_RESPONSE = 0.008;
const BASS_FLOOR_FALL_RESPONSE = 0.3;
const CLIMAX_FLOOR_HOLD_RATIO = 0.9;
const BODY_RHYTHM_GAIN = 0.85;
const BASS_FLOOR_REFERENCE_MIN = 0.04;
const BASS_FLOOR_REFERENCE_MAX = 0.6;
const BLACKOUT_REMOVAL_REDUCTION = 0.55;
// Keep a low-end passage from opening the blackout removal gate immediately
// when the adaptive beat baseline drops between hits.
const BLACKOUT_REMOVAL_HOLD_MS = 1200;
const BLACKOUT_REMOVAL_FALL_HALF_LIFE = 700;

// These boundaries separate the actual DOM effects: sub/kick cuts, bass depth,
// and high-frequency chromatic glyph corruption.
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

const LOW_BLACKOUT_BANDS = ['bass', 'lowMid'] as const satisfies readonly FineBand[];
const HIGH_DISPERSION_BANDS = ['presence', 'high'] as const satisfies readonly FineBand[];
const GLITCH_CHANNELS: readonly GlitchChannel[] = ['blackout', 'dispersion'];

const CHANNEL_CONFIG: Record<GlitchChannel, ChannelConfig> = {
  // Low-end blocks should refresh quickly enough to track the groove while
  // retaining their coverage during sustained drops.
  blackout: {
    minDelayScale: 0.7,
    maxDelayScale: 0.82,
    minimumDelay: 80,
    mutationScale: 0.85,
    sustainedActionFloor: 0.52,
    removalScale: 0.3,
    attackPulseFloor: 0.3,
    attackLevelFloor: 0.44,
    attackEnvelopeFloor: 0.14,
    sustainHoldRatio: 0.74,
    sustainedRemovalRetention: 0.72,
  },
  // High frequencies have their own faster cadence. They no longer compete
  // with black blocks for a single random mutation slot. At a bright peak,
  // create larger glyph objects quickly instead of a few timid replacements.
  dispersion: {
    minDelayScale: 0.54,
    maxDelayScale: 0.64,
    minimumDelay: 60,
    mutationScale: 0.5,
    sustainedActionFloor: 0.72,
    removalScale: 0.42,
    attackPulseFloor: 0.22,
    attackLevelFloor: 0.3,
    attackEnvelopeFloor: 0.075,
    sustainHoldRatio: 0.78,
    sustainedRemovalRetention: 0.65,
  },
};

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
    gain: 1.32,
    beatChance: 0.98,
    minDelay: 90,
    maxDelay: 260,
    cadenceResponse: 2.4,
    refreshScale: 1,
    minimumDelayScale: 1,
    maxMutations: 1,
    maxLength: 4,
  },
  title: {
    gain: 1.3,
    beatChance: 0.9,
    minDelay: 110,
    maxDelay: 330,
    cadenceResponse: 2.2,
    refreshScale: 1,
    minimumDelayScale: 1,
    maxMutations: 1,
    maxLength: 5,
  },
  meta: {
    gain: 1.42,
    beatChance: 0.72,
    minDelay: 80,
    maxDelay: 230,
    cadenceResponse: 2,
    refreshScale: 1,
    minimumDelayScale: 1,
    maxMutations: 1,
    maxLength: 2,
  },
  body: {
    gain: 1.22,
    beatChance: 1,
    minDelay: 150,
    maxDelay: 360,
    cadenceResponse: 8,
    refreshScale: 0.9,
    minimumDelayScale: 0.8,
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

function getBlackoutRemovalScale(
  channel: GlitchChannel,
  bassFloor: number,
): number {
  if (channel !== 'blackout') return 1;

  // A higher adaptive threshold means the low end is already carrying a
  // sustained load, so preserve existing black blocks instead of clearing
  // them as aggressively on every cycle.
  const thresholdPressure = clamp(
    (bassFloor - BASS_FLOOR_REFERENCE_MIN) /
      (BASS_FLOOR_REFERENCE_MAX - BASS_FLOOR_REFERENCE_MIN),
  );
  return 1 - thresholdPressure * BLACKOUT_REMOVAL_REDUCTION;
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

function readFineSignal(snapshot: RhythmSnapshot, bands: readonly FineBand[]): number {
  return Math.max(
    ...bands.map((band) =>
      // Short attacks should decide the next mutation. A little envelope is
      // retained so sustained notes do not make the ratio flicker every frame.
      snapshot.finePulse[band] * 0.82 + snapshot.fine[band] * 0.18,
    ),
  );
}

function getGlitchSpectrum(snapshot: RhythmSnapshot): GlitchSpectrum {
  const flatBlackout = readFineSignal(snapshot, ['sub']);
  const depthBlackout = readFineSignal(snapshot, LOW_BLACKOUT_BANDS);
  const high = readFineSignal(snapshot, HIGH_DISPERSION_BANDS);
  const low = Math.max(flatBlackout, depthBlackout);

  return {
    flatBlackout,
    depthBlackout,
    low,
    high,
  };
}

function pickBlackoutKind(spectrum: GlitchSpectrum): BlackoutKind {
  // Both variants are visually black blocks. Sub/kick favors the flat cutout;
  // bass and low-mid material favors the recessed, heavier version.
  return Math.random() * (spectrum.flatBlackout + spectrum.depthBlackout) < spectrum.flatBlackout
    ? 'blackout'
    : 'depth';
}

function getChannelSignal(
  channel: GlitchChannel,
  snapshot: RhythmSnapshot,
  spectrum: GlitchSpectrum,
): ChannelSignal {
  switch (channel) {
    case 'blackout':
      return {
        level: clamp(snapshot.bass * 0.78 + spectrum.low * 0.42),
        // A short kick still raises mutation intensity through `level` and
        // `pulse`, but only the macro envelope may open the sustained gate.
        sustainLevel: snapshot.bass,
        pulse: Math.max(
          snapshot.bassPulse,
          snapshot.finePulse.sub,
          snapshot.finePulse.bass,
          snapshot.finePulse.lowMid,
          snapshot.beat,
        ),
      };
    case 'dispersion':
    {
      const level = clamp(snapshot.high * 0.78 + spectrum.high * 0.42);
      return {
        level,
        // Fine-band pulses make glyph bursts vivid, but they must not keep a
        // channel open by themselves. The slow macro envelope is what tells
        // us that the high-frequency content is actually sustained.
        sustainLevel: snapshot.high,
        pulse: Math.max(
          snapshot.highPulse,
          snapshot.finePulse.presence,
          snapshot.finePulse.high,
        ),
      };
    }
  }
}

function getChannelActivity(
  channel: GlitchChannel,
  signal: ChannelSignal,
  calibration: MusicRhythmCalibration,
): ChannelActivity {
  const config = CHANNEL_CONFIG[channel];
  const sustainThreshold =
    channel === 'blackout'
      ? calibration.blackoutSustainThreshold
      : calibration.dispersionSustainThreshold;
  const pulseThreshold = Math.max(
    channel === 'blackout'
      ? calibration.blackoutPulseThreshold
      : DISPERSION_PULSE_THRESHOLD,
    config.attackPulseFloor,
  );
  const sustainHoldThreshold = sustainThreshold * config.sustainHoldRatio;
  const sustainStrength = clamp(
    (signal.sustainLevel - sustainHoldThreshold) /
      Math.max(0.001, sustainThreshold - sustainHoldThreshold),
  );

  return {
    // A sustained sound can run the slower refresh path once it clears the
    // lower hold threshold. The full threshold still maps to full retention.
    hasSustainedSignal: sustainStrength > 0,
    // Require both a meaningful absolute level and a smoothed envelope. This
    // filters isolated low-volume jitter even when its relative pulse is high.
    hasAttack:
      signal.pulse >= pulseThreshold &&
      signal.level >= config.attackLevelFloor &&
      signal.sustainLevel >= config.attackEnvelopeFloor,
    // Preserve part of the current density during a continuous passage, but
    // retain some turnover so a long section does not fill every text node.
    removalRetention: sustainStrength * config.sustainedRemovalRetention,
  };
}

function getOverallLoudness(snapshot: RhythmSnapshot): number {
  return clamp(snapshot.bass * 0.56 + snapshot.mid * 0.28 + snapshot.high * 0.16);
}

function getLoudnessRetention(
  snapshot: RhythmSnapshot,
  calibration: MusicRhythmCalibration,
): number {
  // This only protects spans that already exist. It must not open a channel
  // or create new corruption from loudness alone.
  return clamp(
    (getOverallLoudness(snapshot) - calibration.bodyLoudnessThreshold) /
      calibration.bodyLoudnessRange,
  );
}

function getLargeBlackoutPressure(
  snapshot: RhythmSnapshot,
  calibration: MusicRhythmCalibration,
): number {
  // Do not let a single sub/bass transient decide block size. Large blocks need
  // both a sustained low-end envelope and a loud section, which is the shape
  // of the surveyed climaxes in both bundled tracks.
  const lowPressure = clamp(
    (snapshot.bass - calibration.heavyLowBlockThreshold) /
      calibration.heavyLowBlockRange,
  );
  const loudnessPressure = clamp(
    (getOverallLoudness(snapshot) - calibration.heavyLoudnessThreshold) /
      calibration.heavyLoudnessRange,
  );

  // Bright percussion must not suppress a genuinely low-heavy climax. The
  // low gate already rejects a bright-but-light section, so take the weaker
  // of the two sustained pressures instead of penalizing high frequencies.
  return Math.min(lowPressure, loudnessPressure);
}

function getBodyBlackoutCoverageFloor(
  snapshot: RhythmSnapshot,
  calibration: MusicRhythmCalibration,
): number {
  const loudnessPressure = getLoudnessRetention(snapshot, calibration);
  const lowPressure = clamp(
    (snapshot.bass - calibration.bodyLowThreshold) / calibration.bodyLowRange,
  );
  const coveragePressure = Math.min(loudnessPressure, lowPressure);

  // Make a real climax much more destructive than the lead-in: the lower end
  // of the calibrated range only takes a small slice, while a fully sustained
  // peak can reserve the entire visible body. This is a coverage floor, not
  // another transient burst, so it remains in place between individual hits.
  const shapedPressure = coveragePressure ** 1.65;
  return coveragePressure > 0
    ? calibration.bodyCoverageMinimum + shapedPressure * calibration.bodyCoverageRange
    : 0;
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
  private blackoutRemovalFloor = BASS_FLOOR_REFERENCE_MIN;
  private blackoutRemovalHoldUntil = 0;
  private beatPulse = 0;
  private calibration: MusicRhythmCalibration = DEFAULT_RHYTHM_CALIBRATION;

  registerTarget(element: HTMLElement): () => void {
    const target: RhythmTarget = {
      element,
      options: { ...DISABLED_TARGET_OPTIONS },
      nextCycleAt: {
        blackout: 0,
        dispersion: 0,
      },
      bodyCoverageFloor: 0,
      bodyCoverageUpdatedAt: 0,
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
    const rhythmEnabled = options.rhythmEnabled ?? options.enabled;

    if (rhythmEnabled) {
      element.classList.add('music-glitch-target');
      if (previousProfile !== options.profile) {
        element.classList.remove(`music-glitch-target--${previousProfile}`);
      }
      element.classList.add(`music-glitch-target--${options.profile}`);
      element.dataset.musicRhythmProfile = options.profile;
    } else {
      element.classList.remove(
        'music-glitch-target',
        `music-glitch-target--${previousProfile}`,
        `music-glitch-target--${options.profile}`,
      );
      delete element.dataset.musicRhythmProfile;
    }

    if (!options.enabled) {
      target.bodyCoverageFloor = 0;
      target.bodyCoverageUpdatedAt = 0;
      restoreGlitchSpans(element);
    }
  }

  connect(
    audioElement: HTMLAudioElement | null,
    calibration: MusicRhythmCalibration = DEFAULT_RHYTHM_CALIBRATION,
  ): void {
    if (!audioElement) {
      this.disconnect();
      return;
    }

    if (audioElement === this.audioElement) {
      this.calibration = calibration;
      this.applyAnalyserRange();
      return;
    }

    this.disconnect();
    this.calibration = calibration;
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
      this.applyAnalyserRange();
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

  private applyAnalyserRange(): void {
    if (!this.analyserNode) return;

    // The browser defaults to maxDecibels = -30. Both bundled masters sit
    // above that through much of their runtime, which collapses the analyser
    // to 1.0 and makes every low-frequency gate look like a climax.
    this.analyserNode.minDecibels = ANALYSER_MIN_DECIBELS;
    this.analyserNode.maxDecibels = ANALYSER_MAX_DECIBELS;
  }

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
    // Let the adaptive beat baseline follow quieter passages, but do not let
    // a sustained climax raise it underneath the music. Only downward motion
    // is allowed while the calibrated low-end climax gate is active, so the
    // middle of a climax keeps the same beat sensitivity as its entrance.
    const isSustainedClimax =
      this.bass >= this.calibration.blackoutSustainThreshold * CLIMAX_FLOOR_HOLD_RATIO;
    const bassFloorTarget = isSustainedClimax
      ? Math.min(rawBass, this.bassFloor)
      : rawBass;
    const bassFloorResponse =
      bassFloorTarget < this.bassFloor
        ? BASS_FLOOR_FALL_RESPONSE
        : BASS_FLOOR_RISE_RESPONSE;
    this.bassFloor += (bassFloorTarget - this.bassFloor) * bassFloorResponse;
    this.updateBlackoutRemovalFloor(now, deltaMs);

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
    const spectrum = getGlitchSpectrum(snapshot);
    const loudnessRetention = getLoudnessRetention(snapshot, this.calibration);

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
      const bodyCoverageFloor =
        target.options.profile === 'body'
          ? this.getHeldBodyBlackoutCoverageFloor(target, snapshot, now)
          : 0;
      for (const channel of GLITCH_CHANNELS) {
        const blackoutCoverageFloor =
          channel === 'blackout' && target.options.profile === 'body'
            ? bodyCoverageFloor
            : 0;
        this.runGlitchChannel(
          target,
          profile,
          channel,
          getChannelSignal(channel, snapshot, spectrum),
          snapshot,
          spectrum,
          blackoutCoverageFloor,
          loudnessRetention,
          now,
        );
      }
    }
  }

  private getHeldBodyBlackoutCoverageFloor(
    target: RhythmTarget,
    snapshot: RhythmSnapshot,
    now: number,
  ): number {
    const instantFloor = getBodyBlackoutCoverageFloor(snapshot, this.calibration);
    const elapsed = Math.max(0, now - target.bodyCoverageUpdatedAt);
    const decayedFloor =
      target.bodyCoverageFloor *
      Math.pow(0.5, elapsed / BODY_COVERAGE_DECAY_HALF_LIFE);
    const heldFloor = Math.max(instantFloor, decayedFloor);

    target.bodyCoverageFloor = heldFloor;
    target.bodyCoverageUpdatedAt = now;
    return heldFloor;
  }

  // The beat baseline needs to fall quickly so the next quiet passage can
  // still detect attacks. Keep a separate, peak-held copy for black-block
  // removal instead, then release it smoothly after a short grace period.
  private updateBlackoutRemovalFloor(now: number, deltaMs: number): void {
    if (this.bassFloor >= this.blackoutRemovalFloor) {
      this.blackoutRemovalFloor = this.bassFloor;
      this.blackoutRemovalHoldUntil = now + BLACKOUT_REMOVAL_HOLD_MS;
      return;
    }

    if (now < this.blackoutRemovalHoldUntil) return;

    const fallProgress = 1 - Math.pow(0.5, deltaMs / BLACKOUT_REMOVAL_FALL_HALF_LIFE);
    this.blackoutRemovalFloor +=
      (this.bassFloor - this.blackoutRemovalFloor) * fallProgress;
  }

  private runGlitchChannel(
    target: RhythmTarget,
    profile: ProfileConfig,
    channel: GlitchChannel,
    signal: ChannelSignal,
    snapshot: RhythmSnapshot,
    spectrum: GlitchSpectrum,
    blackoutCoverageFloor: number,
    loudnessRetention: number,
    now: number,
  ): void {
    const config = CHANNEL_CONFIG[channel];
    const level = clamp(signal.level * profile.gain);
    const activity = getChannelActivity(channel, signal, this.calibration);
    // Profile gain controls visual density after a channel is open. It must
    // not alter the audio threshold itself, otherwise the same track can be
    // permanently "heavy" for one text profile and quiet for another.

    const mustMaintainCoverage =
      blackoutCoverageFloor > 0 &&
      getBlackoutCoverage(target.element).ratio < blackoutCoverageFloor;

    if (!activity.hasSustainedSignal && !activity.hasAttack && !mustMaintainCoverage) {
      this.releaseInactiveChannel(target, channel, config, loudnessRetention, now);
      return;
    }
    if (now < target.nextCycleAt[channel]) return;

    const cadence =
      profile.minDelay * config.minDelayScale +
      Math.random() * (profile.maxDelay * config.maxDelayScale - profile.minDelay * config.minDelayScale);
    target.nextCycleAt[channel] = now + Math.max(
      config.minimumDelay * profile.minimumDelayScale,
      (cadence * profile.refreshScale) / (1 + level * profile.cadenceResponse),
    );

    const burst = activity.hasAttack && Math.random() < profile.beatChance;
    const sustainedActionChance =
      config.sustainedActionFloor + level * (1 - config.sustainedActionFloor);
    if (!burst && !mustMaintainCoverage && Math.random() > sustainedActionChance) return;

    this.mutateTarget(
      target,
      profile,
      channel,
      level,
      burst,
      snapshot,
      spectrum,
      blackoutCoverageFloor,
      Math.max(loudnessRetention, activity.removalRetention),
    );
  }

  private releaseInactiveChannel(
    target: RhythmTarget,
    channel: GlitchChannel,
    config: ChannelConfig,
    loudnessRetention: number,
    now: number,
  ): void {
    if (now < target.nextCycleAt[channel]) return;

    const intensity = INTENSITY_CONFIG[target.options.intensity];
    const adaptiveRemovalScale = getBlackoutRemovalScale(channel, this.blackoutRemovalFloor);
    // Effects otherwise remain in the DOM until the next low/high hit, which
    // makes a block generated at one beat look as though it belongs to a later
    // section. Fade only this channel's spans between passages.
    const baseReleaseProbability = clamp(
      0.34 + intensity.removeProbability * config.removalScale * adaptiveRemovalScale,
      channel === 'blackout' ? 0.3 : 0.38,
      0.62,
    );
    // When the mix is still loud, retain the currently visible corruption
    // instead of letting a momentary band drop erase it all at once.
    const releaseProbability = baseReleaseProbability * (1 - loudnessRetention);
    removeSomeGlitchSpans(target.element, releaseProbability, channel);
    target.nextCycleAt[channel] = now + Math.max(180, config.minimumDelay * 1.5);
  }

  private mutateTarget(
    target: RhythmTarget,
    profile: ProfileConfig,
    channel: GlitchChannel,
    level: number,
    burst: boolean,
    snapshot: RhythmSnapshot,
    spectrum: GlitchSpectrum,
    blackoutCoverageFloor: number,
    removalRetention: number,
  ): void {
    const channelConfig = CHANNEL_CONFIG[channel];
    const intensity = INTENSITY_CONFIG[target.options.intensity];
    const adaptiveRemovalScale = getBlackoutRemovalScale(channel, this.blackoutRemovalFloor);
    const actionProbability = clamp(
      intensity.actionProbability *
        channelConfig.mutationScale *
        (0.64 + level * 0.8 + (burst ? 0.22 : 0)),
    );
    const coverageBefore =
      channel === 'blackout' && target.options.profile === 'body'
        ? getBlackoutCoverage(target.element)
        : null;
    const baseRemoveProbability =
      coverageBefore && coverageBefore.ratio < blackoutCoverageFloor
        ? 0
        : clamp(
          intensity.removeProbability *
            channelConfig.removalScale *
            adaptiveRemovalScale *
            (0.45 + level * 0.35) +
            (target.options.profile === 'body' ? level * 0.18 : 0),
        );
    const removeProbability = baseRemoveProbability * (1 - removalRetention);

    // Each channel only refreshes its own spans. High-frequency glyph
    // corruption therefore cannot clear low-end black blocks, and vice versa.
    removeSomeGlitchSpans(target.element, removeProbability, channel);

    const candidates = collectTextNodes(target.element).filter((textNode) => {
      const text = textNode.textContent ?? '';
      return text.trim().length > 0;
    });
    const largeBlackoutPressure =
      channel === 'blackout'
        ? getLargeBlackoutPressure(snapshot, this.calibration)
        : 0;
    // Full-body coverage is reserved for a real low-end attack at the top of
    // the calibrated range. A merely loud, sustained master uses the smaller
    // coverage floor below instead of repeatedly consuming the whole body.
    const peakCoverage =
      channel === 'blackout' && target.options.profile === 'body' && burst
        ? clamp((largeBlackoutPressure - 0.5) / 0.5)
        : 0;
    const largeBlackoutProfileGain =
      target.options.profile === 'body' ? 1 : 0.45;

    if (candidates.length > 0) {
      const mutationBudget = Math.max(
        1,
        Math.ceil(profile.maxMutations * channelConfig.mutationScale),
      );
      const expectedMutations = mutationBudget * actionProbability;
      // At a real low-end peak, readability is intentionally sacrificed: cover
      // the complete eligible text set so a long post does not look mostly intact.
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
        const isDispersion = channel === 'dispersion';
        const isLargeBlackout =
          channel === 'blackout' &&
          Math.random() < largeBlackoutPressure * largeBlackoutProfileGain;

        const regularLengthScale = isDispersion
          ? 1.35 + level * 0.85 + (burst ? 0.25 : 0)
          : burst
            ? 1.2
            : 1;
        const regularMaxLength = Math.min(
          text.length,
          peakCoverage > 0
            ? Math.max(1, Math.ceil(text.length * (0.25 + peakCoverage * 0.75)))
            : Math.max(1, Math.ceil(profile.maxLength * regularLengthScale)),
        );
        // On a heavy low-end passage, selected blackouts become actual blocks:
        // their span starts at a sizeable fraction of the text node, rather than
        // merely increasing the chance of a normal short blackout.
        const maxLength = isLargeBlackout
          ? Math.max(
            regularMaxLength,
            Math.ceil(text.length * (0.42 + largeBlackoutPressure * 0.5)),
          )
          : regularMaxLength;
        const minLength = isLargeBlackout
          ? Math.min(
            maxLength,
            Math.ceil(maxLength * (0.48 + largeBlackoutPressure * 0.32)),
          )
          : isDispersion
            ? Math.min(
              maxLength,
              Math.max(2, Math.ceil(maxLength * (0.3 + level * 0.25))),
            )
          : 1;
        const length =
          peakCoverage >= 0.9
            ? text.length
            : Math.min(
              minLength + Math.floor(Math.random() * (maxLength - minLength + 1)),
              text.length,
            );
        const start = Math.floor(Math.random() * (text.length - length + 1));

        switch (channel) {
          case 'blackout':
            if (pickBlackoutKind(spectrum) === 'blackout') {
              applyBlackout(textNode, start, length);
            } else {
              applyDepthBlackout(textNode, start, length);
            }
            break;
          case 'dispersion':
            applyGlitchCharsGroup(textNode, start, length);
            break;
        }
      }
    }

    if (
      channel === 'blackout' &&
      target.options.profile === 'body' &&
      blackoutCoverageFloor > 0
    ) {
      this.maintainBodyBlackoutCoverage(
        target.element,
        spectrum,
        blackoutCoverageFloor,
        largeBlackoutPressure,
      );
    }
  }

  private maintainBodyBlackoutCoverage(
    element: HTMLElement,
    spectrum: GlitchSpectrum,
    blackoutCoverageFloor: number,
    largeBlackoutPressure: number,
  ): void {
    const coverage = getBlackoutCoverage(element);
    if (
      coverage.totalCharacters === 0 ||
      coverage.ratio >= blackoutCoverageFloor
    ) {
      return;
    }

    let missingCharacters = Math.ceil(
      coverage.totalCharacters * blackoutCoverageFloor - coverage.blackoutCharacters,
    );
    let candidates = collectTextNodes(element).filter((textNode) => {
      const text = textNode.textContent ?? '';
      return text.trim().length > 0;
    });

    const availableCharacters = candidates.reduce(
      (total, textNode) => total + (textNode.textContent?.length ?? 0),
      0,
    );
    if (availableCharacters < missingCharacters) {
      // Preserve the independent channels in normal operation, but when the
      // body floor cannot be met, free enough high-frequency glyph groups for
      // the low-end channel to reserve its promised share of the text.
      const releaseProbability = clamp(
        (missingCharacters - availableCharacters) /
          Math.max(1, coverage.totalCharacters - coverage.blackoutCharacters),
        0.35,
        0.85,
      );
      removeSomeGlitchSpans(element, releaseProbability, 'dispersion');
      candidates = collectTextNodes(element).filter((textNode) => {
        const text = textNode.textContent ?? '';
        return text.trim().length > 0;
      });
    }

    if (candidates.length === 0 || missingCharacters <= 0) return;

    const averageLength = candidates.reduce(
      (total, textNode) => total + (textNode.textContent?.length ?? 0),
      0,
    ) / candidates.length;
    const expectedBlockLength = averageLength * (0.36 + largeBlackoutPressure * 0.42);
    const selectedCount = Math.min(
      candidates.length,
      Math.max(1, Math.ceil(missingCharacters / Math.max(1, expectedBlockLength))),
    );
    const selected = sampleAcrossText(candidates, selectedCount);
    const selectedSet = new Set(selected);
    const orderedCandidates = [
      ...selected,
      ...candidates.filter((textNode) => !selectedSet.has(textNode)),
    ];

    for (const textNode of orderedCandidates) {
      if (missingCharacters <= 0) break;
      const text = textNode.textContent ?? '';
      const maxLength = Math.min(
        text.length,
        Math.max(1, Math.ceil(text.length * (0.42 + largeBlackoutPressure * 0.5))),
      );
      const minLength = Math.min(
        maxLength,
        Math.max(1, Math.ceil(maxLength * (0.48 + largeBlackoutPressure * 0.32))),
      );
      const length = Math.min(
        text.length,
        Math.max(minLength, Math.min(missingCharacters, maxLength)),
      );
      const start = Math.floor(Math.random() * (text.length - length + 1));

      if (pickBlackoutKind(spectrum) === 'blackout') {
        applyBlackout(textNode, start, length);
      } else {
        applyDepthBlackout(textNode, start, length);
      }
      missingCharacters -= length;
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
    this.blackoutRemovalFloor = BASS_FLOOR_REFERENCE_MIN;
    this.blackoutRemovalHoldUntil = 0;
    this.beatPulse = 0;
    for (const target of this.targets.values()) {
      target.bodyCoverageFloor = 0;
      target.bodyCoverageUpdatedAt = 0;
    }
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
    root.style.setProperty('--music-glitch-front-duration', `${Math.round(340 - reaction * 100)}ms`);
    root.style.setProperty('--music-glitch-mid-duration', `${Math.round(500 - reaction * 140)}ms`);
    root.style.setProperty('--music-glitch-back-duration', `${Math.round(760 - reaction * 220)}ms`);

    const bodyScale = 1 + reaction * BODY_RHYTHM_GAIN * 0.018;
    const bodyLetterSpacing = reaction * BODY_RHYTHM_GAIN * 0.022;
    root.style.setProperty('--music-body-rhythm-scale', bodyScale.toFixed(4));
    root.style.setProperty('--music-body-rhythm-letter', `${bodyLetterSpacing.toFixed(4)}em`);

    const bodyReaction = clamp(macroPulse * 1.45 + snapshot.beat * 1.05);
    root.style.setProperty('--music-body-glitch-front-duration', `${Math.round(310 - bodyReaction * 250)}ms`);
    root.style.setProperty('--music-body-glitch-mid-duration', `${Math.round(460 - bodyReaction * 360)}ms`);
    root.style.setProperty('--music-body-glitch-back-duration', `${Math.round(700 - bodyReaction * 520)}ms`);

    for (const [name, gain] of tiers) {
      const scale = 1 + reaction * gain * 0.018;
      const letterSpacing = reaction * gain * 0.022;

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
