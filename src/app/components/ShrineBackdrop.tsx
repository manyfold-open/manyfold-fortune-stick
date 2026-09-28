/**
 * 神社的日光：一座框住畫面的鳥居（笠木、柱、貫、注連繩與紙垂）、角落櫻花枝、飄落的櫻花瓣。
 * 使用者：「神社的感覺可以更明顯」—— 以前只有兩根模糊的紅柱，看起來像紅條。
 *
 * 純裝飾：pointer-events: none、aria-hidden，在所有內容後面。日光與花瓣 fixed，鳥居與櫻花枝跟著頁面捲。
 * 花瓣的位置由 shared/sakura.ts 用時間算（跟幀率無關）；這裡只負責畫。
 * 減少動畫時只畫一格靜止的花瓣、不跑 rAF；分頁看不見時停掉 rAF。
 */

import { useEffect, useRef, useState } from 'react';
import { glowKnots, peekOnTie } from '../../shared/knot-hint';
import { knotJitter, knotU, type Knot } from '../../shared/knots';
import { createPetals, petalAt, petalCount, type Petal } from '../../shared/sakura';
import { track } from '../analytics';
import { KNOTS_EVENT, getKnotHint, listKnots, markKnotPeeked, markKnotSeen } from '../storage';
import KnotSlip from './KnotSlip';
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
const knotKey = (knot: Knot): string => `${knot.slot}-${knot.at}`;

function Torii({
  knots,
  fresh,
  open,
  glow,
  calm,
}: {
  knots: readonly Knot[];
  fresh: string | null;
  open: string | null;
  glow: boolean;
  calm: boolean;
}) {
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
          {/* 結上的微光用的漸層。畫在這根一定看得見的繩上，藏起來的舊結（手機）才不會拿不到它 */}
          <defs>
            <radialGradient id="knot-halo">
              <stop offset="0" stopColor="#ffc95c" stopOpacity="0.85" />
              <stop offset="0.55" stopColor="#ffc95c" stopOpacity="0.32" />
              <stop offset="1" stopColor="#ffc95c" stopOpacity="0" />
            </radialGradient>
          </defs>
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
            key={knotKey(knot)}
            knot={knot}
            fresh={fresh === knotKey(knot)}
            untied={open === knotKey(knot)}
            glow={glow}
            calm={calm}
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

function RopeKnot({
  knot,
  fresh,
  older,
  untied,
  glow,
  calm,
}: {
  knot: Knot;
  fresh: boolean;
  older: boolean;
  untied: boolean;
  glow: boolean;
  calm: boolean;
}) {
  const u = knotU(knot.slot);
  const { dy, rot } = knotJitter(knot);
  return (
    <svg
      className={`rope-knot${fresh ? ' fresh' : ''}${untied ? ' untied' : ''}`}
      data-older={older || undefined}
      data-knot={knotKey(knot)}
      viewBox="0 0 20 36"
      style={{ left: `${u * 100}%`, top: ropeY(u) - 5 + dy, ['--knot-rot' as string]: `${rot}deg` }}
      aria-hidden
    >
      {/* 還沒人點開過結：結周圍一圈慢慢呼吸的微光，告訴人這裡可以點（規則在 shared/knot-hint.ts）。
          用 SMIL 而不是 CSS 動畫，才不會跟結自己的晃動、啪地冒出來打架；減少動畫時就是不動的一圈 */}
      {glow && (
        <ellipse className="knot-halo" cx="10" cy="17" rx="17" ry="23" fill="url(#knot-halo)" opacity={calm ? 0.7 : undefined}>
          {!calm && <animate attributeName="opacity" values="0.3;0.95;0.3" dur="3.2s" repeatCount="indefinite" />}
        </ellipse>
      )}
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
  /** 結上的微光：直到這位使用者親手點開過一個結 */
  const [glow, setGlow] = useState(() => glowKnots(getKnotHint()));
  /** 點開的那個結，與它在頁面上的位置 */
  const [open, setOpen] = useState<{ key: string; anchor: { x: number; bottom: number } } | null>(null);
  const openKey = useRef<string | null>(null);
  openKey.current = open?.key ?? null;

  /*
   * 點結。鳥居在所有內容後面，結常常被一層透明的版面容器蓋住、收不到點擊，所以在 document 上聽：
   * 點的地方靠近一個結（至少 44px 見方的範圍），而且那裡沒有按鈕、輸入框、籤筒，
   * 也沒有被看得見的東西（繪馬、籤紙這種有底色的）擋住，就算點到它。
   * 只有滑鼠經過時也照同一套規則換成手指游標。
   */
  useEffect(() => {
    const INTERACTIVE = 'a, button, input, textarea, select, label, [contenteditable], canvas, .knot-slip';
    const opaque = (el: Element): boolean => {
      if (el instanceof HTMLCanvasElement || el instanceof HTMLImageElement) return true;
      const cs = getComputedStyle(el);
      return (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none';
    };
    const hit = (x: number, y: number, target: EventTarget | null): SVGSVGElement | null => {
      if (target instanceof Element && target.closest(INTERACTIVE)) return null;
      let best: SVGSVGElement | null = null;
      let bestD = Infinity;
      document.querySelectorAll<SVGSVGElement>('.rope-knot').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return; // 手機上藏起來的舊結
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (Math.abs(x - cx) > Math.max(22, r.width / 2 + 4) || Math.abs(y - cy) > Math.max(22, r.height / 2 + 4)) return;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          bestD = d;
          best = el;
        }
      });
      if (!best) return null;
      // 被繪馬、籤紙這些看得見的東西擋住：點的是那個東西，不是後面的結
      const found: SVGSVGElement = best;
      const r = found.getBoundingClientRect();
      for (const el of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
        if (el === found || found.contains(el) || el.closest('.shrine-torii')) break;
        if (el === document.body || el === document.documentElement) break;
        if (opaque(el)) return null;
      }
      return found;
    };
    const onClick = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('.knot-slip')) return;
      const el = hit(event.clientX, event.clientY, event.target);
      const key = el?.dataset.knot ?? null;
      if (!el || !key || key === openKey.current) {
        if (openKey.current) setOpen(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setOpen({ key, anchor: { x: r.left + r.width / 2 + window.scrollX, bottom: r.bottom + window.scrollY } });
      // 親手點開才算知道了：自動解開不算。微光與自動解開從此停止
      markKnotSeen();
      setGlow(false);
      track('knot_opened');
    };
    let hovering = false;
    const onMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      const over = hit(event.clientX, event.clientY, event.target) !== null;
      if (over === hovering) return;
      hovering = over;
      document.documentElement.classList.toggle('knot-hover', over);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && openKey.current) setOpen(null);
    };
    const close = (): void => setOpen(null);
    document.addEventListener('click', onClick);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('hashchange', close);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('hashchange', close);
      document.documentElement.classList.remove('knot-hover');
    };
  }, []);

  // 繩上的結換了（再求一籤綁上去、清掉本機資料）：重讀，剛多出來的那一個啪地出現
  useEffect(() => {
    let shown = new Set(listKnots().map((k) => `${k.slot}-${k.at}`));
    let autoOpen = 0;
    let autoClose = 0;
    const reload = (event: Event): void => {
      const next = listKnots();
      const added = next.find((k) => !shown.has(`${k.slot}-${k.at}`));
      shown = new Set(next.map((k) => `${k.slot}-${k.at}`));
      setFresh(added ? `${added.slot}-${added.at}` : null);
      setKnots(next);
      const hint = getKnotHint();
      setGlow(glowKnots(hint));
      // 隔天回來自動結的那一支：冒出來之後自己解開，給人看一眼「昨天那支在這裡」，
      // 順便讓人知道結點得開。五秒後摺回去；點任何地方也會收起。
      // 從沒點過結的人，第一次自己打的結也一樣解開一下（只一次；之後靠微光）
      const openId = (event as CustomEvent<{ open?: string }>).detail?.open;
      const target = openId
        ? next.find((k) => k.readingId === openId)
        : added && peekOnTie(hint)
          ? added
          : undefined;
      if (!target) return;
      if (!hint.seen) markKnotPeeked();
      const key = knotKey(target);
      window.clearTimeout(autoOpen);
      window.clearTimeout(autoClose);
      autoOpen = window.setTimeout(() => {
        const el = document.querySelector<SVGSVGElement>(`.rope-knot[data-knot="${key}"]`);
        const r = el?.getBoundingClientRect();
        if (!r || r.width === 0) return;
        setOpen({ key, anchor: { x: r.left + r.width / 2 + window.scrollX, bottom: r.bottom + window.scrollY } });
        autoClose = window.setTimeout(() => setOpen((now) => (now?.key === key ? null : now)), 5000);
      }, calm ? 0 : 700);
    };
    window.addEventListener(KNOTS_EVENT, reload);
    return () => {
      window.removeEventListener(KNOTS_EVENT, reload);
      window.clearTimeout(autoOpen);
      window.clearTimeout(autoClose);
    };
  }, [calm]);

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

  const openKnot = open ? knots.find((knot) => knotKey(knot) === open.key) : undefined;

  return (
    <>
      {/* 三層：日光（fixed）→ 鳥居與櫻花枝（跟著頁面捲走）→ 花瓣（fixed）。
          鳥居如果也 fixed，解籤頁往下捲時繪馬與籤紙滑過去、橫木留在原地，繪馬的繩子就掛在空中；
          櫻花枝壓在笠木上，是同一個場景，跟著鳥居走 */}
      <div className="shrine" aria-hidden>
        <div className="shrine-light" />
      </div>
      <div className="shrine-torii" aria-hidden>
        <Torii knots={knots} fresh={fresh} open={open?.key ?? null} glow={glow} calm={calm} />
        <SakuraBranch side="left" />
        <SakuraBranch side="right" />
      </div>
      <div className="shrine" aria-hidden>
        <canvas ref={canvasRef} className="shrine-petals" />
      </div>
      {openKnot && open && <KnotSlip knot={openKnot} anchor={open.anchor} calm={calm} onClose={() => setOpen(null)} />}
    </>
  );
}
