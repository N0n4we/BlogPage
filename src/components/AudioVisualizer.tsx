import { useEffect, useRef, useState } from 'react';

const BAR_COUNT = 128;
const FFT_SIZE = 4096; // → 2048 samples, ~93ms time window @ 44.1kHz
const SMOOTHING_TIME_CONSTANT = 0.8;
const BINS_PER_BAR = FFT_SIZE / 2 / BAR_COUNT; // 16 samples per bar
const LERP_FACTOR = 0.15; // per‑frame smoothing (lower = smoother/slower)

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  height: number;
}

/**
 * AudioVisualizer — dual‑channel (stereo) waveform visualizer.
 *
 * Top bars = left channel (grow upward from center),
 * Bottom bars = right channel (grow downward from center).
 *
 * Web Audio pipeline:
 *   source → ChannelSplitter → leftAnalyser  → ChannelMerger → destination
 *                            → rightAnalyser →
 */
export default function AudioVisualizer({ audioElement, isPlaying, height }: AudioVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rightBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const leftAnalyserRef = useRef<AnalyserNode | null>(null);
  const rightAnalyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const mergerRef = useRef<ChannelMergerNode | null>(null);
  const rafIdRef = useRef<number>(0);
  const leftDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rightDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const isPlayingRef = useRef(false);
  const prevLeftRef = useRef<Float64Array | null>(null);
  const prevRightRef = useRef<Float64Array | null>(null);
  const [webAudioState, setWebAudioState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const webAudioFailed = webAudioState === 'failed';
  const webAudioReady = webAudioState === 'ready';

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  /* ---------- AudioContext + stereo analyser setup ---------- */
  useEffect(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      setWebAudioState('failed');
      return;
    }

    if (!audioElement) return;

    const ctx = new AudioCtx();
    audioContextRef.current = ctx;

    try {
      const source = ctx.createMediaElementSource(audioElement);
      sourceRef.current = source;

      // Split stereo into left + right
      const splitter = ctx.createChannelSplitter(2);
      splitterRef.current = splitter;
      source.connect(splitter);

      // Left channel analyser
      const leftAnalyser = ctx.createAnalyser();
      leftAnalyser.fftSize = FFT_SIZE;
      leftAnalyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      leftAnalyserRef.current = leftAnalyser;
      splitter.connect(leftAnalyser, 0); // channel 0 = left

      // Right channel analyser
      const rightAnalyser = ctx.createAnalyser();
      rightAnalyser.fftSize = FFT_SIZE;
      rightAnalyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      rightAnalyserRef.current = rightAnalyser;
      splitter.connect(rightAnalyser, 1); // channel 1 = right

      // Merge back to stereo for speakers
      const merger = ctx.createChannelMerger(2);
      mergerRef.current = merger;
      leftAnalyser.connect(merger, 0, 0);
      rightAnalyser.connect(merger, 0, 1);
      merger.connect(ctx.destination);

      const bufferLength = leftAnalyser.frequencyBinCount; // 512
      leftDataRef.current = new Uint8Array(new ArrayBuffer(bufferLength));
      rightDataRef.current = new Uint8Array(new ArrayBuffer(bufferLength));

      console.log('[AudioVisualizer] Stereo Web Audio setup OK');
      setWebAudioState('ready');
    } catch (err) {
      console.warn('[AudioVisualizer] setup failed', err);
      setWebAudioState('failed');
      ctx.close().catch(() => {});
      audioContextRef.current = null;
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      splitterRef.current?.disconnect();
      mergerRef.current?.disconnect();
      leftAnalyserRef.current?.disconnect();
      rightAnalyserRef.current?.disconnect();
      sourceRef.current?.disconnect();
      splitterRef.current = null;
      mergerRef.current = null;
      leftAnalyserRef.current = null;
      rightAnalyserRef.current = null;
      sourceRef.current = null;
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
  }, [audioElement]);

  /* ---------- RAF render loop (stereo) ---------- */
  useEffect(() => {
    if (!webAudioReady) return;

    const lAnalyser = leftAnalyserRef.current;
    const rAnalyser = rightAnalyserRef.current;
    const lData = leftDataRef.current;
    const rData = rightDataRef.current;
    if (!lAnalyser || !rAnalyser || !lData || !rData) return;

    // Init smoothed arrays once
    if (!prevLeftRef.current) prevLeftRef.current = new Float64Array(BAR_COUNT);
    if (!prevRightRef.current) prevRightRef.current = new Float64Array(BAR_COUNT);
    const prevL = prevLeftRef.current;
    const prevR = prevRightRef.current;

    function render() {
      rafIdRef.current = requestAnimationFrame(render);

      if (!isPlayingRef.current) return;

      lAnalyser!.getByteTimeDomainData(lData!);
      rAnalyser!.getByteTimeDomainData(rData!);

      for (let i = 0; i < BAR_COUNT; i++) {
        const leftEl = leftBarRefs.current[i];
        const rightEl = rightBarRefs.current[i];
        if (!leftEl && !rightEl) continue;

        const start = i * BINS_PER_BAR;
        let lSum = 0;
        let rSum = 0;
        for (let j = 0; j < BINS_PER_BAR; j++) {
          lSum += Math.abs(lData![start + j] - 128);
          rSum += Math.abs(rData![start + j] - 128);
        }
        const lTarget = Math.pow(lSum / BINS_PER_BAR / 128, 0.7);
        const rTarget = Math.pow(rSum / BINS_PER_BAR / 128, 0.7);

        // Exponential moving average for buttery‑smooth transitions
        prevL[i] += (lTarget - prevL[i]) * LERP_FACTOR;
        prevR[i] += (rTarget - prevR[i]) * LERP_FACTOR;

        if (leftEl) leftEl.style.transform = `scaleY(${prevL[i]})`;
        if (rightEl) rightEl.style.transform = `scaleY(${prevR[i]})`;
      }
    }

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [webAudioReady]);

  /* ---------- Visibility change ---------- */
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = 0;
        }
      } else if (isPlaying && webAudioReady) {
        const lAnalyser = leftAnalyserRef.current;
        const rAnalyser = rightAnalyserRef.current;
        const lData = leftDataRef.current;
        const rData = rightDataRef.current;
        if (!lAnalyser || !rAnalyser || !lData || !rData) return;

        if (!prevLeftRef.current) prevLeftRef.current = new Float64Array(BAR_COUNT);
        if (!prevRightRef.current) prevRightRef.current = new Float64Array(BAR_COUNT);
        const prevL = prevLeftRef.current;
        const prevR = prevRightRef.current;

        function render() {
          rafIdRef.current = requestAnimationFrame(render);
          if (!isPlayingRef.current) return;

          lAnalyser!.getByteTimeDomainData(lData!);
          rAnalyser!.getByteTimeDomainData(rData!);

          for (let i = 0; i < BAR_COUNT; i++) {
            const leftEl = leftBarRefs.current[i];
            const rightEl = rightBarRefs.current[i];
            if (!leftEl && !rightEl) continue;

            const start = i * BINS_PER_BAR;
            let lSum = 0;
            let rSum = 0;
            for (let j = 0; j < BINS_PER_BAR; j++) {
              lSum += Math.abs(lData![start + j] - 128);
              rSum += Math.abs(rData![start + j] - 128);
            }
            const lTarget = Math.pow(lSum / BINS_PER_BAR / 128, 0.7);
            const rTarget = Math.pow(rSum / BINS_PER_BAR / 128, 0.7);

            prevL[i] += (lTarget - prevL[i]) * LERP_FACTOR;
            prevR[i] += (rTarget - prevR[i]) * LERP_FACTOR;

            if (leftEl) leftEl.style.transform = `scaleY(${prevL[i]})`;
            if (rightEl) rightEl.style.transform = `scaleY(${prevR[i]})`;
          }
        }
        rafIdRef.current = requestAnimationFrame(render);
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isPlaying, webAudioReady]);

  const setLeftBarRef = (i: number) => (el: HTMLDivElement | null) => {
    leftBarRefs.current[i] = el;
  };
  const setRightBarRef = (i: number) => (el: HTMLDivElement | null) => {
    rightBarRefs.current[i] = el;
  };

  /* ---------- Fallback on failure ---------- */
  if (webAudioFailed) {
    return (
      <div className="audio-visualizer audio-visualizer--fallback" aria-hidden="true">
        <div className="audio-visualizer__placeholder">
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <div
              key={i}
              className="audio-visualizer__bar audio-visualizer__bar--static"
              style={{ backgroundColor: 'var(--text-color)' }}
            />
          ))}
        </div>
        <span className="audio-visualizer__fallback-text">Audio visualizer unavailable</span>
      </div>
    );
  }

  /* ---------- Normal / loading render ---------- */
  const isLoading = webAudioState === 'loading';

  return (
    <div
      className={`audio-visualizer audio-visualizer--stereo${isLoading ? ' audio-visualizer--loading' : ''}`}
      ref={containerRef}
      aria-hidden="true"
      style={{
        height: `${height}px`,
        opacity: isLoading ? 0 : 1,
        transition: isLoading ? 'none' : 'height 0.2s linear, opacity 0.6s ease-out',
      }}
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div key={i} className="audio-visualizer__col">
          {/* Left channel — grows upward from center */}
          <div
            ref={setLeftBarRef(i)}
            className="audio-visualizer__bar audio-visualizer__bar--left"
            style={{
              backgroundColor: 'var(--text-color)',
              transform: isLoading ? 'scaleY(0.08)' : 'scaleY(0)',
            }}
          />
          {/* Right channel — grows downward from center */}
          <div
            ref={setRightBarRef(i)}
            className="audio-visualizer__bar audio-visualizer__bar--right"
            style={{
              backgroundColor: 'var(--text-color)',
              transform: isLoading ? 'scaleY(0.08)' : 'scaleY(0)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
