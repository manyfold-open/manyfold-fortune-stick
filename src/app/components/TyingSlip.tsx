/**
 * 結籤的那一飛：按「再求一籤」時，籤紙從它原本的位置收窄成一條紙條，飛上注連繩打結。
 * （設計：docs/superpowers/specs/2026-09-28-collection-and-knots-design.md）
 *
 * 結果頁在換頁的同一刻就卸載了，所以飛的這張不能掛在結果頁裡：掛到 body 上、固定定位，
 * 從量好的籤紙位置飛到繩上那一格。到位時叫 onLanded —— 那時候繩上的結才冒出來。
 * 求籤畫面在起飛時就已經換好，使用者不用等它飛完才能寫下一個問題。
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface Flight {
  /** 籤紙起飛時在畫面上的位置 */
  from: { top: number; left: number; width: number; height: number };
  /** 繩上那一格（畫面座標），結的上緣 */
  to: { x: number; y: number };
}

const FLIGHT_MS = 1150;
/** 繩上的結多大（跟 .rope-knot 一樣） */
const KNOT = { w: 20, h: 36 };

export default function TyingSlip({ flight, onLanded }: { flight: Flight; onLanded: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useEffect(() => {
    const el = ref.current;
    let done = false;
    const land = (): void => {
      if (done) return;
      done = true;
      landed.current();
    };
    // 分頁在背景時動畫可能不跑完：時間到了就當它到了，繩上的結不能等不到
    const fallback = window.setTimeout(land, FLIGHT_MS + 400);
    if (!el || typeof el.animate !== 'function') {
      land();
      return () => window.clearTimeout(fallback);
    }
    const { from, to } = flight;
    const dx = to.x - (from.left + from.width / 2);
    const dy = to.y + KNOT.h / 2 - (from.top + from.height / 2);
    const sx = KNOT.w / from.width;
    const sy = KNOT.h / from.height;
    const animation = el.animate(
      [
        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
        // 摺起來：往橫向收成一條，稍微往上提
        { offset: 0.3, transform: 'translate(0px, -12px) scale(0.1, 0.94)', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        // 飛上去：路上縮成結那麼大，到了多衝一點點
        { offset: 0.86, transform: `translate(${dx}px, ${dy - 4}px) scale(${sx * 1.15}, ${sy * 1.15})`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
      ],
      { duration: FLIGHT_MS, fill: 'forwards' },
    );
    animation.onfinish = land;
    return () => {
      window.clearTimeout(fallback);
      animation.onfinish = null;
    };
  }, [flight]);

  return createPortal(
    <div
      ref={ref}
      className="tying-slip"
      style={{ top: flight.from.top, left: flight.from.left, width: flight.from.width, height: flight.from.height }}
      aria-hidden
    >
      <span className="tying-slip-seal" />
    </div>,
    document.body,
  );
}
