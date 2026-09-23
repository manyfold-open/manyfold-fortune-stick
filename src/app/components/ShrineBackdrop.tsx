/**
 * 神社的日光：一座框住畫面的鳥居（笠木、柱、貫、注連繩與紙垂）、角落櫻花枝、飄落的櫻花瓣。
 * 使用者：「神社的感覺可以更明顯」—— 以前只有兩根模糊的紅柱，看起來像紅條。
 *
 * 純裝飾：pointer-events: none、aria-hidden，在所有內容後面。日光與花瓣 fixed，鳥居與櫻花枝跟著頁面捲。
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

/**
 * 注連繩的下垂：二次 Bézier 控制點在正中，x 對 t 是線性的，所以 y 直接寫成 u 的拋物線。
 * 紙垂要掛在繩子上，位置得跟 SVG 裡那條繩子用同一條式子算。
 */
const ROPE_Y0 = 8;
const ROPE_SAG = 8;
const ropeY = (u: number): number => ROPE_Y0 + 4 * ROPE_SAG * u * (1 - u);
/** 紙垂掛在繩上的位置（繩長的比例）。只掛兩旁：正中是繪馬的紅繩垂下來的地方 */
const SHIDE_AT = [0.1, 0.24, 0.76, 0.9];

/**
 * 鳥居：黑色笠木（兩端上翹）＋朱紅島木，兩根柱子，一根貫，笠木與貫之間掛注連繩與紙垂。
 * 橫木全在繪馬上方（使用者：「中間輸入框跟神社打架」—— 以前注連繩與貫從繪馬後面穿過去）：
 * 由上而下 笠木＋島木 52～93px → 注連繩 96～104px → 貫 116～130px → 繪馬的紅繩從貫垂下 → 繪馬 156px。
 * 笠木、繩子用 preserveAspectRatio="none" 撐滿寬度：只在水平方向拉，弧線還是順的；
 * 紙垂不能被拉，另外用 HTML 定位。
 */
function Torii() {
  return (
    <>
      <div className="torii-nuki" />
      <div className="shrine-pillar left" />
      <div className="shrine-pillar right" />
      <div className="shimenawa">
        <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden>
          <path d={`M0 ${ROPE_Y0} Q500 ${ROPE_Y0 + 2 * ROPE_SAG} 1000 ${ROPE_Y0}`} className="rope-under" vectorEffect="non-scaling-stroke" />
          <path d={`M0 ${ROPE_Y0} Q500 ${ROPE_Y0 + 2 * ROPE_SAG} 1000 ${ROPE_Y0}`} className="rope" vectorEffect="non-scaling-stroke" />
          <path d={`M0 ${ROPE_Y0} Q500 ${ROPE_Y0 + 2 * ROPE_SAG} 1000 ${ROPE_Y0}`} className="rope-twist" vectorEffect="non-scaling-stroke" />
        </svg>
        {SHIDE_AT.map((u) => (
          <svg key={u} className="shide" viewBox="0 0 14 38" style={{ left: `${u * 100}%`, top: ropeY(u) - 2 }} aria-hidden>
            {/* 一條紙摺成閃電形：一格一格左右錯開往下 */}
            <path d="M6 0h2v5h-2z M5 4h8v8h-8z M1 11h8v8h-8z M5 18h8v8h-8z M1 25h8v8h-8z M5 32h6l-3 5z" />
          </svg>
        ))}
      </div>
      <svg className="torii-kasagi" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden>
        {/* 島木：朱紅，貼在笠木下緣 */}
        <path d="M0 12 C150 26 350 32 500 32 C650 32 850 26 1000 12 L1000 21 C850 35 650 41 500 41 C350 41 150 35 0 21 Z" fill="#b8321f" />
        {/* 笠木：黑漆，中間厚、兩端薄而上翹 */}
        <path d="M0 0 C150 10 350 12 500 12 C650 12 850 10 1000 0 L1000 12 C850 26 650 32 500 32 C350 32 150 26 0 12 Z" fill="url(#kasagi-lacquer)" />
        <defs>
          <linearGradient id="kasagi-lacquer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a372d" />
            <stop offset="0.35" stopColor="#2c211c" />
            <stop offset="1" stopColor="#1f1713" />
          </linearGradient>
        </defs>
      </svg>
    </>
  );
}

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
    <>
      {/* 三層：日光（fixed）→ 鳥居與櫻花枝（跟著頁面捲走）→ 花瓣（fixed）。
          鳥居如果也 fixed，解籤頁往下捲時繪馬與籤紙滑過去、橫木留在原地，繪馬的繩子就掛在空中；
          櫻花枝壓在笠木上，是同一個場景，跟著鳥居走 */}
      <div className="shrine" aria-hidden>
        <div className="shrine-light" />
      </div>
      <div className="shrine-torii" aria-hidden>
        <Torii />
        <SakuraBranch side="left" />
        <SakuraBranch side="right" />
      </div>
      <div className="shrine" aria-hidden>
        <canvas ref={canvasRef} className="shrine-petals" />
      </div>
    </>
  );
}
