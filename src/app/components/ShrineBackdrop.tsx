/**
 * 神社的日光：兩側朱紅鳥居柱、角落櫻花枝、飄落的櫻花瓣。
 *
 * 純裝飾：fixed、pointer-events: none、aria-hidden，在所有內容後面。
 * 花瓣的位置由 shared/sakura.ts 用時間算（跟幀率無關）；這裡只負責畫。
 * 減少動畫時只畫一格靜止的花瓣、不跑 rAF；分頁看不見時停掉 rAF。
 */

import { useEffect, useRef } from 'react';
import { createPetals, petalAt, petalCount, type Petal } from '../../shared/sakura';
import {
  BRANCH_COLOR,
  BRANCH_FLOWERS,
  BRANCH_STROKES,
  BRANCH_VIEW,
  FLOWER_EYE,
  FLOWER_PINK,
  drawPetal,
} from '../shrineArt';

function SakuraBranch({ side }: { side: 'left' | 'right' }) {
  // 形狀跟分享圖共用（shrineArt.ts）；右邊那枝是左邊鏡像過去的
  return (
    <svg
      className={`shrine-branch ${side}`}
      viewBox={`0 0 ${BRANCH_VIEW.w} ${BRANCH_VIEW.h}`}
      aria-hidden
      style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}
    >
      {BRANCH_STROKES.map((st) => (
        <path key={st.d} d={st.d} stroke={BRANCH_COLOR} strokeWidth={st.width} fill="none" strokeLinecap="round" />
      ))}
      {BRANCH_FLOWERS.map(([cx, cy, r], i) => (
        <g key={i} transform={`translate(${cx} ${cy}) rotate(${i * 23})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.58} fill={FLOWER_PINK[i % 2]} transform={`rotate(${a})`} />
          ))}
          <circle r={r * 0.2} fill={FLOWER_EYE} />
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
