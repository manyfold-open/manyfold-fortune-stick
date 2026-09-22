import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  vx: number;
  vy: number;
  swayAmp: number;
  swayFreq: number;
}

export default function AmbientMotes(props: { reducedMotion?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (props.reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const COUNT = 32;
    const particles: Particle[] = [];

    const resetParticle = (p: Partial<Particle> = {}): Particle => {
      const w = width || window.innerWidth;
      const h = height || window.innerHeight;
      return {
        x: p.x ?? Math.random() * w,
        y: p.y ?? Math.random() * h,
        r: 0.7 + Math.random() * 1.5,
        baseAlpha: 0.12 + Math.random() * 0.32,
        twinkleSpeed: 0.008 + Math.random() * 0.016,
        twinklePhase: Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.45) * 0.22,
        vy: -0.12 - Math.random() * 0.2, // gentle upward drift like dust in a warm beam
        swayAmp: 0.2 + Math.random() * 0.4,
        swayFreq: 0.005 + Math.random() * 0.01,
      };
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      if (particles.length === 0) {
        for (let i = 0; i < COUNT; i += 1) {
          particles.push(resetParticle());
        }
      }
    };

    resize();
    window.addEventListener('resize', resize);

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(time - lastTime, 64);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // Extract current lamp spotlight position if available in CSS variable
      const style = getComputedStyle(document.documentElement);
      const lampXStr = style.getPropertyValue('--lamp-x').trim();
      const lampYStr = style.getPropertyValue('--lamp-y').trim();
      const lampX = (parseFloat(lampXStr) || 43) * 0.01 * width;
      const lampY = (parseFloat(lampYStr) || 28) * 0.01 * height;
      const spotRadius = Math.max(width, height) * 0.5;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];

        p.twinklePhase += p.twinkleSpeed * (dt / 16.6);
        const sway = Math.sin(time * p.swayFreq + i) * p.swayAmp;
        p.x += (p.vx + sway) * (dt / 16.6);
        p.y += p.vy * (dt / 16.6);

        // Wrap around gracefully
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }

        // Proximity to the lamp spotlight boosts visibility
        const distToLamp = Math.hypot(p.x - lampX, p.y - lampY);
        const lampFactor = Math.max(0.2, 1 - distToLamp / spotRadius);

        const twinkle = 0.65 + 0.35 * Math.sin(p.twinklePhase);
        const alpha = p.baseAlpha * twinkle * lampFactor;

        if (alpha > 0.01) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 238, 195, ${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    let isVisible = true;
    const onVisibilityChange = () => {
      if (document.hidden) {
        isVisible = false;
        cancelAnimationFrame(animId);
      } else if (!isVisible) {
        isVisible = true;
        lastTime = performance.now();
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [props.reducedMotion]);

  if (props.reducedMotion) return null;

  return <canvas ref={canvasRef} className="ambient-motes" aria-hidden="true" />;
}
