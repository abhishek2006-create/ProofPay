'use client';

import { useEffect, useRef } from 'react';
import HeroModel from './hero-model';

/** One persistent WebGL viewer; lightweight observers reveal the sections above it. */
export default function ImmersiveScene({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const reveals = element.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' },
    );
    const configure = () => {
      if (motion.matches) {
        element.classList.remove('motion-ready');
        reveals.forEach((item) => observer.unobserve(item));
      } else {
        element.classList.add('motion-ready');
        reveals.forEach((item) => observer.observe(item));
      }
    };
    configure();
    motion.addEventListener('change', configure);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', configure);
    };
  }, []);
  return (
    <div className="cinema immersive-scene" ref={root}>
      <HeroModel />
      {children}
    </div>
  );
}
