import { useEffect, useRef, useState } from 'react';

const FOLD_THRESHOLD = 100;
const UNFOLD_DELAY_MS = 5000;

export function useScrollPosition(): boolean {
  const [isFolded, setIsFolded] = useState(false);
  const isFoldedRef = useRef(false);
  const unfoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearUnfoldTimeout = () => {
      if (!unfoldTimeoutRef.current) return;
      clearTimeout(unfoldTimeoutRef.current);
      unfoldTimeoutRef.current = null;
    };

    const setFolded = (nextValue: boolean) => {
      if (isFoldedRef.current === nextValue) return;
      isFoldedRef.current = nextValue;
      setIsFolded(nextValue);
    };

    const updateFoldState = () => {
      if (window.scrollY > FOLD_THRESHOLD) {
        clearUnfoldTimeout();
        setFolded(true);
        return;
      }

      if (!isFoldedRef.current || unfoldTimeoutRef.current) return;
      unfoldTimeoutRef.current = setTimeout(() => {
        unfoldTimeoutRef.current = null;
        setFolded(false);
      }, UNFOLD_DELAY_MS);
    };

    window.addEventListener('scroll', updateFoldState, { passive: true });
    updateFoldState();

    return () => {
      window.removeEventListener('scroll', updateFoldState);
      clearUnfoldTimeout();
    };
  }, []);

  return isFolded;
}
