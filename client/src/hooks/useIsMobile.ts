import { useEffect, useState } from 'react';

// True for narrow OR coarse-pointer (touch) viewports.
export function useIsMobile(): boolean {
  const query = '(max-width: 640px), (pointer: coarse)';
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return match;
}
