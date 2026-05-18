import { useEffect, useRef, type RefObject } from 'react';
import {
  walkTextNodes,
  applyBlackout,
  applyGlitchChars,
  restoreGlitchSpans,
  removeSomeGlitchSpans,
} from '../utils/glitch';

interface GlitchOptions {
  enabled: boolean;
  // When true, freeze cycling without touching DOM. Used to preserve glitch
  // state during the post collapse transition so the user never sees a
  // mid-cycle "plain text" frame.
  paused?: boolean;
  intensity: 'light' | 'heavy';
}

const HEAVY = {
  actionProbability: 0.4,
  removeProbability: 0.35,
  blackoutRatio: 0.5,
  intervalMin: 50,
  intervalMax: 200,
  maxGlitchLength: 8,
};

const LIGHT = {
  actionProbability: 0.1,
  removeProbability: 0.25,
  blackoutRatio: 0.8,
  intervalMin: 200,
  intervalMax: 600,
  maxGlitchLength: 3,
};

export function useGlitchEffect(
  containerRef: RefObject<HTMLElement | null>,
  options: GlitchOptions
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    // Fully disabled (no content / error): clear timer and restore DOM.
    if (!options.enabled || !container) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (container) {
        restoreGlitchSpans(container);
      }
      return;
    }

    // Paused: freeze cycling but DO NOT restore DOM. Glitch spans stay
    // exactly where they were so the collapse fade-out is visually continuous.
    if (options.paused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const config = options.intensity === 'heavy' ? HEAVY : LIGHT;

    function runCycle(): void {
      if (!container) return;

      // 1. Incrementally remove some existing glitches (rotate them out).
      removeSomeGlitchSpans(container, config.removeProbability);

      // 2. Apply new glitches to plain text (walkTextNodes skips nodes
      //    inside existing glitch spans, so glitches don't nest).
      walkTextNodes(container, (textNode) => {
        if (Math.random() >= config.actionProbability) return;

        const text = textNode.textContent || '';
        if (text.length === 0) return;
        // 跳过纯空白文本节点（标签间的换行/缩进），
        // 否则 glitch 字符会混入这些空白区域产生多余的"换行"
        if (text.trim().length === 0) return;

        const glitchLen = Math.min(
          Math.ceil(Math.random() * config.maxGlitchLength),
          text.length
        );
        const start = Math.floor(
          Math.random() * (text.length - glitchLen + 1)
        );

        if (Math.random() < config.blackoutRatio) {
          applyBlackout(textNode, start, glitchLen);
        } else {
          applyGlitchChars(textNode, start, glitchLen);
        }
      });

      const delay =
        config.intervalMin +
        Math.random() * (config.intervalMax - config.intervalMin);
      timerRef.current = setTimeout(runCycle, delay);
    }

    timerRef.current = setTimeout(runCycle, 0);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [options.enabled, options.paused, options.intensity, containerRef]);
}
