import { useRef } from 'react';
import { useCustomCursor } from '../hooks/useCustomCursor';

export default function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCustomCursor(canvasRef);
  return <canvas ref={canvasRef} className="custom-cursor" aria-hidden="true" />;
}
