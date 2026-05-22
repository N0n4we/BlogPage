# PRD-003: 3D Tilt + Depth Parallax on Post Cards

- **Status:** Draft
- **Issue:** [#3 — 3D tilt + depth parallax on post cards](https://github.com/n0n4m3/BlogPage/issues/3)
- **Labels:** `enhancement`, `ready-for-agent`
- **Target release:** v0.3.0

---

## 1. Problem Statement

The blog's post cards currently render as flat, static rectangles. Each card has a ripple hover effect (a `::before` pseudo-element that scales up on `:hover`), but the card itself has no spatial depth or responsiveness to pointer movement. This makes the browsing experience feel two-dimensional compared to modern portfolio/blog sites that use subtle 3D tilting to convey depth and interactivity.

Visitors who spend time on the blog browsing through posts get no tactile feedback from the card surface — no sense that different visual layers (title, meta, content wrapper) exist at different depths. Adding a tilt-on-mouse-move effect that reuses the existing `--mouse-x` / `--mouse-y` infrastructure will:

- Increase perceived polish and quality
- Give visual depth cues that guide the eye to the title (highest layer)
- Make the card feel like a physical object responding to the user

---

## 2. User Stories

| ID | Story |
|----|-------|
| US-1 | As a visitor, I want post cards to tilt gently toward my cursor so the page feels alive and responsive. |
| US-2 | As a visitor on a touch device (phone/tablet), I want no tilt effect so the cards remain stable and don't fight my scrolling or tapping. |
| US-3 | As a returning reader, I want the title and metadata to appear at different visual depths (title closer, meta further) so the card has layered dimensionality. |
| US-4 | As a developer, I want the tilt effect to coexist with the existing ripple `::before` hover effect so both animations run without transform conflicts. |

---

## 3. Technical Design

### 3.1 Overview

The 3D tilt effect is achieved entirely with CSS transforms, driven by JavaScript that maps cursor position inside each `.post` card to `rotateX` and `rotateY` values — plus a `translateZ` chain on child elements for the depth parallax effect.

The existing `onMouseMove` handler on the `<article>` element already computes `--mouse-x` and `--mouse-y` CSS custom properties (used by the ripple `::before` pseudo-element). The tilt implementation will reuse these same properties.

### 3.2 CSS Perspective & Rotation

**Perspective parent:** The `.post` card itself will have `perspective: 1200px` set — this creates the vanishing-point context. `1200px` is chosen as a moderate value that produces a noticeable-but-not-exaggerated tilt.

**Rotation mapping:** An inner wrapper (`.post-tilt-target` or reuse `.post-content-wrapper`) applies `rotateX` and `rotateY` computed from the normalised cursor position:

```
angleX = ((mouseY / cardHeight) - 0.5) × maxAngle × -1
angleY = ((mouseX / cardWidth) - 0.5) × maxAngle
```

Where `maxAngle` is configurable (default: **8deg**).

These angles are exposed as CSS custom properties `--tilt-x` and `--tilt-y` so the rendering stays in CSS land:

```css
.post-tilt-target {
  transform:
    rotateX(var(--tilt-x, 0deg))
    rotateY(var(--tilt-y, 0deg));
}
```

**Why custom properties?** Because we want a smooth `transition` for the return-to-neutral animation when the cursor leaves the card:

```css
.post-tilt-target {
  transition: transform 0.3s ease-out;
}
```

When the cursor leaves, `--mouse-x`/`--mouse-y` snap to the centre, the JS recalculates angles to 0deg, and the transition provides a smooth spring-back.

### 3.3 Reusing `--mouse-x` / `--mouse-y`

The current `handleMouseMove` in `BlogPost.tsx`:

```tsx
const handleMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
  if (!postRef.current) return;
  const rect = postRef.current.getBoundingClientRect();
  postRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
  postRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
}, []);
```

A new `useTiltEffect` hook (or inline logic in the same function) will:

1. Read `--mouse-x` / `--mouse-y` from the element's computed style
2. Normalise to 0–1 range by dividing by `rect.width` / `rect.height`
3. Compute `rotateX` and `rotateY` using the formula above
4. Set `--tilt-x` and `--tilt-y` on the same element

Alternatively, the existing `handleMouseMove` can be extended to also calculate and set `--tilt-x` / `--tilt-y` directly, keeping it to a single event handler.

**Implementation preference:** Extend the existing `handleMouseMove` — it avoids adding another listener and keeps all cursor-driven effects in one place.

### 3.4 Depth Parallax (`translateZ`)

To create the illusion of depth layers, child elements of the tilt target apply different `translateZ` values **in the opposite direction**:

| Element | `translateZ` | Visual effect |
|---------|-------------|---------------|
| `.post h3` (title) | `+25px` | Pops forward, parallax offset amplifies tilt |
| `.post-meta` (date) | `-10px` | Sinks backward, scrolls slower than title |
| `.post-full-content` | `0` | Neutral |
| `.post::before` (ripple) | on separate stacking context (see §3.6) | Unchanged |

These are applied as CSS:

```css
.post h3 {
  transform: translateZ(25px);
}

.post .post-meta {
  transform: translateZ(-10px);
}
```

**Important:** The depth layers only work because the card has `transform-style: preserve-3d` on the tilt target, which enables child elements to participate in the 3D rendering context. The `.post` root may need `transform-style: flat` to avoid breaking the ripple's stacking context (see §3.6).

### 3.5 Touch Disable

On touch devices, the tilt effect must be disabled entirely because:

- Touch events fire `touchmove` rapidly, causing jittery tilt
- Scrolling conflicts with tilt — the user's intent is to scroll, not tilt
- The effect adds no value on touch (no cursor to track)

**Detection strategy:** Use the CSS `pointer: coarse` media query as the primary mechanism. In JavaScript, additionally check `'ontouchstart' in window` or `navigator.maxTouchPoints > 0`.

```css
/* Disable tilt on touch devices */
@media (pointer: coarse) {
  .post-tilt-target {
    transform: none !important;
    transition: none !important;
  }

  .post h3,
  .post .post-meta {
    transform: none !important;
  }
}
```

Additionally, the JS tilt logic should guard:

```tsx
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Inside handleMouseMove:
if (isTouchDevice) return;
```

The double guard (CSS + JS) ensures the tilt effect never fires on touch devices even if JS detection races.

### 3.6 Coexistence with `::before` Ripple

The current ripple effect uses:

```css
.post::before {
  transform: translate(-50%, -50%) scale(0);
  transition: transform 1.8s cubic-bezier(0.25, 0.1, 0.25, 1);
  z-index: -1;
}

.post:hover::before {
  transform: translate(-50%, -50%) scale(9);
}
```

**Problem:** If the tilt rotation is applied to `.post` or an ancestor of `::before`, the `::before` scale transform will compound with the rotation — the ripple will tilt instead of staying flat, and the combined transforms may produce unexpected visual results.

**Solution:** Keep the ripple `::before` on a **separate stacking context** by applying tilt only to an **inner wrapper** (`.post-content-wrapper` or a new `.post-tilt-target`), not to the `.post` root itself.

The `.post` root retains `isolation: isolate` (already set) and `transform-style: flat`. The inner wrapper gets `transform-style: preserve-3d` for the child depth layers.

```
.post (isolation: isolate, transform-style: flat)
├── ::before (ripple — flat, unaffected by tilt)
└── .post-content-wrapper (transform-style: preserve-3d, tilt rotation applied here)
    ├── h3 (translateZ: 25px)
    ├── .post-meta (translateZ: -10px)
    └── .post-full-content (translateZ: 0)
```

This architecture cleanly separates the ripple transform (on `::before` of `.post`) from the tilt transforms (on the inner wrapper and its children).

However, there is a subtlety: if `.post` has `overflow: hidden` (it does), then applying perspective transforms to an inner element may cause clipping at the card boundary because the 3D-rotated child extends beyond the card's bounding box.

**Mitigation:** Add `padding: 4px` to the tilt target to create breathing room for the rotated edges, or increase the card's padding slightly so the content has room to rotate without clipping.

---

## 4. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | When the cursor moves over a `.post` card, the card tilts toward the cursor position using `rotateX`/`rotateY` with a max angle of ~8deg. | Manual: hover each quadrant of the card; visual: tilt direction matches cursor. |
| AC-2 | When the cursor leaves the card, the tilt smoothly returns to neutral (0deg) within 300ms. | Manual: flick cursor off card; visual: smooth spring-back. |
| AC-3 | The post title appears visually closer (pops forward) compared to the post meta (sinks back). | Manual: observe edge of card during tilt — title parallax-offset more than meta. |
| AC-4 | The tilt effect is completely disabled on touch devices (phone/tablet). | DevTools: toggle `pointer: coarse` emulation → verify `transform: none` on tilt target. Manual: test on real device. |
| AC-5 | The existing ripple `::before` hover effect continues to work correctly: the ripple propagates from the cursor position in a flat 2D circle, unaffected by the tilt rotation. | Manual: hover card; visual: ripple expands from cursor as circle, not ellipse. |
| AC-6 | The tilt effect does not cause visible clipping of card content at the card boundaries. | Manual: tilt card to extreme angles; visual: no content is cut off. |
| AC-7 | The tilt effect causes no performance regression — frame rate stays at 60fps during tilt + ripple simultaneous animation. | DevTools: Performance tab recording during fast mouse movement over cards. |

---

## 5. Implementation Plan

### 5.1 Files to Modify

| File | Change |
|------|--------|
| `src/components/BlogPost.tsx` | Extend `handleMouseMove` to compute and set `--tilt-x` / `--tilt-y`. Add touch detection guard. Possibly extract into `useTiltEffect` hook. |
| `src/styles.css` | Add `.post` perspective, `.post-content-wrapper` tilt target transforms, `translateZ` depth on title/meta, touch-device media query, transition, and any padding adjustments. |

### 5.2 Step-by-Step

1. **CSS — Perspective & tilt target**  
   Add to `.post`: `perspective: 1200px;`  
   Add to `.post-content-wrapper`: `transform-style: preserve-3d;` and a `transition: transform 0.3s ease-out;`

2. **CSS — Tilt transform via custom properties**  
   `.post-content-wrapper` gets: `transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));`

3. **CSS — Depth parallax layers**  
   `.post h3`: `transform: translateZ(25px);`  
   `.post .post-meta`: `transform: translateZ(-10px);`  
   These need to be within the `preserve-3d` context to work.

4. **CSS — Touch disable**  
   `@media (pointer: coarse) { ... }` block with `transform: none !important` on the tilt target and depth layers.

5. **JS — Extend `handleMouseMove`**  
   Add tilt angle calculation using `--mouse-x` / `--mouse-y` values already computed. Set `--tilt-x` and `--tilt-y` custom properties. Add `isTouchDevice` guard.

6. **JS — Initialise tilt custom properties**  
   In the existing `useEffect` that inits `--mouse-x` / `--mouse-y`, also init `--tilt-x: 0deg` and `--tilt-y: 0deg`.

7. **Verify ripple coexistence**  
   Ensure `.post::before` is still on the `.post` (not the wrapper) so it stays flat. The `z-index: -1` on `::before` and `isolation: isolate` on `.post` keep the stacking separate.

### 5.3 Suggested Code Changes

#### `src/components/BlogPost.tsx`:

```tsx
// Add near top of the component (or as a constant outside):
const TILT_MAX_ANGLE = 8;
const isTouchDevice = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// Inside handleMouseMove, after setting --mouse-x and --mouse-y:
if (!isTouchDevice && postRef.current) {
  const rect = postRef.current.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const tiltX = ((mouseY / rect.height) - 0.5) * -TILT_MAX_ANGLE;
  const tiltY = ((mouseX / rect.width) - 0.5) * TILT_MAX_ANGLE;
  postRef.current.style.setProperty('--tilt-x', `${tiltX}deg`);
  postRef.current.style.setProperty('--tilt-y', `${tiltY}deg`);
}
```

#### `src/styles.css`:

```css
/* On .post */
.post {
  perspective: 1200px;
}

/* On .post-content-wrapper (tilt target) */
.post-content-wrapper {
  transform-style: preserve-3d;
  transition: transform 0.3s ease-out;
  transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));
  /* Add slight padding to prevent clipping on extreme tilt */
  padding: 4px;
  margin: -4px;
}

/* Depth layers */
.post-content-wrapper h3 {
  transform: translateZ(25px);
}

.post-content-wrapper .post-meta {
  transform: translateZ(-10px);
}

/* Touch device: disable all tilt and depth transforms */
@media (pointer: coarse) {
  .post-content-wrapper {
    transform: none !important;
    transition: none !important;
  }

  .post-content-wrapper h3,
  .post-content-wrapper .post-meta {
    transform: none !important;
  }
}
```

---

## 6. Risks and Dependencies

### 6.1 Transform Conflict with Ripple `scale()`

**Risk:** The `::before` pseudo-element on `.post` uses `transform: translate(-50%, -50%) scale(...)`. If the tilt rotation is applied to `.post` itself, the `::before` transform compounds with the rotation.

**Mitigation:** Apply tilt to `.post-content-wrapper` (inner wrapper), not `.post`. The `::before` stays on `.post` with `transform-style: flat` (default), completely isolated from the tilt.

### 6.2 Clip-Path / Overflow Hidden

**Risk:** `.post` has `overflow: hidden`. When the inner tilt target rotates, its corners may extend beyond the card's bounding box and get clipped.

**Mitigation:**
- Add `padding: 4px` to the tilt target's parent so there's breathing room
- Alternatively, remove `overflow: hidden` from `.post` and handle it differently (e.g., clip children via a different mechanism)
- Test with extreme tilt angles during implementation

### 6.3 Touch Device Detection

**Risk:** CSS `pointer: coarse` may not catch all touch devices (e.g., a laptop with a touchscreen that also has a mouse). On hybrid devices, the effect might fire during touch scrolling.

**Mitigation:** Use both CSS media query AND JavaScript detection (`'ontouchstart' in window || navigator.maxTouchPoints > 0`). Add `touch-action: none` guard if scroll interference is observed, or use a passive touch listener to detect ongoing touch and disable tilt for the duration.

### 6.4 Performance

**Risk:** `preserve-3d` + `transition` + `requestAnimationFrame`-driven updates during mousemove can trigger layout thrashing and GPU overuse.

**Mitigation:**
- The `transition` only applies to the _return-to-neutral_ phase (cursor leaves). During active mousemove, no transition is applied (only direct property writes).
- All transform values are set via CSS custom properties (no inline styles except the property values), keeping repaints on the compositor thread.
- Debounce `handleMouseMove` with `requestAnimationFrame` (throttle to once per frame).
- Test on low-end hardware (the `--mouse-x` / `--mouse-y` setup already runs smoothly, so the cost is minimal — just two more property sets per frame).

### 6.5 Dependencies

| Dependency | Description | Status |
|-----------|-------------|--------|
| Existing `--mouse-x` / `--mouse-y` infrastructure | The tilt effect reuses the mousemove handler and custom property pattern already in place. | ✅ Already implemented |
| `isolation: isolate` on `.post` | Already set — separates stacking contexts for `::before` and tilt target. | ✅ Already implemented |
| `overflow: hidden` on `.post` | May need adjustment to prevent tilt clipping. | ⚠️ Needs verification during implementation |

---

## 7. Open Questions

1. Should the tilt `maxAngle` be configurable per-post via a CSS custom property (e.g., `--tilt-max-angle: 8deg`), or is a hardcoded constant fine? **Decision:** Start with a hardcoded constant (`TILT_MAX_ANGLE = 8`), extract to a custom property if needed later.

2. Should the tilt effect apply to collapsed posts only, or expanded posts too? **Decision:** Both collapsed and expanded card states should tilt — the effect is on the card surface, not the content state.

3. Should there be a subtle damping factor so the tilt smooths slightly (lerp) rather than snapping instantly to the cursor? **Decision:** No — snapping to the cursor feels more responsive. The return transition provides smoothness on exit.

---

## 8. Future Enhancements (Out of Scope for v0.3)

- Per-card custom `--tilt-max-angle` via data attribute
- Tilt glow reflection (a faux specular highlight that moves with the cursor)
- Reduce tilt intensity for cards further down the viewport (scroll-depth modulation)
- Accessibility: `prefers-reduced-motion` disable
