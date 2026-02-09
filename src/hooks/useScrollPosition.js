import { useState, useEffect, useRef } from 'react';

export function useScrollPosition() {
  const [isFolded, setIsFolded] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const checkScrollPosition = () => {
      if (window.scrollY > 100 && !isFolded) {
        setIsFolded(true);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (window.scrollY <= 100 && isFolded) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setIsFolded(false);
          timeoutRef.current = null;
        }, 5000);
      }
    };

    window.addEventListener('scroll', checkScrollPosition);
    checkScrollPosition();

    return () => {
      window.removeEventListener('scroll', checkScrollPosition);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isFolded]);

  return isFolded;
}
