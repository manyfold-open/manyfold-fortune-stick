/**
 * 正统宫庙 3D 朱砂生漆问签筒（Fortune Cylinder）。
 *
 * 忠实还原传统寺庙「问签」漆筒（朱砂红漆、描金「问签」隶楷、如意金祥云纹与满筒红头楠竹签条）。
 * 具备真实的摇签抖动动效、竹木签条起伏跳跃、以及最终一签探出筒身的仪式感。
 */

import { useMemo } from 'react';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import { LEVEL_TONE } from '../constants';

export interface FortuneCylinderProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  onShake: () => void;
  disabled?: boolean;
}

interface StickConfig {
  id: number;
  leftPercent: number;
  heightPx: number;
  rotateDeg: number;
  zTier: 'back' | 'mid' | 'front';
  notchType: 1 | 2;
}

export default function FortuneCylinder(props: FortuneCylinderProps) {
  const { state, sheet, fault, language, onShake, disabled } = props;
  const en = language === 'en';
  const shaking = state === 'shaking';
  const ejecting = state === 'ejecting';

  // 固定的 32 支竹签几何散布（丰富扇形群落，高低错落有致）
  const sticks: StickConfig[] = useMemo(() => {
    const list: StickConfig[] = [];
    const total = 32;
    for (let i = 0; i < total; i++) {
      const p = i / (total - 1);
      // 左右呈饱满扇形聚散
      const left = 8 + p * 84;
      // 中间高、两侧渐低，加上有机杂落感
      const arch = Math.sin(p * Math.PI) * 24;
      const jitter = ((i * 23) % 15) - 7;
      const baseH = 192 + arch + jitter;
      // 角度由内向外自然微倾（-14deg ~ +14deg）
      const rot = (p - 0.5) * 24 + (((i * 7) % 7) - 3);
      const tier: 'back' | 'mid' | 'front' = i % 3 === 0 ? 'back' : i % 3 === 1 ? 'mid' : 'front';
      list.push({
        id: i,
        leftPercent: left,
        heightPx: baseH,
        rotateDeg: rot,
        zTier: tier,
        notchType: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      });
    }
    return list;
  }, []);

  const toneKey = sheet ? LEVEL_TONE[sheet.stick.level].key : undefined;

  const handleCylinderClick = () => {
    if (disabled || shaking || ejecting) return;
    onShake();
  };

  return (
    <div
      className={`cylinder-stage${shaking ? ' shaking' : ''}${ejecting ? ' ejecting' : ''}`}
      data-tone={toneKey}
    >
      {/* 案几落影 */}
      <div className="cylinder-ground-shadow" aria-hidden="true" />

      {/* 摇晃主体包装层 */}
      <div
        className="cylinder-wrapper"
        onClick={handleCylinderClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCylinderClick();
          }
        }}
        aria-label={en ? 'Temple Fortune Cylinder' : '宮廟問籤筒'}
      >
        {/* 筒口内径深渊阴影（展现 3D 筒内中空景深） */}
        <div className="cylinder-interior" aria-hidden="true" />

        {/* 满筒红头竹签群 */}
        <div className="sticks-bundle" aria-hidden="true">
          {sticks.map((st) => (
            <div
              key={st.id}
              className={`bundle-stick tier-${st.zTier} notch-${st.notchType}`}
              style={{
                left: `${st.leftPercent}%`,
                height: `${st.heightPx}px`,
                transform: `rotate(${st.rotateDeg}deg)`,
              }}
            >
              {/* 红漆签头与雕口 */}
              <div className="tally-head">
                <span className="tally-notch-cut" />
              </div>
              {/* 原木竹身 */}
              <div className="tally-stem" />
            </div>
          ))}

          {/* 🌟 抽出的神签（Lucky Stick）—— 摇出时探出筒身 */}
          <div className={`lucky-stick${ejecting ? ' risen' : ''}`}>
            <div className="lucky-stick-body">
              <div className="lucky-stick-head">
                <span className="lucky-notch-cut" />
              </div>
              <div className="lucky-stick-inscription">
                {sheet && (
                  <span className="lucky-stick-no">
                    {en ? `NO. ${sheet.stick.no}` : `第 ${sheet.stick.no} 籤`}
                  </span>
                )}
              </div>
              <div className="lucky-stick-stem" />
              {/* 灵光光环 */}
              <div className="lucky-stick-glow" />
            </div>
          </div>
        </div>

        {/* 经典朱砂生漆筒身（正统宫庙圆弧立面） */}
        <div className="cylinder-body">
          {/* 筒口双道实木凸起雕环 */}
          <div className="cylinder-rim">
            <span className="rim-groove-lip" />
            <span className="rim-ring-band ring-top-1" />
            <span className="rim-ring-band ring-top-2" />
          </div>

          {/* 筒身圆弧光影与描金铭文 */}
          <div className="cylinder-barrel">
            {/* 3D 圆柱柱面高光镜面 */}
            <div className="cylinder-specular-sheen" />

            {/* 描金大字「問 籤」 */}
            <div className="cylinder-gold-calligraphy">
              <span className="gold-char">問</span>
              <span className="gold-char">籤</span>
            </div>

            {/* 如意祥云描金纹与印泥方印 */}
            <div className="cylinder-cloud-emblem">
              <svg
                viewBox="0 0 72 26"
                className="gold-ruyi-cloud"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <linearGradient id="ruyiGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fdf0b0" />
                    <stop offset="40%" stopColor="#e5ba55" />
                    <stop offset="75%" stopColor="#b68322" />
                    <stop offset="100%" stopColor="#87580d" />
                  </linearGradient>
                </defs>
                <path
                  d="M12,18 C6,18 2,14 5,8 C8,2 18,3 21,7 C23,4 29,3 32,7 C36,2 45,3 47,8 C51,5 57,6 59,10 C62,7 69,9 68,14 C67,19 60,19 56,18 C51,23 37,24 30,19 C25,23 16,22 12,18 Z"
                  fill="url(#ruyiGold)"
                  opacity="0.9"
                />
                <circle cx="21" cy="11" r="2.5" fill="#fef4c8" opacity="0.85" />
                <circle cx="36" cy="11" r="3" fill="#fef4c8" opacity="0.85" />
                <circle cx="50" cy="12" r="2.5" fill="#fef4c8" opacity="0.85" />
              </svg>
              <span className="cylinder-seal-stamp">問一</span>
            </div>
          </div>

          {/* 筒底双道底座加固圈 */}
          <div className="cylinder-base">
            <span className="rim-ring-band ring-bottom-1" />
            <span className="rim-ring-band ring-bottom-2" />
            <span className="cylinder-foot-shadow" />
          </div>
        </div>
      </div>

      {/* 底部交互指引与触发按钮 */}
      <div className="cylinder-action-area">
        {fault ? (
          <div className="cylinder-fault-pill" role="alert">
            <span className="fault-badge">{fault.code}</span>
            <span className="fault-text">{fault.text}</span>
          </div>
        ) : state === 'idle' ? (
          <p className="cylinder-hint">
            {en ? 'Write your thoughts above to consult' : '請先在上方虔心寫下所求之事'}
          </p>
        ) : state === 'ready' ? (
          <button
            type="button"
            className="cylinder-shake-btn"
            onClick={onShake}
            disabled={disabled}
          >
            <span className="shake-btn-icon" aria-hidden="true">🏮</span>
            <span className="shake-btn-text">{en ? 'Shake Cylinder to Draw' : '手握籤筒 · 虔心搖籤'}</span>
          </button>
        ) : shaking ? (
          <div className="cylinder-shaking-indicator">
            <span className="shaking-dots" aria-hidden="true" />
            <p className="cylinder-hint active">
              {en ? 'Shaking the bamboo tallies...' : '心誠則靈，竹籤碰撞搖晃中...'}
            </p>
          </div>
        ) : ejecting ? (
          <div className="cylinder-risen-indicator">
            <p className="cylinder-hint highlight">
              {en
                ? `✦ Lucky stick drawn! Revealing oracle... ✦`
                : `✦ 靈籤已現！正為您呈遞神諭籤詩... ✦`}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
