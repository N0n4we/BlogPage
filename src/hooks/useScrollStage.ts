import { useState, useRef, useCallback, useEffect } from 'react';

export interface ScrollStage {
  /** Cumulative scroll distance from header to blog section top (px). Used by MusicPlayer. */
  travelDist: number;
  /** 0 → 1 reveal progress. 0 = page top, 1 = blog section reached. Used by BlogPostList and Footer. */
  revealProgress: number;
  /** Ref to attach to the blog section element for position measurement. */
  blogRef: React.RefObject<HTMLElement | null>;
}

/**
 * Deep module for the page's scroll-driven reveal timeline.
 *
 * Interface (3 surface items): travelDist, revealProgress, blogRef.
 * Implementation absorbs: scroll listener lifecycle, RAF throttling, fallback
 * timeout, lock-once semantics, and responsive re-measurement.
 *
 * The blogRef serves dual purpose: it is the measurement target for the
 * scroll state machine *and* must be passed to BlogPostList so a single
 * element anchors both measurement and rendering.
 */
export function useScrollStage(): ScrollStage {
  const blogRef = useRef<HTMLElement>(null);
  const [revealProgress, setRevealProgress] = useState(0);
  const [travelDist, setTravelDist] = useState(0);
  const travelDistRef = useRef(0);
  const rafRef = useRef(0);
  const lockedRef = useRef(false);

  // ---- Scroll handler: measure blog position, compute progress ----
  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (lockedRef.current) return;

      const blog = blogRef.current;
      if (!blog) return;
      const blogTop = blog.getBoundingClientRect().top + window.scrollY;
      const dist = Math.max(0, blogTop - 60);
      if (dist !== travelDistRef.current) {
        travelDistRef.current = dist;
        setTravelDist(dist);
      }
      if (dist <= 160) {
        setRevealProgress(1);
        lockedRef.current = true;
        return;
      }

      const progress = Math.min(1, window.scrollY / dist);
      setRevealProgress(progress);
      if (progress >= 1) {
        lockedRef.current = true;
        window.removeEventListener('scroll', onScroll);
      }
    });
  }, []);

  // ---- Lifecycle: mount listener, fallback timeout ----
  useEffect(() => {
    let cancelled = false;

    const fallback = setTimeout(() => {
      if (lockedRef.current || cancelled) return;
      setRevealProgress(1);
      lockedRef.current = true;
    }, 3000);

    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      clearTimeout(fallback);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      clearTimeout(fallback);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  return { travelDist, revealProgress, blogRef };
}
