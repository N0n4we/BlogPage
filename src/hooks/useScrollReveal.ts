import { useEffect, useRef, useState, useCallback } from 'react';

interface UseScrollRevealOptions {
  /** Fraction of element area that must be visible (0–1). Default: 0.1 */
  threshold?: number;
  /** Root margin for early/late triggering. Default: "0px" */
  rootMargin?: string;
  /** Only animate on first intersection. Default: true */
  once?: boolean;
}

/**
 * useScrollReveal — IntersectionObserver-driven entrance animation trigger.
 *
 * Returns a `ref` to attach to a container element. When the element enters
 * the viewport (≥ threshold), `isRevealed` becomes true and an optional
 * CSS class `reveal-active` toggle pattern can be layered on top.
 *
 * Handles `prefers-reduced-motion` — if the user prefers reduced motion,
 * `isRevealed` is immediately `true` and no observer is created.
 *
 * SSR-safe — checks `typeof window` before using browser APIs.
 */
export function useScrollReveal<T extends HTMLElement>(
  options: UseScrollRevealOptions = {},
) {
  const { threshold = 0.1, rootMargin = '0px', once = true } = options;
  const [isRevealed, setIsRevealed] = useState(false);
  const targetRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback((node: T | null) => {
    // Guard: SSR or no browser APIs
    if (typeof window === 'undefined') return;

    // Disconnect previous observer if ref changes
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    targetRef.current = node;

    // If user prefers reduced motion, reveal immediately
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsRevealed(true);
      return;
    }

    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsRevealed(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setIsRevealed(false);
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    observerRef.current = observer;
  }, [threshold, rootMargin, once]);

  // Listen for prefers-reduced-motion changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsRevealed(true);
        if (observerRef.current) {
          observerRef.current.disconnect();
          observerRef.current = null;
        }
      }
      // If user re-enables motion after first reveal, we don't re-observe (once is true)
    };

    mql.addEventListener('change', handleChange);

    // Check on mount
    if (mql.matches) {
      setIsRevealed(true);
    }

    return () => {
      mql.removeEventListener('change', handleChange);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // When isRevealed changes, toggle the CSS class on the target element
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    if (isRevealed) {
      el.classList.add('reveal-active');
    } else {
      el.classList.remove('reveal-active');
    }
  }, [isRevealed]);

  return { ref: setRef, isRevealed };
}
