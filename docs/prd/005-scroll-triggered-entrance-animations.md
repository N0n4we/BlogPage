# PRD #5 — Scroll-Triggered Entrance Animations

**Status:** Draft  
**Author:** Crew worker  
**Date:** 2026-05-22  
**Issue:** [#5 — Scroll-triggered entrance animations](https://github.com/N0n4we/BlogPage/issues/5)  
**Labels:** `ready-for-agent`, `enhancement`  

---

## 1. Problem Statement

The blog page currently renders all post cards statically — they appear instantly on load with no visual progression. This creates a flat, low-engagement reading experience. Without entrance animations, the page feels abrupt: a wall of content snaps into view all at once, making it harder for readers to visually parse the list of posts and draw their attention sequentially down the page.

Modern content-driven sites benefit from subtle scroll-triggered reveals that guide the reader's eye, break the visual monotony of a long list, and convey a sense of polish and craftsmanship. Adding such animations will improve perceived performance and user engagement without sacrificing the site's existing aesthetic (Gruvbox dark theme, CRT/glitch accent effects).

---

## 2. User Stories

| ID | Story |
|----|-------|
| US-1 | **As a reader**, I want blog post cards to fade and slide up smoothly as I scroll down, so the page feels dynamic and guides my attention. |
| US-2 | **As a reader**, I want posts to animate in one after another with a slight stagger, creating a cascading reveal effect rather than everything appearing simultaneously. |
| US-3 | **As a reader with motion sensitivity**, I want animations to be completely disabled when my system's `prefers-reduced-motion` setting is active, so I'm not disoriented by movement. |
| US-4 | **As a returning reader**, I want each post to animate only the first time it enters the viewport — scrolling back up and down should not re-trigger the animation. |
| US-5 | **As a mobile user**, I want animations to work reliably on touch devices with no jank, dropped frames, or layout shifts. |
| US-6 | **As a developer**, I want a reusable `useScrollReveal` hook that can be applied to any component, not just post cards — future sections (hero, footer, music player) should be easy to add. |

---

## 3. Technical Design

### 3.1 Architecture Overview

A lightweight custom React hook, `useScrollReveal`, wraps the native `IntersectionObserver` API to observe elements and apply CSS classes on first intersection. No third-party animation libraries are needed — all motion is driven by CSS transitions on GPU-composited properties (`opacity`, `transform`).

```
┌────────────────────────────────────────────────────┐
│                   Browser Viewport                  │
│                                                      │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│    │ Post #1  │   │ Post #2  │   │ Post #3  │     │
│    │ reveal   │   │ (waiting)│   │ (waiting)│     │
│    │ active   │   │          │   │          │     │
│    └──────────┘   └──────────┘   └──────────┘     │
│         │               │               │          │
│         ▼               ▼               ▼          │
│    ┌────────────────────────────────────────┐      │
│    │         IntersectionObserver            │      │
│    │         threshold: 0.1, once: true      │      │
│    └────────────────────────────────────────┘      │
│         │               │               │          │
│         ▼               ▼               ▼          │
│    ┌────────────────────────────────────────┐      │
│    │     CSS: reveal-enter → reveal-active   │      │
│    │     opacity: 0→1, translateY(20px)→0   │      │
│    │     transition-delay: stagger(n*80ms)   │      │
│    └────────────────────────────────────────┘      │
└────────────────────────────────────────────────────┘
```

### 3.2 `useScrollReveal` Hook

**File:** `src/hooks/useScrollReveal.ts` (new)

```typescript
interface UseScrollRevealOptions {
  /** Fraction of element area that must be visible (0–1). Default: 0.1 */
  threshold?: number;
  /** Root margin shorthand for提前/推迟触发. Default: "0px" */
  rootMargin?: string;
  /** Only animate on first intersection. Default: true */
  once?: boolean;
  /** Stagger delay in ms applied to children. Default: 80 */
  staggerMs?: number;
}

function useScrollReveal<T extends HTMLElement>(options?: UseScrollRevealOptions): {
  ref: React.RefObject<T>;
  isRevealed: boolean;
}
```

**Implementation details:**

1. Accepts an optional `threshold` (default `0.1`), `rootMargin` (default `"0px"`), `once` (default `true`), and `staggerMs` (default `80`).
2. Returns a `ref` to attach to the target element and an `isRevealed` boolean.
3. On mount, creates an `IntersectionObserver` with the given options.
4. When the observed element intersects (ratio ≥ threshold), applies class `reveal-active` and sets `isRevealed = true`.
5. If `once: true` (default), disconnects the observer after first intersection.
6. If `once: false`, toggles the class on each intersection/disconnect cycle for re-triggerable use cases.
7. Detects `prefers-reduced-motion` via `window.matchMedia('(prefers-reduced-motion: reduce)')`. If matched, immediately marks all observed elements as revealed (no animation) and disconnects the observer.
8. The stagger is implemented via `transition-delay` in CSS on the child elements — the hook does not calculate per-element delays internally. Instead, it applies `reveal-active` to the parent container, and CSS `:nth-child` or a custom property cascade handles per-child delays.
9. Cleans up the observer and media query listener on unmount.

**Usage pattern within a container:**

```tsx
function PostList() {
  const { ref } = useScrollReveal({ threshold: 0.1 });

  return (
    <section className="blog-posts reveal-enter" ref={ref}>
      {/* Active class cascaded to children via CSS */}
    </section>
  );
}
```

### 3.3 CSS Classes and Animation Keyframes

**File:** `src/styles.css` (amendments)

```css
/* ============================================
   Scroll-Triggered Reveal Animations
   ============================================ */

/* Initial hidden state — applied by default via reveal-enter */
.reveal-enter > * {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.5s cubic-bezier(0.25, 0.1, 0.25, 1),
    transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1);
  will-change: opacity, transform;
}

/* Revealed state — applied by IntersectionObserver */
.reveal-enter.reveal-active > * {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger: each child animates with a progressive delay */
.reveal-enter > *:nth-child(1) { transition-delay: 0ms; }
.reveal-enter > *:nth-child(2) { transition-delay: 80ms; }
.reveal-enter > *:nth-child(3) { transition-delay: 160ms; }
.reveal-enter > *:nth-child(4) { transition-delay: 240ms; }
.reveal-enter > *:nth-child(5) { transition-delay: 320ms; }
.reveal-enter > *:nth-child(6) { transition-delay: 400ms; }
/* Additional children can be added as needed, or use a calc() loop */

/* ------------------- */
/* prefers-reduced-motion: no animation */
/* ------------------- */
@media (prefers-reduced-motion: reduce) {
  .reveal-enter > * {
    transition: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

**Design decisions:**

- **`cubic-bezier(0.25, 0.1, 0.25, 1)`** matches the existing post hover ripple transition curve — consistent feel.
- **`translateY(20px)`** keeps the slide subtle. 20px is enough to convey direction without being distracting.
- **`will-change: opacity, transform`** hints the browser to promote to GPU-composited layers, avoiding layout/paint thrashing.
- **`transition-delay` via `:nth-child`** is simpler and more performant than a JS-driven stagger loop. The CSS selector covers all immediate children.
- **`@media (prefers-reduced-motion: reduce)`** completely disables transitions and forces visible state — no `reveal-enter`/`reveal-active` class changes will have visible effect.

### 3.4 `prefers-reduced-motion` Detection

JavaScript-side detection via `matchMedia` in the hook ensures the `IntersectionObserver` is never created when the user prefers reduced motion, saving a small amount of CPU/memory:

```typescript
const preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (preferReducedMotion.matches) {
  // Immediately set isRevealed = true, skip observer creation
  return { ref, isRevealed: true };
}
```

A listener on `preferReducedMotion` handles live changes (user toggles the setting while the page is open), though this is an edge case.

---

## 4. Expanded Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | Post cards fade in (opacity 0→1) as they scroll into view with ≥10% visible area | Visual inspection + IntersectionObserver debug logging |
| AC-2 | Post cards slide up (translateY 20px→0) during the same reveal transition | Visual inspection |
| AC-3 | Consecutive post cards have staggered entrance delays (80ms gap) producing a cascade | Visual inspection + DevTools computed styles |
| AC-4 | Animation runs exactly once per post card per page session. Scrolling away and back does not re-trigger | Visual inspection |
| AC-5 | `prefers-reduced-motion: reduce` completely disables all entrance animations — posts appear immediately with no transition | Set OS accessibility setting → reload page → verify |
| AC-6 | No cumulative layout shift (CLS) — post cards occupy their full height before and after reveal | Lighthouse CLS audit (< 0.1) |
| AC-7 | Animations are GPU-composited — `opacity` + `transform` only, no `width`/`height`/`top`/`margin` in transitions | DevTools Performance tab → compositor layers |
| AC-8 | Works on initial page load (visit `/` fresh) | Manual test |
| AC-9 | Works on navigating back to the post list from an expanded post | React Router back navigation test |
| AC-10 | Works on mobile viewports (touch scroll) | DevTools device emulation + physical device |
| AC-11 | When a post container already has `reveal-active` before scroll (e.g., above-fold posts), it should either animate immediately on page load or be pre-revealed without animation | Scroll position detection — posts in initial viewport get revealed instantly |
| AC-12 | The hook is reusable — any component wrapping `useScrollReveal` gets the same behavior | Unit test with a mock component |

---

## 5. Implementation Plan

### 5.1 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useScrollReveal.ts` | **Create** | New hook encapsulating IntersectionObserver + reduced-motion detection |
| `src/components/BlogPostList.tsx` | **Modify** | Add `reveal-enter` class to the container `<section>`, attach ref from `useScrollReveal` |
| `src/components/BlogPost.tsx` | **Modify** | (Optional) Add `reveal-enter` class to the `<article>` if stagger should happen at the post level instead of the list level — see §5.2 |
| `src/styles.css` | **Modify** | Add `.reveal-enter` / `.reveal-active` CSS rules, `:nth-child` stagger, and `prefers-reduced-motion` override |

### 5.2 Where to Apply Animation Level

There are two valid approaches, depending on desired visual effect:

**Option A: Container-level (recommended for this project)**
Apply `useScrollReveal` in `BlogPostList.tsx` on the `<section.blog-posts>` container. The `> *` selector targets each direct child `<article.post>` with staggered delays. This keeps the hook in a single place and the cascade is automatic.

**Option B: Per-element**
Apply `useScrollReveal` in `BlogPost.tsx` on each `<article.post>` individually. Each post would be observed independently with no stagger (or stagger managed by `data-index`). This adds N observers instead of 1.

**Decision:** Use **Option A** (container-level) — fewer observer instances, simpler code, cleaner stagger via CSS. Option B may be added later if individual reveal timing needs differ per post.

### 5.3 Pseudocode for Modified Files

#### `src/components/BlogPostList.tsx`

```tsx
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function BlogPostList({ expandedPostId, onPostToggle }: BlogPostListProps) {
  const { ref } = useScrollReveal({ threshold: 0.1 });
  // ... existing code ...

  return (
    <section className="blog-posts reveal-enter" ref={ref}>
      {/* ... unchanged ... */}
    </section>
  );
}
```

#### `src/styles.css` additions

(See §3.3 for the full CSS block to append.)

### 5.4 Migration / Rollout

1. Create `src/hooks/useScrollReveal.ts` — implement the hook.
2. Add CSS to `src/styles.css` — all animation rules at the bottom with a clear section comment.
3. Modify `BlogPostList.tsx` — apply hook and class.
4. Manual testing per acceptance criteria.
5. Lighthouse CLS audit before and after (target: CLS < 0.1 both runs).

### 5.5 Test Plan

| Type | What to Test | How |
|------|-------------|-----|
| Unit | Hook returns correct `ref` and `isRevealed` | Vitest + jsdom mock `IntersectionObserver` |
| Unit | Hook respects `once: false` (re-triggers) | Mock intersection/disconnect cycle |
| Unit | `prefers-reduced-motion` immediately sets `isRevealed: true` | Mock `matchMedia` returns `matches: true` |
| Visual | Posts fade/slide in with stagger | Manual scroll test in browser |
| Visual | No animation when `prefers-reduced-motion: reduce` | OS setting + reload |
| Perf | No CLS, no layout thrashing | Lighthouse, DevTools Performance |
| A11y | Animations respect reduced-motion | Automated a11y audit (axe-core) |

---

## 6. Risks and Dependencies

### 6.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **CLS (Cumulative Layout Shift)** | Post cards may jump when animation completes if initial `opacity: 0` allows zero-height rendering | Use `visibility: hidden` or ensure `transform`/`opacity` only affect compositing, not layout. Elements must reserve their full height from the start. |
| **Re-trigger on route navigation** | React Router navigating back to `/` may unmount and remount the component, causing re-animation | The `once: true` default handles this within a single mount. For cross-route navigation, the component remounts so re-animation is acceptable — in fact desirable, since the user is arriving anew. |
| **SSR compatibility (future)** | If the site adds SSR, `IntersectionObserver` and `matchMedia` are not available on the server | The hook must guard with `typeof window !== 'undefined'` or use a dynamic import. Add a `suppressSSR` check in the hook's initial render. |
| **Performance with many posts** | 20+ observed elements could cause jank | Container-level observation (1 observer) avoids this. Even per-element, IntersectionObserver is efficient — the real risk is JS-driven animation loops, which aren't used. |
| **Conflicting with existing CSS transitions** | Post hover ripples (`post:hover::before`) use `transition` — the reveal animation's `> *` selector shouldn't interfere | Verify `.reveal-enter > *` doesn't override `.post::before`. The `> *` only targets direct children (`.post` elements), not pseudo-elements. |

### 6.2 Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| None | — | The feature is self-contained with no external library dependencies. `IntersectionObserver` is supported in all modern browsers (CanIUse: 97.5%+). |

### 6.3 Browser Support

`IntersectionObserver` is supported in:
- Chrome 51+ (2016)
- Firefox 55+ (2017)
- Safari 12.1+ (2019)
- Edge 16+ (2017)
- No support in IE11 — the hook should gracefully degrade (no animation, content always visible)

---

## 7. Future Considerations

| Future Improvement | Reason to Add |
|--------------------|---------------|
| Scroll-triggered parallax on hero section | Reuse the same `useScrollReveal` hook with `once: false` and a different CSS transform |
| Intersection-based lazy loading of post content | Similar observer pattern, different handler |
| Intersection-based analytics (scroll depth tracking) | Reuse observer infrastructure |
| Animate individual post elements (title, meta, excerpt) with cascade | Switch to per-element stagger within each post card using `data-` attributes and `:nth-child` |
| Custom easing per post card (e.g., slower for featured posts) | Pass `data-easing` attribute read by CSS `var()` |
| Scroll-driven progress indicator | Reuse scroll position and intersection data |

---

## 8. Appendix: Reference Links

- [Intersection Observer API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [prefers-reduced-motion — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [CSS will-change property — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
- [Cumulative Layout Shift — web.dev](https://web.dev/cls/)
- [Gruvbox color palette](https://github.com/morhetz/gruvbox)
- GitHub Issue: [#5 — Scroll-triggered entrance animations](https://github.com/N0n4we/BlogPage/issues/5)
