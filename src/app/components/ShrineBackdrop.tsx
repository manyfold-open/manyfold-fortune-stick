/**
 * 神社的日光：兩側朱紅鳥居柱、角落櫻花枝、飄落的櫻花瓣。
 *
 * 純裝飾：fixed、pointer-events: none、aria-hidden，在所有內容後面。
 * 花瓣的位置由 shared/sakura.ts 用時間算（跟幀率無關）；這裡只負責畫。
 * 減少動畫時只畫一格靜止的花瓣、不跑 rAF；分頁看不見時停掉 rAF。
 */

import { useEffect, useRef } from 'react';
import { createPetals, petalAt, petalCount, type Petal } from '../../shared/sakura';

const PINK_HI = '#fde3ea';
const PINK_LO = '#f19fb3';

/** 一片櫻花瓣：尖端有個小缺口，原點在中心，長邊沿 y。 */
function drawPetal(g: CanvasRenderingContext2D, s: number): void {
  const w = s * 0.62;
  const h = s;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.bezierCurveTo(w * 0.9, h * 0.25, w * 0.75, -h * 0.45, w * 0.18, -h / 2);
  g.lineTo(0, -h * 0.36);
  g.lineTo(-w * 0.18, -h / 2);
  g.bezierCurveTo(-w * 0.75, -h * 0.45, -w * 0.9, h * 0.25, 0, h / 2);
  g.closePath();
  const grad = g.createLinearGradient(0, h / 2, 0, -h / 2);
  grad.addColorStop(0, PINK_LO);
  grad.addColorStop(1, PINK_HI);
  g.fillStyle = grad;
  g.fill();
  // 一圈淡淡的深粉邊：沒有它，花瓣在奶油底上會糊掉
  g.strokeStyle = 'rgba(212, 110, 136, 0.55)';
  g.lineWidth = 0.8;
  g.stroke();
}

function SakuraBranch({ side }: { side: 'left' | 'right' }) {
  // 右邊那枝是左邊鏡像過去的
  const flowers: Array<[number, number, number]> = [
    [70, 58, 15], [118, 40, 12], [150, 88, 14], [205, 60, 11], [42, 104, 12], [236, 104, 9],
  ];
  return (
    <svg
      className={`shrine-branch ${side}`}
      viewBox="0 0 280 180"
      aria-hidden
      style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M-10 20 C 60 34, 120 30, 170 62 S 250 96, 282 118" stroke="#6b4a36" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M96 38 C 110 58, 130 70, 150 88" stroke="#6b4a36" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M40 30 C 44 60, 42 84, 42 104" stroke="#6b4a36" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {flowers.map(([cx, cy, r], i) => (
        <g key={i} transform={`translate(${cx} ${cy}) rotate(${i * 23})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.58} fill={i % 2 ? '#f7c6d1' : '#fbd9e0'} transform={`rotate(${a})`} />
          ))}
          <circle r={r * 0.2} fill="#d9576f" />
        </g>
      ))}
    </svg>
  );
}

export default function ShrineBackdrop({ calm }: { calm: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const reduce = calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let petals: Petal[] = [];
    let w = 0;
    let h = 0;
    const fit = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      petals = createPetals(petalCount(w), 7);
    };
    const paint = (t: number): void => {
      g.clearRect(0, 0, w, h);
      for (const p of petals) {
        const s = petalAt(p, t, w, h);
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.rot);
        g.scale(Math.max(0.12, Math.abs(s.flip)), 1);
        g.globalAlpha = 0.95;
        drawPetal(g, s.size);
        g.restore();
      }
    };
    fit();
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number): void => {
      paint((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    const start = (): void => {
      cancelAnimationFrame(raf);
      if (reduce) paint(0);
      else if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const onResize = (): void => {
      fit();
      start();
    };
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [calm]);

  return (
    <div className="shrine" aria-hidden>
      <div className="shrine-light" />
      <div className="shrine-pillar left" />
      <div className="shrine-pillar right" />
      <SakuraBranch side="left" />
      <SakuraBranch side="right" />
      <canvas ref={canvasRef} className="shrine-petals" />
    </div>
  );
}
