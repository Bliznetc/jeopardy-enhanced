import { useCallback, useEffect, useState } from 'react';

export function useFullscreen() {
  const [active, setActive] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* fullscreen denied/unsupported — ignore */
    }
  }, []);
  return { active, toggle };
}
