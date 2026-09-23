/**
 * 出籤瞬間的「金光微粒與落櫻綻放」慶祝特效（Sakura & Golden Bloom）。
 *
 * 當籤抽出定格、籤頭浮現號碼時觸發，從籤頭位置向外輕柔綻放一圈金色星芒與櫻花花瓣，
 * 伴隨空靈鈴聲，儀式感與萌感滿滿。
 */

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'sparkle' | 'petal';
  color: string;
}

export default function SakuraBloom(props: { active: boolean; reducedMotion?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!props.active || props.reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);

    // 綻放源頭：畫面中央偏上（籤頭特寫停靠的位置）
    const originX = width / 2;
    const originY = height * 0.28;

    const particles: Particle[] = [];
    const COUNT = 32;

    for (let i = 0; i < COUNT; i += 1) {
      const angle = (Math.PI * 2 * i) / COUNT + (Math.random() - 0.5) * 0.4;
      const speed = 1.6 + Math.random() * 3.2;
      const isSparkle = i % 2 === 0;

      particles.push({
        x: originX + (Math.random() - 0.5) * 20,
        y: originY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.85 - 1.2, // 初始帶有一點向上升騰力
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.08,
        size: isSparkle ? 2.5 + Math.random() * 3.5 : 5.5 + Math.random() * 4.5,
        alpha: 1,
        life: 0,
        maxLife: 60 + Math.floor(Math.random() * 45), // 約 1~1.8 秒
        kind: isSparkle ? 'sparkle' : 'petal',
        color: isSparkle
          ? Math.random() > 0.4 ? '#f5d580' : '#fff3d1'
          : Math.random() > 0.5 ? '#f8b5bc' : '#fa9ca7',
      });
    }

    const drawDiamond = (x: number, y: number, r: number, color: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.shadowColor = '#f5d070';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.4);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r * 1.4);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawPetal = (p: Particle) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha * 0.88;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      // 櫻花花瓣造型：五角心型頂端微凹
      const r = p.size;
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.8, -r * 0.8, r * 0.8, r * 0.3, 0, r);
      ctx.bezierCurveTo(-r * 0.8, r * 0.3, -r * 0.8, -r * 0.8, 0, -r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = 0;

      for (const p of particles) {
        p.life += 1;
        if (p.life >= p.maxLife) continue;
        alive += 1;

        // 物理更新：空氣阻力與緩緩重力下落
        p.vx *= 0.95;
        p.vy = p.vy * 0.95 + 0.06; // 輕微重力
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;

        // 淡出曲線
        const progress = p.life / p.maxLife;
        p.alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;

        if (p.kind === 'sparkle') {
          drawDiamond(p.x, p.y, p.size, p.color, p.alpha);
        } else {
          drawPetal(p);
        }
      }

      if (alive > 0) {
        animId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [props.active, props.reducedMotion]);

  if (!props.active || props.reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="sakura-bloom-canvas"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
