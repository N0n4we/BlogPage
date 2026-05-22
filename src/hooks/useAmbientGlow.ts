import { useEffect, useRef, useCallback } from 'react';

interface GlowState {
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
}

const LERP_FACTOR = 0.06; // lower = more lag; 0.05–0.08 feels natural

export function useAmbientGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GlowState>({
    targetX: 50,
    targetY: 50,
    currentX: 50,
    currentY: 50,
  });
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    stateRef.current.targetX = (e.clientX / window.innerWidth) * 100;
    stateRef.current.targetY = (e.clientY / window.innerHeight) * 100;
  }, []);

  useEffect(() => {
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) return;

    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    const animate = () => {
      const state = stateRef.current;
      const el = glowRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Lerp toward target
      state.currentX += (state.targetX - state.currentX) * LERP_FACTOR;
      state.currentY += (state.targetY - state.currentY) * LERP_FACTOR;

      // Snap if close enough (avoids sub-pixel drift)
      if (Math.abs(state.currentX - state.targetX) < 0.01) state.currentX = state.targetX;
      if (Math.abs(state.currentY - state.targetY) < 0.01) state.currentY = state.targetY;

      el.style.setProperty('--glow-x', `${state.currentX}%`);
      el.style.setProperty('--glow-y', `${state.currentY}%`);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  return glowRef;
}
