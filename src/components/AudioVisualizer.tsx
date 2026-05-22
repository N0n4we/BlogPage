import { useEffect, useRef } from 'react';

/* ---------- Gruvbox bar colors — warm-to-cool left→right ---------- */
const GRUVBOX_BAR_COLORS = [
  '#fb4934', // bright_red      — bass (left)
  '#fe8019', // bright_orange
  '#fabd2f', // bright_yellow
  '#b8bb26', // bright_green
  '#8ec07c', // bright_aqua
  '#83a598', // bright_blue     — mids
  '#d3869b', // bright_purple
  '#83a598', // bright_blue     — treble (right)
];

const BAR_COUNT = 32;
const FFT_SIZE = 256; // → 128 frequency bins
const SMOOTHING_TIME_CONSTANT = 0.8;
const BINS_PER_BAR = FFT_SIZE / 2 / BAR_COUNT; // 4 bins per bar

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
}

/**
 * AudioVisualizer — Web‑Audio‑driven frequency‑bar visualizer.
 *
 * Connects to the APlayer <audio> element via createMediaElementSource,
 * pipes through an AnalyserNode, and renders 32 CSS <div> bars animated
 * via transform: scaleY() in a requestAnimationFrame loop.
 */
export default function AudioVisualizer({ audioElement, isPlaying }: AudioVisualizerProps) {
  /* ---------- mutable refs (not state — no re‑renders per frame) ---------- */
  const containerRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafIdRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const isPlayingRef = useRef(false);
  const supportsWebAudio = useRef(true);

  // Keep playing ref in sync so the RAF closure always sees the latest value
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  /* ---------- AudioContext setup / teardown ---------- */
  useEffect(() => {
    // Check Web Audio API support
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      supportsWebAudio.current = false;
      return;
    }

    if (!audioElement) return;

    const ctx = new AudioCtx();
    audioContextRef.current = ctx;

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      analyserRef.current = analyser;

      const source = ctx.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(ctx.destination); // pass‑through — audio still plays via speakers
      sourceRef.current = source;

      const bufferLength = analyser.frequencyBinCount; // 128
      dataArrayRef.current = new Uint8Array(new ArrayBuffer(bufferLength));
    } catch (err) {
      console.warn('[AudioVisualizer] createMediaElementSource failed — audio element already connected?', err);
      supportsWebAudio.current = false;
      // Clean up partial context
      ctx.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    }

    return () => {
      // Cancel animation loop
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      // Disconnect nodes before closing context
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [audioElement]);

  /* ---------- RAF render loop ---------- */
  useEffect(() => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!barRefs.current.length || !analyser || !dataArray) return;

    const an = analyser;
    const da = dataArray;

    function render() {
      rafIdRef.current = requestAnimationFrame(render);

      if (!isPlayingRef.current) return; // freeze bars on pause

      an.getByteFrequencyData(da);

      // Group 128 bins → 32 bars (4 bins each)
      for (let i = 0; i < BAR_COUNT; i++) {
        const barEl = barRefs.current[i];
        if (!barEl) continue;

        const start = i * BINS_PER_BAR;
        let sum = 0;
        for (let j = 0; j < BINS_PER_BAR; j++) {
          sum += da[start + j];
        }
        const avg = sum / BINS_PER_BAR;
        // Non‑linear scaling to emphasise mids / highs
        const scaled = Math.pow(avg / 255, 0.6);

        barEl.style.transform = `scaleY(${scaled})`;
      }
    }

    // Start the loop
    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, []); // runs once when analyser is set up; barRefs populated after first render

  /* ---------- Visibility change — pause RAF when tab hidden ---------- */
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = 0;
        }
      } else if (isPlaying && supportsWebAudio.current) {
        // Restart the RAF loop
        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;
        if (!analyser || !dataArray) return;
        const an = analyser;
        const da = dataArray;

        function render() {
          rafIdRef.current = requestAnimationFrame(render);
          if (!isPlayingRef.current) return;

          an.getByteFrequencyData(da);
          for (let i = 0; i < BAR_COUNT; i++) {
            const barEl = barRefs.current[i];
            if (!barEl) continue;
            const start = i * BINS_PER_BAR;
            let sum = 0;
            for (let j = 0; j < BINS_PER_BAR; j++) sum += da[start + j];
            const scaled = Math.pow(sum / BINS_PER_BAR / 255, 0.6);
            barEl.style.transform = `scaleY(${scaled})`;
          }
        }
        rafIdRef.current = requestAnimationFrame(render);
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isPlaying]);

  /* ---------- Assign bar refs after first paint ---------- */
  // We use a callback ref pattern to collect all bar divs
  const setBarRef = (i: number) => (el: HTMLDivElement | null) => {
    barRefs.current[i] = el;
  };

  /* ---------- Reduced‑motion / no‑AudioContext fallback ---------- */
  // If Web Audio is unavailable, render a static placeholder
  if (!supportsWebAudio.current) {
    return (
      <div className="audio-visualizer audio-visualizer--fallback" aria-hidden="true">
        <div className="audio-visualizer__placeholder">
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <div
              key={i}
              className="audio-visualizer__bar audio-visualizer__bar--static"
              style={{
                backgroundColor: GRUVBOX_BAR_COLORS[i % GRUVBOX_BAR_COLORS.length],
              }}
            />
          ))}
        </div>
        <span className="audio-visualizer__fallback-text">Audio visualizer unavailable</span>
      </div>
    );
  }

  return (
    <div className="audio-visualizer" ref={containerRef} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={setBarRef(i)}
          className="audio-visualizer__bar"
          style={{
            backgroundColor: GRUVBOX_BAR_COLORS[i % GRUVBOX_BAR_COLORS.length],
            transformOrigin: 'bottom center',
          }}
        />
      ))}
    </div>
  );
}
