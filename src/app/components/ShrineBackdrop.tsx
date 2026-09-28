/**
 * 神社的日光：一座框住畫面的鳥居（笠木、柱、貫、注連繩與紙垂）、角落櫻花枝、飄落的櫻花瓣。
 * 使用者：「神社的感覺可以更明顯」—— 以前只有兩根模糊的紅柱，看起來像紅條。
 *
 * 純裝飾：pointer-events: none、aria-hidden，在所有內容後面。日光與花瓣 fixed，鳥居與櫻花枝跟著頁面捲。
 * 花瓣的位置由 shared/sakura.ts 用時間算（跟幀率無關）；這裡只負責畫。
 * 減少動畫時只畫一格靜止的花瓣、不跑 rAF；分頁看不見時停掉 rAF。
 */

import { useEffect, useRef, useState } from 'react';
import { knotJitter, knotU, type Knot } from '../../shared/knots';
import { createPetals, petalAt, petalCount, type Petal } from '../../shared/sakura';
import { KNOTS_EVENT, listKnots } from '../storage';
import {
  BRANCH_COLOR,
  BRANCH_FLOWERS,
  BRANCH_STROKES,
  BRANCH_VIEW,
  FLOWER_EYE,
  FLOWER_PINK,
  ROPE_SAG,
  ROPE_Y0,
  SHIDE_AT,
  SHIDE_D,
  SHIDE_FOLDS_D,
  SHIDE_VIEW,
  TORII_KASAGI_D,
  TORII_KASAGI_VIEW,
  TORII_LACQUER,
  TORII_RED,
  TORII_SHIMAKI_D,
  drawPetal,
  ropeY,
} from '../shrineArt';

/**
 * 鳥居：黑色笠木（兩端上翹）＋朱紅島木，兩根柱子，一根貫，笠木與貫之間掛注連繩與紙垂。
 * 橫木全在繪馬上方（使用者：「中間輸入框跟神社打架」—— 以前注連繩與貫從繪馬後面穿過去）：
 * 由上而下 笠木＋島木 52～93px → 注連繩 96～104px → 貫 116～130px → 繪馬的紅繩從貫垂下 → 繪馬 156px。
 * 笠木、繩子用 preserveAspectRatio="none" 撐滿寬度：只在水平方向拉，弧線還是順的；
 * 紙垂不能被拉，另外用 HTML 定位。形狀跟分享圖共用（shrineArt.ts），尺寸寫在 styles.css。
 */
function Torii({ knots, fresh }: { knots: readonly Knot[]; fresh: string | null }) {
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
          <svg key={u} className="shide" viewBox={`0 0 ${SHIDE_VIEW.w} ${SHIDE_VIEW.h}`} style={{ left: `${u * 100}%`, top: ropeY(u) - 2 }} aria-hidden>
            <path className="shide-shadow" d={SHIDE_D} transform="translate(0.4 1.6)" />
            <path className="shide-body" d={SHIDE_D} />
            <path className="shide-folds" d={SHIDE_FOLDS_D} />
          </svg>
        ))}
        {knots.map((knot) => (
          <RopeKnot
            key={`${knot.slot}-${knot.at}`}
            knot={knot}
            fresh={fresh === `${knot.slot}-${knot.at}`}
            // 手機上繩子短，12 個結會疊成一團：只留最新的 6 個（CSS 看 data-older）
            older={knots.filter((other) => other.at > knot.at).length >= 6}
          />
        ))}
      </div>
      <svg
        className="torii-kasagi"
        viewBox={`0 0 ${TORII_KASAGI_VIEW.w} ${TORII_KASAGI_VIEW.h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={TORII_SHIMAKI_D} fill={TORII_RED} />
        <path d={TORII_KASAGI_D} fill="url(#kasagi-lacquer)" />
        <defs>
          <linearGradient id="kasagi-lacquer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={TORII_LACQUER[0]} />
            <stop offset="0.35" stopColor={TORII_LACQUER[1]} />
            <stop offset="1" stopColor={TORII_LACQUER[2]} />
          </linearGradient>
        </defs>
      </svg>
    </>
  );
}

/**
 * 結籤：綁在注連繩上的一支籤 —— 白紙摺成細條，繞繩一圈打結，兩尾垂下，結口一點朱紅。
 * 所有籤等長一樣（神社的繩上看不出誰抽到什麼）。歪斜是固定的（knotJitter），重新整理不會跳。
 * 位置跟紙垂用同一條繩的式子（ropeY）；剛綁上的那一個（fresh）啪地出現一下。
 */
/** 結的兩尾：長的一條垂下（邊上一道籤紙的朱紅框），短的一截斜斜翹出去 */
const KNOT_LONG_D = 'M7.6 6.5 L11.6 7 L10.4 33 L7.8 35.2 L6.2 32.6 Z';
const KNOT_SHORT_D = 'M11.2 5.6 L13.4 7.6 L17.8 17.6 L15.2 19.2 Z';

function RopeKnot({ knot, fresh, older }: { knot: Knot; fresh: boolean; older: boolean }) {
  const u = knotU(knot.slot);
  const { dy, rot } = knotJitter(knot);
  return (
    <svg
      className={`rope-knot${fresh ? ' fresh' : ''}`}
      data-older={older || undefined}
      viewBox="0 0 20 36"
      style={{ left: `${u * 100}%`, top: ropeY(u) - 5 + dy, ['--knot-rot' as string]: `${rot}deg` }}
      aria-hidden
    >
      {/* 單號的短尾翹向另一邊：一排結才不會像同一個印出來的 */}
      <g transform={knot.stickNo % 2 ? 'translate(20 0) scale(-1 1)' : undefined}>
      <g className="knot-shadow" transform="translate(0.6 1.5)">
        <path d={KNOT_LONG_D} />
        <path d={KNOT_SHORT_D} />
      </g>
      <path className="knot-paper" d={KNOT_SHORT_D} />
      <path className="knot-paper" d={KNOT_LONG_D} />
      <path className="knot-edge" d="M10.6 11 L9.5 30.5" />
      <path className="knot-crease" d="M7.4 17 L10.6 18.2 M7 24.5 L10.2 25.7" />
      <ellipse className="knot-paper" cx="10" cy="5.2" rx="4.4" ry="3.4" />
      <path className="knot-crease" d="M7.2 4.2 Q10 6.6 12.8 4.4" />
      </g>
    </svg>
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
  const [knots, setKnots] = useState<Knot[]>(listKnots);
  const [fresh, setFresh] = useState<string | null>(null);

  // 繩上的結換了（再求一籤綁上去、清掉本機資料）：重讀，剛多出來的那一個啪地出現
  useEffect(() => {
    let shown = new Set(listKnots().map((k) => `${k.slot}-${k.at}`));
    const reload = (): void => {
      const next = listKnots();
      const added = next.find((k) => !shown.has(`${k.slot}-${k.at}`));
      shown = new Set(next.map((k) => `${k.slot}-${k.at}`));
      setFresh(added ? `${added.slot}-${added.at}` : null);
      setKnots(next);
    };
    window.addEventListener(KNOTS_EVENT, reload);
    return () => window.removeEventListener(KNOTS_EVENT, reload);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const reduce = calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let petals: Petal[] = [];
    let w = 0;
    let h = 0;
    const fit = (): void => {
      // 桌機（寬 ≥ 900）一律 1× 解析度：整面畫布每秒重畫 30 次，Retina 上 2× 是 2880×1800，
      // 是閒置時最吃 GPU 的一塊，桌機一直卡就是它。花瓣本來就是軟邊小色塊，1× 看不出差別；
      // 手機畫布小，照舊最多 2×
      const dpr = window.innerWidth >= 900 ? 1 : Math.min(2, window.devicePixelRatio || 1);
      const widthChanged = window.innerWidth !== w;
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 手機捲動時網址列收合，只有高度在變、一直發 resize：花瓣留著原來那一批，
      // 不然每收一次就整批重生、在畫面上閃一下
      if (widthChanged || petals.length === 0) petals = createPetals(petalCount(w), 7);
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
    // 花瓣飄得慢，每秒 30 格就夠順；整面、兩倍解析度的畫布每格重畫，是手機上最便宜能省下的一塊
    let painted = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      if (now - painted < 30) return;
      painted = now;
      paint((now - t0) / 1000);
    };
    const start = (): void => {
      cancelAnimationFrame(raf);
      if (reduce) paint(0);
      else if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const onResize = (): void => {
      fit();
      // 改尺寸會清空畫布：當場補畫，不要等下一格，才不會空一下
      paint((performance.now() - t0) / 1000);
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
        <Torii knots={knots} fresh={fresh} />
        <SakuraBranch side="left" />
        <SakuraBranch side="right" />
      </div>
      <div className="shrine" aria-hidden>
        <canvas ref={canvasRef} className="shrine-petals" />
      </div>
    </>
  );
}
