# PRD: Site-wide CRT Overlay (Scanlines + Film Grain)

**Issue:** [#1 — Site-wide CRT overlay (scanlines + film grain)](https://github.com/n0n4w3/BlogPage/issues/1)

**Status:** Ready for implementation

## Problem Statement

The blog's existing aesthetic leans heavily into retro/glitch — JetBrains Mono terminal feel, Groutpix Flow display font, post ripple with hover invert, and text-node glitch corruption on titles and bodies. However, the visual canvas is *flat*: a uniform `#282828` background with no surface texture. A CRT monitor overlay (scanlines + animated film grain) would add the missing analog warmth, reinforce the terminal/CRT terminal motif, and give the page a cohesive retro-futurist identity.

Without this texture, the page reads as a modern dark-mode site with gimmicky hover effects rather than a cohesive retro terminal experience. The glitch effects feel isolated — they need a CRT "screen" to glitch *on*.

## User Stories

| ID | User Story |
|----|-----------|
| US-1 | As a **reader**, I want subtle scanlines across the screen so the page feels like an old CRT monitor, reinforcing the retro aesthetic. |
| US-2 | As a **reader**, I want animated film grain so the "screen" has organic, living texture rather than a static flat background. |
| US-3 | As a **reader**, I want the overlay to be subtle enough that I can comfortably read long-form content without distraction. |
| US-4 | As a **reader**, I want to interact with links, buttons, and post cards normally — the overlay should never block clicks, drags, or text selection. |
| US-5 | As a **developer**, I want to toggle the overlay via a CSS class on `<body>` so I can disable it for performance testing or accessibility. |
| US-6 | As a **developer**, I want the implementation to be efficient — no jank on 60Hz displays, acceptable on 30Hz mobile. |

## Technical Design

### Architecture Overview

The CRT overlay consists of two layered effects applied via CSS on a single `body::after` pseudo-element:

1. **Scanlines** — static `repeating-linear-gradient` producing thin horizontal transparent/dark lines
2. **Film grain** — animated CSS `@keyframes` shifting a base64-encoded noise SVG as `background-image`

Both effects share the same pseudo-element, keeping DOM impact to zero. The overlay is `position: fixed`, `pointer-events: none`, and sits at a carefully chosen `z-index` above content but below interactive overlays.

### Element: `body::after`

```
body::after
├── position: fixed
├── inset: 0
├── pointer-events: none
├── z-index: 9998
├── background (scanlines: repeating-linear-gradient)
│   └── layered with background-image (film grain: base64 SVG noise)
├── opacity (controlled by CSS custom property --crt-opacity)
└── mix-blend-mode (optional, for subtle blend)
```

#### Rationale for `body::after` vs. dedicated `<div>`

- **Zero JS/DOM overhead** — no React component, no ref, no mount lifecycle
- **Works in SSR/Build-time** — no client-side hydration needed
- **Toggle via class** — `body.crt-enabled body::after` / `body:not(.crt-enabled) body::after`
- **Follows existing patterns** — the codebase already uses pseudo-elements for the post ripple (`post::before`)

### Scanlines Implementation

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9998;

  /* Scanlines: 2px transparent lines every 4px, creating the CRT look */
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.08) 2px,
    rgba(0, 0, 0, 0.08) 4px
  );

  /* Overlaid grain texture (see below) */
  background-image: url("data:image/svg+xml,..."), /* fallback layered */
  ...
}
```

- **Line spacing:** Every 4px vertical (2px transparent + 2px semi-transparent dark at 8% opacity)
- **Intensity configurable** via `--crt-scanline-opacity` custom property (default `0.08`)
- **Line thickness** controlled by the gradient stop positions (default 2px light / 2px dark = 4px cycle)

### Film Grain Implementation

Modern approach: a small generated SVG noise texture animated via CSS `background-position` shift.

**SVG noise (inline base64):**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <filter id="noise">
    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="200" height="200" filter="url(#noise)" opacity="0.04"/>
</svg>
```

This SVG:
- Uses `<feTurbulence>` to generate stochastic noise (per-pin, no jank)
- Desaturates to grayscale via `<feColorMatrix>`
- Low opacity (`0.04`) so it's barely perceptible
- Small size (200×200px) for minimal GPU memory
- Tiles seamlessly via `stitchTiles="stitch"`

**CSS animation for grain:**

```css
body::after {
  background-image: url("data:image/svg+xml;base64,...");
  background-repeat: repeat;
  background-size: 200px 200px;
  animation: crt-grain 0.3s steps(6) infinite;
}

@keyframes crt-grain {
  0%, 100% { background-position: 0 0; }
  20%      { background-position: -20px -10px; }
  40%      { background-position: 15px -25px; }
  60%      { background-position: -10px 20px; }
  80%      { background-position: 25px 15px; }
}
```

- `steps(6)` creates discrete jumps (not smooth scrolling) for authentic static-like movement
- 0.3s duration keeps frequency below 4Hz — perceptible but not jarring
- 6 discrete positions prevent tiling repetition

### Layering: Scanlines + Grain Together

Since `background` and `background-image` would conflict, use `background` for scanlines (gradient) and layer grain via a multi-background technique:

```css
body::after {
  /* Layer 1: scanlines gradient */
  background: repeating-linear-gradient(
    0deg,
    transparent 0px, transparent 2px,
    rgba(0,0,0,var(--crt-scanline-opacity, 0.08)) 2px,
    rgba(0,0,0,var(--crt-scanline-opacity, 0.08)) 4px
  );

  /* Layer 2: grain noise (comma-separated background-image) */
  background-image: url("data:image/svg+xml;base64,...");
  background-blend-mode: normal;
  background-repeat: repeat;
  background-size: auto auto, 200px 200px;
}
```

Alternatively, combine in a single `background` shorthand:

```css
background:
  repeating-linear-gradient(...) repeat,
  url("data:image/svg+xml;base64,...") repeat 0 0 / 200px 200px;
```

### Toggle Mechanism

The overlay is gated by a CSS class on `<body>`:

```css
/* Disabled by default */
body::after {
  content: none;
}

/* Enabled */
body.crt-enabled::after {
  content: '';
  /* ... all overlay styles ... */
}
```

**Toggle in `src/App.tsx`:**

```tsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    document.body.classList.add('crt-enabled');
    return () => document.body.classList.remove('crt-enabled');
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BlogPage />} />
        <Route path="/:dateId" element={<BlogPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

For future preference persistence, the toggle could be extended to:
- `localStorage` key `crt-overlay`
- A small switch in the footer (TBD in later iteration)
- `prefers-reduced-transparency` or `prefers-reduced-motion` automatic disable

### CSS Custom Properties (configurable via theme)

```css
:root {
  --crt-enabled: 1;
  --crt-scanline-opacity: 0.08;
  --crt-scanline-spacing: 4px;
  --crt-grain-opacity: 0.04;
  --crt-grain-speed: 0.3s;
  --crt-z-index: 9998;
}
```

These allow runtime or media-query-based adjustment without touching the pseudo-element rule.

### Gruvbox Context (`#282828`)

The scanline dark stripe uses `rgba(0, 0, 0, 0.08)` (pure black at low opacity) rather than a Gruvbox color because:

1. The base `#282828` is already a very dark brown-black
2. `rgba(0,0,0,0.08)` over `#282828` produces a barely-darker stripe, maintaining the dark theme
3. Using actual Gruvbox `#1d2021` (dark0) would create too much contrast

The grain SVG uses grayscale noise at `opacity: 0.04` — this works universally over any color and keeps the "screen" look without chromatic distortion.

## Expanded Acceptance Criteria

### Visual

- [ ] AC-1: Scanlines are visible as faint horizontal lines across the full viewport
- [ ] AC-2: Scanlines are subtle enough to not distract from reading body text at 16px+
- [ ] AC-3: Film grain animates with a soft, static-like flicker (not smooth scrolling)
- [ ] AC-4: Both effects together look like a dark CRT monitor screen
- [ ] AC-5: The overlay does not visually clip or break at any viewport width (320px to 2560px)

### Interaction

- [ ] AC-6: `pointer-events: none` is respected — all clicks, drags, and hovers pass through to underlying elements
- [ ] AC-7: Text selection (mouse drag) works through the overlay
- [ ] AC-8: Post ripple hover effect (`post::before`) is fully visible and interactive
- [ ] AC-9: Glitch effects still render correctly on top of the overlay visual

### Toggle

- [ ] AC-10: Adding `crt-enabled` class to `<body>` enables the overlay
- [ ] AC-11: Removing `crt-enabled` disables the overlay completely (no residual artifacts)
- [ ] AC-12: The toggle can be triggered at any time without page reload
- [ ] AC-13: Default state is enabled (class added on mount)

### Performance

- [ ] AC-14: No frame drops on 60Hz displays during grain animation (verify with DevTools Performance tab)
- [ ] AC-15: GPU-composited — the overlay should be in its own compositing layer (verified via `will-change: transform` or `transform: translateZ(0)`)
- [ ] AC-16: Mobile 30Hz — no visible jank on mid-range Android/iOS devices
- [ ] AC-17: No layout thrashing — the pseudo-element is `position: fixed` with `inset: 0`, never triggers layout

### Accessibility

- [ ] AC-18: Animation is imperceptible to users who set `prefers-reduced-motion: reduce` (no motion, just static texture)
- [ ] AC-19: Screen readers ignore the pseudo-element (CSS-generated content is not exposed to accessibility tree)
- [ ] AC-20: No contrast ratio impact on text readability

## Implementation Plan

### Files to Create

| File | Purpose |
|------|---------|
| `src/styles.css` | Add `body::after` pseudo-element styles, `crt-enabled` class gate, `@keyframes crt-grain`, CSS custom properties in `:root` |

No new files needed — all styling lives in the existing central stylesheet.

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add `useEffect` to toggle `crt-enabled` class on `<body>` on mount/unmount |

### Step-by-Step

1. **CSS: Add custom properties** — Declare `--crt-enabled`, `--crt-scanline-opacity`, `--crt-scanline-spacing`, `--crt-grain-opacity`, `--crt-grain-speed` in `:root`

2. **CSS: Generate base64 SVG noise** — Create the 200×200 SVG with `<feTurbulence>`, convert to base64 data URI, set as `background-image` with `background-repeat: repeat; background-size: 200px`

3. **CSS: Write `body::after` rule** — `position: fixed; inset: 0; pointer-events: none; z-index: 9998;` with multi-background combining scanlines gradient and grain

4. **CSS: Write `@keyframes crt-grain`** — 6-step discrete position shift for grain animation

5. **CSS: Gate with `body.crt-enabled`** — Default `content: none` on `body::after`, enable on `body.crt-enabled::after`

6. **JSX: Add toggle in `App.tsx`** — `useEffect` to add `crt-enabled` on mount, remove on unmount

7. **Performance audit** — Verify compositing layer via DevTools, confirm no forced layouts

### Code Review Checklist

- [ ] `pointer-events: none` present on the pseudo-element
- [ ] `z-index` does not conflict with existing interactive elements (APlayer, modals, etc.)
- [ ] `body::after` uses `content: ''` (required for pseudo-elements to render)
- [ ] Grain animation uses `steps()` (discrete), not `linear`/`ease` (smooth)
- [ ] SVG noise is valid `<feTurbulence>` with `stitchTiles="stitch"` for seamless tiling
- [ ] Base64 encoding is efficient (no unnecessary whitespace/line breaks)
- [ ] App.tsx cleanup: `useEffect` return removes the class

## Risks and Dependencies

### Performance

| Risk | Severity | Mitigation |
|------|----------|------------|
| Grain animation causes layout thrashing | Medium | `background-position` animation is composited in Chromium and Firefox; verify with `will-change: background-position` or `transform: translateZ(0)` |
| SVG `feTurbulence` filter is expensive on some GPUs | Low | 200×200px is minimal; the filter is static (rendered once into texture), only `background-position` animates |
| Mobile GPU can't composite both layers at 30Hz | Low | Test on mid-range Android; consider dropping grain on `(max-resolution: 1x)` or mobile media query |

### Z-index Layering

| Element | z-index | Notes |
|---------|---------|-------|
| Post `::before` (ripple) | `-1` | Behind content |
| Content layers | `auto` | Default stacking |
| `body::after` (CRT overlay) | `9998` | Above all content |
| Modals / custom cursor | `9999` | Above CRT overlay — add comment in CSS |

Must ensure no future interactive overlay (e.g., custom cursor canvas from #2) is accidentally placed below `9998`.

### Mobile Viewport

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scanlines look too thick on high-DPI mobile | Low | Use media query to halve scanline opacity on `(max-width: 768px)` or increase line frequency |
| Grain animation consumes battery on mobile | Low | `prefers-reduced-motion: reduce` disables animation; consider `@media (prefers-reduced-motion: no-preference)` gate |
| `position: fixed` + `inset: 0` on mobile Safari | Low | `position: fixed` on `body::after` works on iOS 12+; verify on iOS Safari |

### Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Browser `feTurbulence` filter support | External | Supported in all modern browsers (Chrome 31+, Firefox 35+, Safari 9.1+, Edge 79+); no IE fallback needed |
| CSS `repeating-linear-gradient` | External | Supported in all modern browsers |
| CSS `@keyframes` animation | External | Supported in all modern browsers |

**No internal dependencies** — this feature is fully self-contained in CSS + a tiny `useEffect` in App.tsx.

### Accessibility

The overlay is purely decorative (CSS-generated content). It is invisible to screen readers and does not affect keyboard navigation. Users who prefer reduced motion see a static texture (keyframes disabled but SVG background still renders).

## Glossary

| Term | Definition |
|------|-----------|
| **CRT** | Cathode-ray tube — old monitor technology with characteristic curved glass, scanlines, and slight flicker |
| **Scanlines** | Horizontal lines visible on CRT displays due to the electron beam scanning rows of phosphor |
| **Film grain** | Random optical texture visible in analog film stock; here simulated via SVG turbulence noise |
| **feTurbulence** | SVG filter primitive that generates Perlin noise / fractal noise textures |
| **Compositing layer** | A GPU-accelerated rendering layer in the browser's paint pipeline |
| **Pseudo-element** | CSS `::after` / `::before` — virtual elements rendered by the browser, not present in the DOM tree |

## Future Considerations

- **Theme toggle**: Add a footer switch for disabling the CRT overlay (requires React state management + localStorage)
- **Intensity slider**: Variable scanline darkness via `--crt-scanline-opacity` exposed to user
- **Chromatic aberration**: A very subtle RGB split on the overlay for more authentic CRT feel (performance cost)
- **Screen burn-in**: Faint, semi-transparent static elements that feel "burned into" the CRT screen
- **Seasonal themes**: Holiday-specific grain colors or scanline patterns
