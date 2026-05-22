# PRD: Custom Cursor with Magnetic Trail

- **Issue:** [#2 — Custom cursor with magnetic trail](https://github.com/story-bot/BlogPage/issues/2)
- **Status:** Draft
- **Labels:** `ready-for-agent`

---

## Problem Statement

The blog site currently uses the platform's default browser cursor (typically a standard arrow pointer) across all interactive surfaces. This default cursor feels generic and breaks immersion — the site already invests heavily in visual atmosphere via a Gruvbox dark theme, CRT-inspired glitch effects, radial hover ripples, and bespoke typography, but the cursor remains visually disconnected from this aesthetic.

A custom cursor with a trailing particle effect would:
- Reinforce the blog's retro/glitch identity by replacing the generic arrow with a styled cursor
- Add perceived polish and "wow factor" on first visit
- Create a cohesive visual language where the cursor feels like a native part of the UI
- Improve affordance feedback — the cursor can morph or scale over interactive elements, making links and buttons feel responsive without relying solely on CSS `:hover`

---

## User Stories

| ID | User Story |
|----|------------|
| US1 | As a visitor, I want the cursor to be a styled dot or ring instead of the default arrow so the site feels more polished and cohesive. |
| US2 | As a visitor, I want a short trail of particles to follow my cursor so the interaction feels fluid and playful. |
| US3 | As a visitor, I want the cursor to scale up or morph when hovering over links, buttons, and post cards so I get clear visual feedback on what's interactive. |
| US4 | As a visitor, I want a small burst animation when I click so the interaction feels responsive and satisfying. |
| US5 | As a mobile visitor, I want the default cursor to behave normally (no custom cursor) since touch devices have no persistent pointer. |
| US6 | As a developer, I want the custom cursor to not interfere with the existing post hover ripple (the `::before` radial expansion) so both effects can coexist. |

---

## Technical Design

### Architecture Overview

The custom cursor will be implemented as a **full-viewport `<canvas>` overlay** positioned above all page content but with `pointer-events: none` to pass all mouse/touch/click events through to the underlying DOM. A React hook (`useCustomCursor`) will manage the animation loop, particle system, and hover detection, while a React component (`CustomCursor`) will own the `<canvas>` element.

### Layer Layout (z-index)

```
z-index: 1000+    CustomCursor <canvas> overlay (pointer-events: none)
z-index: 1-999     Page content (posts, header, footer, etc.)
z-index: 0         Ambient glow (future #6) / background
z-index: -1        Post ::before ripple pseudoelement
```

The canvas must sit **above** all interactive content so the cursor is always visible, but `pointer-events: none` ensures it never blocks clicks or hovers on underlying elements.

### Key Components

#### 1. `CustomCursor.tsx` — React Component

- Creates a `<canvas>` element filling the viewport (`100vw × 100vh`, `position: fixed`, `top: 0`, `left: 0`)
- Applies `pointer-events: none` and a high `z-index` (e.g., `z-index: 9999`)
- Receives canvas ref from `useCustomCursor` hook
- Renders conditionally — only mounts on devices with a fine pointer (mouse)

```tsx
// Conceptual structure
function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCustomCursor(canvasRef);
  return <canvas ref={canvasRef} className="custom-cursor" />;
}
```

#### 2. `useCustomCursor.ts` — React Hook

Central animation and interaction logic. Manages:

**Canvas setup and render loop**
- Initializes canvas 2D context
- Runs a `requestAnimationFrame` loop that:
  1. Clears the canvas
  2. Updates cursor position (lerp/smooth follow)
  3. Updates and renders particle trail (position history)
  4. Renders the cursor dot/ring
  5. Checks for hover state changes via `document.elementsFromPoint()`
  6. Renders click burst if active
  7. Schedules next frame

**Cursor rendering**
- **Default state:** Circular dot (~8px diameter) or ring outline in Gruvbox `#d79921` (bright yellow)
- **Hover state:** Scale up 1.5–2×, optionally change to ring or add glow, tint toward Gruvbox `#83a598` (blue)
- **Click state:** Ring expands outward and fades in ~300ms burst animation
- Smooth interpolation with lerp (0.15–0.25 factor) so the cursor trails slightly behind the real mouse, creating a magnetic/organic feel

**Particle trail system**
- Maintains a rolling array of the last 15–25 cursor positions
- Each frame, renders particles at recent positions with:
  - Decreasing opacity (alpha from 0.6 → 0)
  - Decreasing size (radius from 3px → 0px)
  - Gruvbox-compatible colors: yellow `#d79921` fading to transparent
- Particles are pure canvas draws — no DOM nodes

**Hover detection via `document.elementsFromPoint()`**
- Each frame (or throttled every 2–3 frames), calls `document.elementsFromPoint(cursorX, cursorY)`
- Checks if any returned element matches interactive selectors:
  - `a`, `button`, `[role="button"]`
  - `.post` (post card articles)
  - Any element with `data-cursor-hover` attribute (extensibility hook)
- Updates internal `isHovering` state, which the render loop uses to:
  - Scale cursor up
  - Increase particle emission rate
  - Optionally change cursor color/style

**Click burst animation**
- Listens to `click` events on `document` (which pass through the canvas since `pointer-events: none`)
- On click, spawns 8–12 particles radiating outward from click position with:
  - Random velocity in all directions
  - Gruvbox warm colors (`#d79921`, `#b57614`, `#fabd2f`)
  - Decay over 300–500ms via alpha fade
- Rendered within the same `requestAnimationFrame` loop as the trail

**Touch fallback via `matchMedia('(pointer: fine)')`**
- On mount, checks `window.matchMedia('(pointer: fine)').matches`
- If `false` (touch-only device), the hook does NOT start the render loop and optionally unmounts the canvas entirely
- Uses `change` event listener so if a fine-pointer device is later connected (e.g., Bluetooth mouse on iPad), the cursor reactivates

```typescript
// Conceptual structure
function useCustomCursor(canvasRef: RefObject<HTMLCanvasElement | null>) {
  // 1. Check pointer type — bail if touch
  // 2. Set up canvas context (accounting for devicePixelRatio)
  // 3. Start requestAnimationFrame loop
  // 4. Track mousemove, click events on document
  // 5. Track window resize for canvas dimensions
  // 6. Clean up on unmount
}
```

#### 3. Integration in `App.tsx`

`CustomCursor` should be rendered at the top level of the app, inside `<BrowserRouter>` so it covers all routes:

```tsx
function App() {
  return (
    <BrowserRouter>
      <CustomCursor />
      <Routes>
        <Route path="/" element={<BlogPage />} />
        <Route path="/:dateId" element={<BlogPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Performance Considerations

- **Canvas compositing:** The canvas should use `will-change: transform` or be promoted to its own compositor layer via CSS (e.g., `transform: translateZ(0)`) to avoid painting on the main thread
- **Device pixel ratio:** The canvas internal resolution must be multiplied by `window.devicePixelRatio` and scaled via CSS `width`/`height` vs canvas `width`/`height` to look crisp on Retina displays
- **Particle count limits:** Cap trail particles at 25 and burst particles at 12 to prevent performance degradation over time
- **RAF throttling:** Skip hover detection (`elementsFromPoint`) every 2–3 frames since it's a synchronous DOM API call
- **Cleanup:** Cancel `requestAnimationFrame` and remove all event listeners on unmount

### CSS Styling

```css
.custom-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
  /* Promote to compositor layer */
  transform: translateZ(0);
  will-change: transform;
}
```

---

## Expanded Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC1 | Default browser cursor is hidden and replaced by custom dot/ring on desktop | Visual inspection: no arrow cursor visible on `<body>` |
| AC2 | Trail particles follow cursor movement and fade out within ~1s | Visual inspection: smooth decaying trail behind cursor |
| AC3 | Cursor scales up (1.5–2×) when hovering over links, buttons, and `.post` cards | Visual inspection: cursor enlarges on hover over `a`, `button`, post cards |
| AC4 | Click burst animation (8–12 particles radiating outward) triggers on each click | Visual inspection: burst on mouse click anywhere in viewport |
| AC5 | Custom cursor is entirely absent on touch devices (no custom cursor visible) | Test with Chrome DevTools device emulation; check `pointer: fine` media query |
| AC6 | No jank, stutter, or frame drops during normal scrolling and browsing | Record performance via Chrome DevTools Performance tab; check main thread frames |
| AC7 | Custom cursor does not block clicks on any interactive elements | Verify links, buttons, post toggles, APlayer controls all work normally |
| AC8 | Cursor works correctly when window is resized | Resize from small to large; cursor should remain properly positioned |
| AC9 | Cursor works correctly at different device pixel ratios (1x, 2x, 3x) | Check on Retina and non-Retina displays; cursor should not appear blurry |
| AC10 | `prefers-reduced-motion` media query respected — no particle animation if user prefers reduced motion | Set `prefers-reduced-motion: reduce` in DevTools; cursor should be a static dot |
| AC11 | Cursor deactivates when the browser tab is backgrounded (Page Visibility API) | Switch tabs, return; cursor should resume smoothly without backlog of frames |

---

## Implementation Plan

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/CustomCursor.tsx` | React component that renders the `<canvas>` element and calls `useCustomCursor` |
| `src/hooks/useCustomCursor.ts` | Custom hook managing the full animation loop, particle system, event listeners, and touch fallback |

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Import and render `<CustomCursor />` inside `<BrowserRouter>` above routes |
| `src/styles.css` | Add `.custom-cursor` CSS class with positioning, `pointer-events: none`, z-index, and compositor promotion |

### Implementation Steps

1. **Create `src/hooks/useCustomCursor.ts`**
   - Implement pointer-fine detection via `matchMedia('(pointer: fine)')`
   - Set up canvas context with device-pixel-ratio awareness
   - Implement `requestAnimationFrame` render loop with:
     - Mouse position tracking (smoothed with lerp)
     - Particle trail system (position history array)
     - Cursor rendering (dot/ring with hover scaling)
     - Click burst animation
   - Implement hover detection via `document.elementsFromPoint()` (throttled)
   - Add `resize` event listener for canvas dimensions
   - Add Page Visibility API listener to pause when backgrounded
   - Add `prefers-reduced-motion` check
   - Clean up all listeners and RAF on unmount

2. **Create `src/components/CustomCursor.tsx`**
   - Create `<canvas>` ref
   - Call `useCustomCursor(canvasRef)`
   - Return `<canvas className="custom-cursor" />`

3. **Modify `src/styles.css`**
   - Add `.custom-cursor` rules as specified

4. **Modify `src/App.tsx`**
   - Import `CustomCursor` from `./components/CustomCursor`
   - Render `<CustomCursor />` as first child inside `<BrowserRouter>`

5. **Manual testing**
   - Smoke test on desktop browser
   - Test with DevTools device emulation (touch)
   - Test with `prefers-reduced-motion: reduce`
   - Performance profile check

---

## Risks and Dependencies

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Conflict with existing post ripple** — The `::before` ripple on `.post` cards uses a separate transform (`scale()`). The custom cursor canvas sits above, so no DOM conflict, but visual overlap between cursor and ripple could look busy. | Medium | Keep cursor small/subtle. Avoid using the same yellow as the ripple. Cursor uses bright yellow `#d79921` for cursor; ripple uses `#d5c4a1` for background expansion — visually distinct. |
| **iOS Safari pointer detection** — `document.elementsFromPoint()` is not well-supported on iOS Safari, and `pointer: fine` can be unreliable on iPads with external keyboards/trackpads. | Medium | Use `elementsFromPoint` with a fallback to `elementFromPoint` if unavailable. Monitor iPad Pro + Magic Mouse scenarios via user-agent checks if needed. |
| **Canvas compositing layers** — If the canvas isn't properly promoted to its own compositor layer, it can cause painting on every frame, degrading scroll performance. | Low | Apply `transform: translateZ(0)` and `will-change: transform` on the canvas element. Confirm via DevTools "Layers" panel. |
| **GPU memory on low-end devices** — Continuous canvas rendering at 60fps may heat up or drain battery on older machines. | Low | Cap frame rate to 30fps when the tab is backgrounded (Page Visibility API). Consider `window.matchMedia('(prefers-reduced-motion: reduce)')` check to disable animation entirely. |
| **Cursor not visible over Prism code blocks or APlayer** — Some embedded elements may create their own stacking contexts that obscure the canvas. | Low | Canvas z-index of 9999 should be higher than any component. Verify against APlayer and Prism styles. |

### Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| None | — | This feature has no dependency on any other PRD task |

### Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | ✅ Full | Includes `elementsFromPoint`, `matchMedia('pointer: fine')`, canvas 2D |
| Firefox 90+ | ✅ Full | Same. Test canvas rendering on Linux (may differ from Chrome) |
| Safari 15+ | ✅ Full | Canvas and media queries work. Test `elementsFromPoint` vs `elementFromPoint` |
| Safari iOS 15+ | ⚠️ Partial | `pointer: fine` returns `false` on touch, so custom cursor is disabled — acceptable fallback |
| Edge 90+ | ✅ Full | Chromium-based, same as Chrome |

---

## Future Considerations

- **Cursor theme variants:** The cursor color/style could be made configurable via CSS custom properties so different sections of the blog could customize the cursor appearance
- **Magnetic attraction:** The cursor could have a subtle magnetic "snap" toward nearby interactive elements (pulling gently toward links) — a more advanced feature for a future iteration
- **Per-element customization:** The `data-cursor-hover` attribute could support values like `data-cursor-hover="glow"`, `data-cursor-hover="ring"` to let specific elements customize the cursor state during hover
