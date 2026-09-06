import { useEffect, type RefObject } from 'react';
import {
  musicRhythm,
  type MusicGlitchOptions,
} from '../modules/musicRhythm';

type GlitchOptions = MusicGlitchOptions;

export function useGlitchEffect(
  containerRef: RefObject<HTMLElement | null>,
  options: GlitchOptions
): void {
  const {
    enabled,
    rhythmEnabled,
    paused = false,
    intensity,
    profile,
  } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    return musicRhythm.registerTarget(container);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    musicRhythm.updateTarget(container, {
      enabled,
      rhythmEnabled,
      paused,
      intensity,
      profile,
    });
  }, [containerRef, enabled, rhythmEnabled, paused, intensity, profile]);
}
