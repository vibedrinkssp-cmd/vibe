import { useEffect, useState } from 'react';

/**
 * Tracks `window.visualViewport.height` so layouts can shrink when the mobile
 * keyboard opens. Returns 0 during SSR / before first measurement so callers
 * can fall back to CSS units (e.g. 100dvh) until the value is known.
 */
export function useVisualViewportHeight(offsetPx = 0): number {
  const [h, setH] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return (window.visualViewport?.height ?? window.innerHeight ?? 0);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const measure = () => {
      const next = vv?.height ?? window.innerHeight ?? 0;
      setH(next);
    };
    measure();
    if (vv) {
      vv.addEventListener('resize', measure);
      vv.addEventListener('scroll', measure);
    }
    window.addEventListener('resize', measure);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', measure);
        vv.removeEventListener('scroll', measure);
      }
      window.removeEventListener('resize', measure);
    };
  }, []);

  return h > 0 ? Math.max(0, h - offsetPx) : 0;
}
