/**
 * 點開繩上的結：結解開，垂下一張小籤紙 —— 第幾籤、籤等、籤名、哪天綁的，
 * 底下一行「看這支籤的記錄」（記錄還在才有）。再點一下結、點別處、按 Esc 就摺回去。
 * （設計：docs/superpowers/specs/2026-09-28-collection-and-knots-design.md）
 *
 * 鳥居那一層在所有內容後面（z-index -1），這張紙要蓋在內容上面，所以掛到 body 上，
 * 位置照打開那一刻結在頁面上的位置算（鳥居跟著頁面捲，所以用頁面座標，捲動時跟著走）。
 *
 * 籤紙上的字跟那一局的語言（紙說問題的語言）；日期和連結是機器說的話，跟界面。
 */

import { createPortal } from 'react-dom';
import { HTML_LANG } from '../../shared/lang';
import type { Knot } from '../../shared/knots';
import { stickByNo, stickText } from '../../shared/sticks';
import { LEVEL_TONE } from '../constants';
import { useT, useUiLanguage } from '../i18n';
import { listRecords } from '../storage';
import StickFace from './StickFace';

const SLIP_W = 232;

export default function KnotSlip(props: {
  knot: Knot;
  /** 結在頁面上的位置（getBoundingClientRect 加上捲動量） */
  anchor: { x: number; bottom: number };
  /** 「动画」關掉：直接垂下來，不解開 */
  calm: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const ui = useUiLanguage();
  const stick = stickByNo(props.knot.stickNo);
  if (!stick) return null;
  const language = props.knot.language ?? ui;
  const title = stickText(stick, language).title;
  const date = new Date(props.knot.at);
  const tied = Number.isNaN(date.getTime())
    ? ''
    : t('knotTied', { date: date.toLocaleDateString(HTML_LANG[ui], { month: 'short', day: 'numeric' }) });
  const hasRecord = Boolean(props.knot.readingId) && listRecords().some((r) => r.id === props.knot.readingId);
  const pageW = document.documentElement.clientWidth;
  const left = Math.max(12, Math.min(pageW - SLIP_W - 12, props.anchor.x - SLIP_W / 2));

  return createPortal(
    <div
      className={`knot-slip${props.calm ? ' calm' : ''}`}
      role="dialog"
      aria-label={title}
      data-tone={LEVEL_TONE[stick.level].key}
      style={{ top: props.anchor.bottom - 4, left, width: SLIP_W, ['--cord-x' as string]: `${props.anchor.x - left}px` }}
    >
      <span className="knot-slip-cord" aria-hidden />
      <div className="knot-slip-card">
        <StickFace stick={stick} language={language} size="small" />
        {tied && <span className="knot-slip-time">{tied}</span>}
        {hasRecord && (
          <a className="text-action knot-slip-link" href={`#history/${encodeURIComponent(props.knot.readingId!)}`} onClick={props.onClose}>
            {t('knotRecord')}
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}
