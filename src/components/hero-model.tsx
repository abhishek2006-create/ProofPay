'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type Vector = [number, number, number];
type Camera = { position: Vector; target: Vector };
type Viewer = {
  start: () => void;
  stop: () => void;
  addEventListener: (event: 'viewerready', callback: () => void) => void;
  getCameraLookAt: (callback: (error: unknown, camera: Camera) => void) => void;
  setCameraLookAt: (position: Vector, target: Vector, duration: number) => void;
  setUserInteraction: (enabled: boolean) => void;
};
type SketchfabConstructor = new (iframe: HTMLIFrameElement) => {
  init: (
    id: string,
    options: Record<string, unknown> & {
      success: (api: Viewer) => void;
      error: () => void;
    },
  ) => void;
};

const MODEL = '6f0e7dd329f74a23b0ce2cf647d74f95';

export default function HeroModel() {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    const Sketchfab = (window as unknown as { Sketchfab?: SketchfabConstructor }).Sketchfab;
    if (!sdkReady || !frame.current || !Sketchfab) return;
    let active = true;
    let api: Viewer | undefined;
    let camera: Camera | undefined;
    let animation = 0;
    let visible = true;
    let progress = 0;
    let target = 0;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hero = document.getElementById('proofpay-hero');
    const update = () => {
      animation = 0;
      if (!active || !visible || !camera || !api || motion.matches || document.hidden) return;
      progress += (target - progress) * 0.12;
      const angle = progress * Math.PI * 1.25;
      const [x, y, z] = camera.position.map((value, i) => value - camera!.target[i]);
      // Orbit the actual 3D camera around Sketchfab's Z-up scene, not the iframe.
      api.setCameraLookAt(
        [
          camera.target[0] + x * Math.cos(angle) - y * Math.sin(angle),
          camera.target[1] + x * Math.sin(angle) + y * Math.cos(angle),
          camera.target[2] + z,
        ],
        camera.target,
        0,
      );
      if (Math.abs(target - progress) > 0.0005) animation = requestAnimationFrame(update);
    };
    const schedule = () => {
      if (hero) {
        const rect = hero.getBoundingClientRect();
        const heroProgress = Math.max(0, Math.min(1, -rect.top / rect.height));
        target = Math.max(
          0,
          Math.min(
            1,
            window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight),
          ),
        );
        container.current?.style.setProperty('--scene-opacity', String(0.85 - heroProgress * 0.58));
        container.current?.style.setProperty(
          '--atmosphere-y',
          `${motion.matches ? 0 : heroProgress * -45}px`,
        );
      }
      if (!animation && visible && !motion.matches) animation = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else {
        cancelAnimationFrame(animation);
        animation = 0;
      }
    });
    if (container.current) observer.observe(container.current);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', schedule);
    const timeout = window.setTimeout(() => {
      if (active) setStatus('unavailable');
    }, 25000);
    new Sketchfab(frame.current).init(MODEL, {
      autostart: 1,
      preload: 1,
      autospin: 0,
      camera: 0,
      ui_controls: 0,
      ui_infos: 0,
      ui_hint: 0,
      ui_stop: 0,
      success(viewer) {
        if (!active) return;
        api = viewer;
        viewer.addEventListener('viewerready', () => {
          if (!active) return;
          clearTimeout(timeout);
          viewer.setUserInteraction(false);
          viewer.getCameraLookAt((error, initial) => {
            if (!active) return;
            if (!error) camera = initial;
            setStatus('ready');
            schedule();
          });
        });
        viewer.start();
      },
      error() {
        if (active) {
          clearTimeout(timeout);
          setStatus('unavailable');
        }
      },
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      cancelAnimationFrame(animation);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
      motion.removeEventListener('change', schedule);
      api?.stop();
    };
  }, [sdkReady]);

  return (
    <>
      <Script
        src="https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js"
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
        onError={() => setStatus('unavailable')}
      />
      <div ref={container} className={`hero-model ${status}`} aria-hidden="true">
        <div className="hero-model-aura" />
        <iframe
          ref={frame}
          title="Torus Explosion — decorative 3D hero background"
          allow="autoplay; fullscreen"
          tabIndex={-1}
        />
        <div className="hero-model-shade" />
      </div>
      <a
        className="hero-model-credit"
        href="https://sketchfab.com/3d-models/torus-explosion-6f0e7dd329f74a23b0ce2cf647d74f95"
        target="_blank"
        rel="noopener noreferrer"
      >
        Torus Explosion · tamminen / Sketchfab ↗
      </a>
    </>
  );
}
