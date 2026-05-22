# PRD: Ambient Dynamic Glow

**Issue:** [#6 — Ambient dynamic glow](https://github.com/n0n4w3/BlogPage/issues/6)

**Status:** Ready for implementation

## Problem Statement

The blog's background is a uniform `#282828` (Gruvbox dark0) — a perfectly flat canvas. While the existing CRT overlay (#1) will add scanline and grain texture, and the hover ripple brings localized interactivity, the overall page still feels *static*. The dark void behind all content lacks depth, atmosphere, and visual warmth.

A subtle, cursor-following radial gradient — an "ambient glow" — would breathe life into the page. As the user moves their mouse, a warm, diffuse halo of Gruvbox yellow and muted red moves lazily behind the content, creating a sense of depth and atmosphere. The glow makes the page feel organic, like a softly lit physical space rather than a flat digital slab.

Without this effect, the page remains a uniform dark expanse. The glow bridges the gap between "minimalist dark theme" and "cozy, lived-in digital space" — adding warmth without sacrificing the Gruvbox identity.

## User Stories

| ID | User Story |
|----|-----------|
| US-1 | As a **reader**, I want the background to have subtle warmth and depth so the page feels alive rather than flat. |
| US-2 | As a **reader**, I want the glow to follow my cursor with a gentle lag — not teleport — so it feels organic and natural. |
| US-3 | As a **reader**, I want the glow to never interfere with text readability, link clicking, or any content interaction. |
| US-4 | As a **reader** on touch/mobile, I want the effect to gracefully disable so there's no phantom glow or wasted performance. |
| US-5 | As a **developer**, I want the implementation to use existing Gruvbox CSS custom properties and follow the project's component/hook patterns. |
| US-6 | As a **developer**, I want the glow to be GPU-composited and not cause layout thrashing or excessive paint invalidation. |

## Technical Design

### Architecture Overview

The ambient glow is implemented as a dedicated `<div id="ambient-glow">` element inserted as the first child of `<body>`, sitting below all page content via `z-index: -1`. On mousemove, CSS custom properties `--glow-x` and `--glow-y` are updated with smooth lerp (linear interpolation) in a `requestAnimationFrame` loop, feeding into a `radial-gradient` background on the glow element.

```
<div id="ambient-glow">
  (no children — purely a CSS background layer)
  ├── position: fixed
  ├── inset: 0
  ├── pointer-events: none
  ├── z-index: -1
  └── background: radial-gradient(
        circle at var(--glow-x) var(--glow-y),
        rgba(215, 153, 33, 0.08) 0%,      /* #d79921 warm yellow */
        rgba(181, 118, 20, 0.05) 40%,      /* #b57614 muted red */
        transparent 70%
      )
```

### Component: `AmbientGlow.tsx`

A new React component that owns the glow DOM element. It renders a single `<div>` and delegates cursor tracking + interpolation to the `useAmbientGlow` hook.

```tsx
// src/components/AmbientGlow.tsx
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
```

**Key constraints:**
- `aria-hidden="true"` — purely decorative, invisible to assistive technology
- Renders nothing visible — the glow is purely a CSS `background` effect on the element

### Hook: `useAmbientGlow.ts`

A new custom hook encapsulating the mousemove listener, lerp interpolation, and RAF loop. It returns a `ref` to attach to the glow `<div>`.

```typescript
// src/hooks/useAmbientGlow.ts
import { useEffect, useRef, useCallback } from 'react';

interface GlowState {
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
}

export function useAmbientGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GlowState>({
    targetX: 50,       // center of viewport in vw/vh units initially
    targetY: 50,
    currentX: 50,
    currentY: 50,
  });
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Convert to 0-100 range for CSS (percentage values for radial-gradient position)
    stateRef.current.targetX = (e.clientX / window.innerWidth) * 100;
    stateRef.current.targetY = (e.clientY / window.innerHeight) * 100;
  }, []);

  useEffect(() => {
    const LERP_FACTOR = 0.06; // lower = more lag; ~0.05-0.08 feels natural
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    if (isTouchDevice) return; // Disable entirely on touch devices

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
```

**Design decisions:**
- **Passive listener** — `{ passive: true }` tells the browser the handler won't call `preventDefault()`, enabling scroll optimizations
- **Lerp factor 0.06** — produces ~200ms effective lag at 60fps (16ms × ~12 frames to cover 50% of distance), which feels natural
- **0-100% range** — CSS `radial-gradient` positioning expects percentage values; using percentage rather than px means the glow adapts to any viewport size without recalculation
- **RAF loop** — decouples visual updates from mousemove event frequency (which can fire at 120Hz+), ensuring smooth, throttled 60fps updates
- **Touch disable** — `matchMedia('(pointer: coarse)')` prevents any listener setup on touch devices

### Placement in DOM

The glow `<div>` must be the **first child of `<body>`**, positioned before `<div id="root">`:

```html
<body>
  <div id="ambient-glow" aria-hidden="true"></div>
  <div id="root"></div>
  ...
</body>
```

This ensures:
1. Stacking context order — the glow sits at the bottom of `z-index` order among `position: fixed` elements
2. No React re-renders can affect its position relative to `#root`
3. It renders before any content, preventing paint-order flicker

Since React's `createRoot` renders into `#root`, the glow must be inserted in `src/main.tsx` using a portal or direct DOM insertion before the React render call. Alternatively, render it inside App but give it a fixed element at the top of the component tree.

**Recommended approach:** Insert via `src/main.tsx` by creating the element before React mounts:

```tsx
// src/main.tsx — approach A: direct DOM insertion
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

// Insert ambient glow as first child of <body>
const glowDiv = document.createElement('div');
glowDiv.id = 'ambient-glow';
glowDiv.setAttribute('aria-hidden', 'true');
document.body.prepend(glowDiv);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Alternative approach** (if preferred for React-managed lifecycle): Render `AmbientGlow` as a sibling outside Routes in `App.tsx`, and ensure it has `position: fixed` covering the full viewport. This is simpler but the element won't be the literal first `<body>` child — it will sit inside `<div id="root">`. This still works because `z-index: -1` and `position: fixed` place it behind everything:

```tsx
// src/App.tsx — approach B: React-managed
function App() {
  return (
    <BrowserRouter>
      <AmbientGlow />
      <Routes>
        <Route path="/" element={<BlogPage />} />
        <Route path="/:dateId" element={<BlogPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Recommendation:** Use **approach B** (React-managed, inside `App.tsx`) because:
- The glow hook uses refs and effects that naturally pair with React lifecycle
- Prevents raw DOM manipulation outside React's awareness
- Simpler SSR/SSG compatibility in future
- `z-index: -1` + `position: fixed` achieves the same visual result regardless of DOM position

### CSS Styling (`src/styles.css`)

```css
/* Ambient dynamic glow layer */
#ambient-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  background:
    radial-gradient(
      circle at var(--glow-x, 50%) var(--glow-y, 50%),
      rgba(215, 153, 33, 0.08) 0%,      /* Gruvbox #d79921 bright_yellow */
      rgba(215, 153, 33, 0.04) 25%,
      rgba(181, 118, 20, 0.05) 50%,      /* Gruvbox #b57614 neutral_yellow */
      transparent 70%
    );
  will-change: background;
  /* Prevent the gradient from being clipped on small viewports */
  min-width: 100vw;
  min-height: 100vh;
}
```

**Key implementation details:**
- `--glow-x` / `--glow-y` default to `50%` (center) when not yet set — provides a graceful initial state
- Glow size is ~70% of viewport diameter (the `transparent` cutoff at 70%)
- `will-change: background` hints the browser to promote to a compositing layer
- `rgba(215, 153, 33, ...)` — Gruvbox `#d79921` (bright_yellow) for the warm core
- `rgba(181, 118, 20, ...)` — Gruvbox `#b57614` (neutral_yellow) for the mid-gradient
- Attenuated opacities: 0.08 core → 0.05 mid → 0.0 at edge — barely perceptible, pure atmosphere

### Touch Device Disable

The hook already checks `matchMedia('(pointer: coarse)')` and skips listener/RAF setup entirely. On touch devices:
- No mousemove listener is registered
- No RAF loop runs
- The glow `<div>` sits inert with `--glow-x: 50%; --glow-y: 50%` (centered default)
- The centered glow is so faint (0.08 opacity at peak) it's effectively invisible — no phantom glow distraction

For additional safety, a CSS media query can reduce opacity to near-zero on touch devices:

```css
@media (pointer: coarse) {
  #ambient-glow {
    opacity: 0 !important;
  }
}
```

This covers edge cases where `matchMedia` might misreport.

### Gruvbox Color Palette

The glow uses two warm Gruvbox colors, pulled conceptually from the existing `:root` custom properties:

| Color | Hex | Usage | CSS Variable |
|-------|-----|-------|-------------|
| bright_yellow | `#d79921` | Core glow (center) | `--glow-color-primary` |
| neutral_yellow | `#b57614` | Mid-gradient (falloff) | `--glow-color-secondary` |

These colors already exist in the design system:
- `--section-title-color: #fabd2f` (bright_yellow, for section headers)
- `--button-text: #d79921` (bright_yellow_alt)

The chosen `#d79921` / `#b57614` pair provides warm amber tones that:
- Contrast beautifully with the cool `#83a598` (bright_blue) link color
- Complement the `#ebdbb2` (light1) text without overpowering it
- Create a natural "sunlight through a window" atmosphere against `#282828` (dark0) background

## Expanded Acceptance Criteria

### Visual

- [ ] AC-1: A warm, diffuse glow is visible behind all page content, centered near the cursor position
- [ ] AC-2: The glow spans approximately 50–70% of the viewport at its widest point
- [ ] AC-3: Glow colors use Gruvbox warm palette (yellow/amber tones) at low opacity
- [ ] AC-4: Glow does not wash out or discolor text or other page elements
- [ ] AC-5: Glow appears natural and atmosphere-like, not like a spotlight or harsh gradient
- [ ] AC-6: Glow is uniform across the full viewport height (no cutoff at page bottom in scrolling)

### Interaction

- [ ] AC-7: Glow follows the cursor with smooth, lazy interpolation (trails behind, does not teleport)
- [ ] AC-8: `pointer-events: none` — all clicks, drags, hovers, and text selection pass through
- [ ] AC-9: Glow does not interfere with the existing post ripple hover effect
- [ ] AC-10: Glow does not interfere with the CRT overlay or any future overlay
- [ ] AC-11: When the cursor is stationary for >3 seconds, the glow continues its natural trailing (eventually settling)

### Touch / Mobile

- [ ] AC-12: On touch devices, no mousemove listener is registered (verified via DevTools event listeners)
- [ ] AC-13: On touch devices, the glow element has effectively zero visual impact (centered, near-invisible)
- [ ] AC-14: On hybrid devices (touch + mouse, e.g., Surface), the glow activates only with mouse input

### Performance

- [ ] AC-15: No frame drops on 60Hz displays during mousemove + RAF loop (verify with DevTools Performance tab)
- [ ] AC-16: No layout thrashing — the glow element is `position: fixed` with `inset: 0`, never triggers layout
- [ ] AC-17: GPU-composited — `will-change: background` promotes glow to its own compositing layer
- [ ] AC-18: No forced reflows — CSS custom property updates via `element.style.setProperty()` only trigger paint, not layout
- [ ] AC-19: CPU idle when cursor is stationary (RAF loop runs once per frame but lerp converges and effectively stops moving)
- [ ] AC-20: Passive mousemove listener does not interfere with scroll performance

### Accessibility

- [ ] AC-21: `aria-hidden="true"` ensures screen readers ignore the element
- [ ] AC-22: No color contrast impact on any text (opacity is too low to affect contrast ratios)
- [ ] AC-23: `prefers-reduced-motion` — the glow is static even when disabled (no motion to reduce), but if the RAF loop can be detected as motion, consider disabling its animation:
  ```css
  @media (prefers-reduced-motion: reduce) {
    #ambient-glow {
      opacity: 0;
    }
  }
  ```

### Technical

- [ ] AC-24: CSS custom properties `--glow-x` and `--glow-y` are updated on the element via `element.style.setProperty()`
- [ ] AC-25: Default values `50% 50%` are used before any mousemove event fires
- [ ] AC-26: Event listener and RAF are cleaned up on component unmount (no memory leaks)
- [ ] AC-27: Component renders in React StrictMode without double-mount issues

## Implementation Plan

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/AmbientGlow.tsx` | Glow component — renders `<div id="ambient-glow">` with ref from hook |
| `src/hooks/useAmbientGlow.ts` | Custom hook — mousemove listener, lerp interpolation via RAF, touch disable, ref attachment |

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Import and render `<AmbientGlow />` as first child inside `<BrowserRouter>` but before `<Routes>` |
| `src/styles.css` | Add `#ambient-glow` style block with `position: fixed`, `pointer-events: none`, `z-index: -1`, `radial-gradient` using `--glow-x`/`--glow-y`, `will-change: background`, and `@media (pointer: coarse)` disable |

### Step-by-Step

1. **Create `src/hooks/useAmbientGlow.ts`** — Write the hook with:
   - `useRef` for the div, state (target/current), and RAF ID
   - `useCallback` for `handleMouseMove` converting `clientX/Y` to 0-100% values
   - `useEffect` checking `matchMedia('(pointer: coarse)')`, registering passive mousemove listener, starting RAF loop, returning cleanup

2. **Create `src/components/AmbientGlow.tsx`** — Simple wrapper component that calls `useAmbientGlow()` and returns `<div id="ambient-glow" ref={glowRef} aria-hidden="true" />`

3. **Modify `src/App.tsx`** — Import `AmbientGlow` and render it before `<Routes>`:
   ```tsx
   import AmbientGlow from './components/AmbientGlow';
   
   function App() {
     return (
       <BrowserRouter>
         <AmbientGlow />
         <Routes>
           <Route path="/" element={<BlogPage />} />
           <Route path="/:dateId" element={<BlogPage />} />
         </Routes>
       </BrowserRouter>
     );
   }
   ```

4. **Add CSS to `src/styles.css`** — Append the `#ambient-glow` rule block with:
   - Fixed positioning covering full viewport
   - `pointer-events: none; z-index: -1`
   - `radial-gradient` using `var(--glow-x, 50%)` / `var(--glow-y, 50%)`
   - Gruvbox colors `rgba(215, 153, 33, ...)` and `rgba(181, 118, 20, ...)`
   - `will-change: background`
   - Touch device override via `@media (pointer: coarse) { opacity: 0 }`
   - Optional `prefers-reduced-motion` disable

5. **Performance audit** — Verify:
   - No layout thrashing (check for forced reflows in DevTools)
   - RAF runs at display refresh rate (60fps)
   - Mousemove listener is passive
   - Glow compositing layer exists (Layers tab in DevTools)
   - No memory leaks on unmount (component unmount/remount in StrictMode)

### Code Review Checklist

- [ ] `useEffect` in `useAmbientGlow` returns cleanup that removes listener and cancels RAF
- [ ] `handleMouseMove` is wrapped in `useCallback` with stable identity
- [ ] `{ passive: true }` option on `addEventListener('mousemove', ...)`
- [ ] Touch detection uses `matchMedia('(pointer: coarse)')` — not user-agent sniffing
- [ ] CSS custom properties use `var(--glow-x, 50%)` with fallback values
- [ ] Glow div has `aria-hidden="true"`
- [ ] Lerp factor is configurable (consider making it a constant or prop)
- [ ] Gradient colors use `rgba()` with Gruvbox hex values, not `#hex` (for opacity control)
- [ ] No `overflow: hidden` on any ancestor that might clip the fixed-position glow
- [ ] CSS `@media (pointer: coarse)` disable present for safety

## Risks and Dependencies

### Performance

| Risk | Severity | Mitigation |
|------|----------|------------|
| Mousemove fires at 120Hz+ on high-refresh displays, overwhelming RAF | Low | RAF throttles to display refresh rate regardless of event frequency; passive listener avoids scroll blocking |
| Gradient background paint is expensive on mobile GPU | Low | Touch devices are disabled entirely via `pointer: coarse`; desktop GPUs handle single gradient easily |
| `will-change: background` creates excess GPU memory | Low | Single element with one gradient — negligible memory; `will-change` is scoped to this one element |
| Lerp RAF loop runs continuously even when cursor is stationary | Low | Lerp converges to target within ~20 frames (300ms); once converged, `style.setProperty` writes the same value each frame (browser skips redundant paints) — effectively no-cost |

### Z-index Layering

The glow must sit **behind** all content. Current and planned z-index values:

| Element | z-index | Notes |
|---------|---------|-------|
| `#ambient-glow` (glow) | `-1` | Behind everything |
| Post `::before` (ripple) | `-1` | Also behind content — tie with glow; both at `-1` stack in DOM order (glow first, ripple after, so ripple is on top) |
| Default content | `auto` | Standard flow |
| `body::after` (CRT overlay, #1) | `9998` | Above content |
| Custom cursor / modals (future) | `9999` | Top layer |

**Risk:** If another element also uses `z-index: -1`, stacking order depends on DOM position. The glow div is rendered before `<Routes>` in `App.tsx`, so it will be an earlier DOM sibling — other `z-index: -1` elements (from deeper components) will stack on top. This is the desired behavior (glow should be the absolute bottom layer).

**Verification:** After implementation, check that:
- Glow is visible behind posts, header, footer, and music player
- Glow does not appear on top of any content (including text, images, APlayer controls)
- Post ripple (`post::before`, also `z-index: -1`) correctly overlays the glow (ripple should be slightly "in front" of the glow)

### Lerp Configuration

| Risk | Severity | Mitigation |
|------|----------|------------|
| Lerp factor 0.06 feels too slow or too fast | Low | Make `LERP_FACTOR` a module-level constant with comment documenting range; adjust if needed during QA |
| Glow snaps to center on page load / route navigation | Low | Default `--glow-x: 50%; --glow-y: 50%` in CSS — any movement starts from center; no visible snap because lerp moves smoothly from center to cursor |

### Mobile / Touch Compatibility

| Risk | Severity | Mitigation |
|------|----------|------------|
| `matchMedia('(pointer: coarse)')` returns false on some hybrid devices | Low | CSS `@media (pointer: coarse) { opacity: 0 !important; }` provides double protection |
| Safari iOS doesn't support `pointer: coarse` media query | None | Supported since iOS 10+; current project targets modern browsers only |

### Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| `requestAnimationFrame` | Browser API | Supported in all modern browsers |
| `matchMedia('(pointer: coarse)')` | CSSOM API | Supported in all modern browsers; iOS 10+, Chrome/Edge 27+, Firefox 25+ |
| CSS custom properties (via `style.setProperty`) | CSSOM | Supported in all modern browsers |
| `radial-gradient` | CSS | Supported in all modern browsers |

**No internal dependencies** — this feature is fully self-contained. No conflicts with existing post ripple, glitch effects, or music player. Works independently of the CRT overlay (#1), custom cursor (#2), and scroll animations (#5).

### Accessibility

The glow is purely decorative:
- `aria-hidden="true"` removes it from the accessibility tree
- Opacity is too low to affect text contrast ratios
- No motion is user-facing (cursor tracking is invisible to keyboard/screen-reader users)
- `prefers-reduced-motion: reduce` can disable the glow entirely if needed

## Glossary

| Term | Definition |
|------|-----------|
| **Lerp** | Linear interpolation — `current += (target - current) * factor` — smooths movement over time |
| **RAF** | `requestAnimationFrame` — browser API that schedules a callback before the next paint, synced to display refresh rate |
| **Passive listener** | `addEventListener` option `{ passive: true }` — tells the browser the handler won't call `preventDefault()`, allowing scroll optimizations |
| **Radial gradient** | CSS `radial-gradient()` — a gradient that radiates from a center point outward in a circle or ellipse |
| **CSS custom property** | A `--var` property set on an element via `element.style.setProperty('--name', value)` — enables dynamic style updates without inline styles or class toggling |
| **Compositing layer** | A GPU-accelerated rendering layer in the browser's paint pipeline; created by `will-change`, `position: fixed`, or 3D transforms |

## Future Considerations

- **Dual glow** — Two overlapping gradients (warm yellow + cool blue) for additional depth and atmospheric variety
- **Size modulation** — Vary the gradient radius based on cursor velocity (faster = larger glow) for dynamic feel
- **Time-of-day tint** — Subtle color shift based on the visitor's local time (warmer in evening, cooler in day)
- **Scroll-based offset** — Add a slow vertical oscillation tied to scroll position so the glow has gentle ambient motion even without mouse input
- **Configurable intensity** — Expose `--glow-intensity` as a CSS custom property for user theming or preference persistence
- **Transition on page load** — Fade in the glow over 1-2 seconds so it doesn't flash into existence
