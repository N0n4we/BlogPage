import { useAmbientGlow } from '../hooks/useAmbientGlow';

export default function AmbientGlow() {
  const glowRef = useAmbientGlow();

  return (
    <div
      id="ambient-glow"
      ref={glowRef}
      aria-hidden="true"
    />
  );
}
