import { useEffect, useRef, useCallback, type RefObject } from 'react';

// ---- Configuration ----
const LERP_FACTOR = 0.18;
const TRAIL_MAX = 20;
const CURSOR_SIZE = 4; // radius in CSS px
const HOVER_SCALE = 1.8;
const BURST_PARTICLE_COUNT = 10;
const BURST_LIFETIME = 450; // ms
const HOVER_EVERY_N_FRAMES = 3;

// Gruvbox colors
const CURSOR_COLOR = '#d79921'; // bright_yellow
const HOVER_COLOR = '#83a598'; // bright_blue
const BURST_COLORS = ['#d79921', '#b57614', '#fabd2f', '#fe8019'];

// Interactive element selectors
const HOVER_SELECTORS = 'a, button, [role="button"], .post, [data-cursor-hover]';

// ---- Types ----
interface Particle {
  x: number;
  y: number;
  life: number; // 0..1, decays to 0
  vx: number;
  vy: number;
  colorR: number;
  colorG: number;
  colorB: number;
  size: number;
}

interface TrailPoint {
  x: number;
  y: number;
}

interface State {
  mouseX: number;
  mouseY: number;
  cursorX: number;
  cursorY: number;
  isHovering: boolean;
  trail: TrailPoint[];
  burstParticles: Particle[];
  frameCount: number;
}

/** Parse hex color to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function useCustomCursor(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const stateRef = useRef<State>({
    mouseX: 0,
    mouseY: 0,
    cursorX: 0,
    cursorY: 0,
    isHovering: false,
    trail: [],
    burstParticles: [],
    frameCount: 0,
  });

  const rafRef = useRef<number>(0);
  const hiddenRef = useRef(false);
  const prefersReducedMotionRef = useRef(false);
  const isPointerFine = useRef(false);

  // ---- Click handler ----
  const handleClick = useCallback((e: MouseEvent) => {
    const s = stateRef.current;
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / BURST_PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
      const speed = 60 + Math.random() * 120;
      const color = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
      const [r, g, b] = hexToRgb(color);
      s.burstParticles.push({
        x: e.clientX,
        y: e.clientY,
        life: 1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        colorR: r,
        colorG: g,
        colorB: b,
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }, []);

  // ---- Resize handler ----
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check for fine pointer
    const mq = window.matchMedia('(pointer: fine)');
    isPointerFine.current = mq.matches;
    if (!isPointerFine.current) return; // touch device — no custom cursor

    // Check reduced motion
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = rmq.matches;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set initial canvas size
    handleResize();

    // Hide default cursor
    document.body.style.cursor = 'none';

    // Init state
    const s = stateRef.current;
    s.mouseX = window.innerWidth / 2;
    s.mouseY = window.innerHeight / 2;
    s.cursorX = s.mouseX;
    s.cursorY = s.mouseY;

    // ---- Event handlers ----
    const onMouseMove = (e: MouseEvent) => {
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
    };

    const onTouchStart = () => {
      document.body.style.cursor = '';
    };

    const onTouchEnd = () => {
      if (isPointerFine.current) {
        document.body.style.cursor = 'none';
      }
    };

    const onVisibilityChange = () => {
      hiddenRef.current = document.hidden;
    };

    const onPointerChange = (e: MediaQueryListEvent) => {
      isPointerFine.current = e.matches;
      if (e.matches) {
        document.body.style.cursor = 'none';
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(render);
        }
      } else {
        document.body.style.cursor = '';
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      }
    };

    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };

    // ---- Hover detection ----
    const checkHover = () => {
      try {
        const targets = document.elementsFromPoint(s.cursorX, s.cursorY);
        const hovering = targets.some((el) => {
          let current: Element | null = el;
          while (current) {
            if (current.matches?.(HOVER_SELECTORS)) return true;
            current = current.parentElement;
          }
          return false;
        });
        s.isHovering = hovering;
      } catch {
        // elementsFromPoint not available — fall back to elementFromPoint
        try {
          const el = document.elementFromPoint(s.cursorX, s.cursorY);
          if (el) {
            let current: Element | null = el;
            while (current) {
              if (current.matches?.(HOVER_SELECTORS)) {
                s.isHovering = true;
                return;
              }
              current = current.parentElement;
            }
          }
          s.isHovering = false;
        } catch {
          s.isHovering = false;
        }
      }
    };

    // ---- Render loop ----
    const render = () => {
      if (hiddenRef.current) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;

      // Smooth cursor position (lerp toward real mouse)
      s.cursorX += (s.mouseX - s.cursorX) * LERP_FACTOR;
      s.cursorY += (s.mouseY - s.cursorY) * LERP_FACTOR;

      // Trail
      s.trail.push({ x: s.cursorX, y: s.cursorY });
      while (s.trail.length > TRAIL_MAX) s.trail.shift();

      // Hover detection (throttled)
      s.frameCount++;
      if (s.frameCount % HOVER_EVERY_N_FRAMES === 0) {
        checkHover();
      }

      const reducedMotion = prefersReducedMotionRef.current;

      // ---- Draw ----
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // -- Trail particles --
      if (!reducedMotion) {
        for (let i = 0; i < s.trail.length; i++) {
          const t = s.trail[i];
          const alpha = (i / s.trail.length) * 0.5;
          const radius = (i / s.trail.length) * (CURSOR_SIZE * 1.2);
          ctx.beginPath();
          ctx.arc(t.x * dpr, t.y * dpr, radius * dpr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(215,153,33,${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      // -- Burst particles --
      if (!reducedMotion) {
        const dt = 16.67; // approximate ms per frame at 60fps
        for (let i = s.burstParticles.length - 1; i >= 0; i--) {
          const p = s.burstParticles[i];
          p.life -= dt / BURST_LIFETIME;
          if (p.life <= 0) {
            s.burstParticles.splice(i, 1);
            continue;
          }
          p.x += p.vx * (dt / 1000);
          p.y += p.vy * (dt / 1000);
          const alpha = p.life;
          const size = p.size * p.life;
          ctx.beginPath();
          ctx.arc(p.x * dpr, p.y * dpr, size * dpr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.colorR},${p.colorG},${p.colorB},${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      // -- Cursor dot --
      const cx = s.cursorX * dpr;
      const cy = s.cursorY * dpr;
      const scale = s.isHovering ? HOVER_SCALE : 1;
      const radius = CURSOR_SIZE * scale * dpr;
      const color = s.isHovering ? HOVER_COLOR : CURSOR_COLOR;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // -- Cursor ring --
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 * dpr;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(render);
    };

    // ---- Start ----
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('click', handleClick);
    window.addEventListener('resize', handleResize);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    document.addEventListener('visibilitychange', onVisibilityChange);
    mq.addEventListener('change', onPointerChange);
    rmq.addEventListener('change', onReducedMotionChange);

    rafRef.current = requestAnimationFrame(render);

    // ---- Cleanup ----
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      mq.removeEventListener('change', onPointerChange);
      rmq.removeEventListener('change', onReducedMotionChange);
      document.body.style.cursor = '';

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [canvasRef, handleClick, handleResize]);
}
