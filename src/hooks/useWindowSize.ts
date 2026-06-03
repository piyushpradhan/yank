import { useEffect, useState } from 'react';

export interface WindowSize {
  width: number;
  height: number;
}

function read(): WindowSize {
  if (typeof window === 'undefined') return { width: 1024, height: 768 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>(read);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize(read()));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return size;
}

export const BREAKPOINTS = {
  xs: 520,
  sm: 680,
  md: 820,
  lg: 1024,
} as const;
