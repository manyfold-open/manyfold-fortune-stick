/**
 * 正统宫庙 3D 朱砂生漆问签筒（Fortune Cylinder）。
 *
 * 支持手动触控/鼠标「搅动竹签」与「自主挑签抽出」：
 * 1. 划过/拖拽竹签群：竹签相互碰撞发出逼真「沙沙、嗒嗒」木质撞击声，竹签随指针起伏拨动。
 * 2. 悬停挑签：靠近的竹签会自主拔高探头（附带「抽」微标记），供求签者从容挑选心仪之签。
 * 3. 选定抽签：点击选中的那一支签，该签缓缓升起破筒而出，金光环绕并浮现金箔签号。
 */

import { useMemo, useRef, useState } from 'react';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import { LEVEL_TONE } from '../constants';
import { bambooDrawSound, bambooRustle } from '../sound';

export interface FortuneCylinderProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
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
  const { state, sheet, fault, language, soundEnabled = true, onShake, disabled } = props;
  const en = language === 'en';
  const shaking = state === 'shaking';
  const ejecting = state === 'ejecting';

  // 交互状态：当前悬停的签、被用户选定的签、搅拌倾角
  const devHover = useMemo(() => {
    try {
      const p = new URL(window.location.href).searchParams.get('dev_hover');
      return p !== null ? parseInt(p, 10) : null;
    } catch {
      return null;
    }
  }, []);
  const [hoveredStickId, setHoveredStickId] = useState<number | null>(null);
  const activeHoveredId = hoveredStickId ?? devHover;
  const [chosenStickId, setChosenStickId] = useState<number | null>(null);
  const [stirTilt, setStirTilt] = useState<number>(0);
  const isPointerDown = useRef(false);
  const startX = useRef(0);
  const lastSoundTime = useRef(0);
  const bundleRef = useRef<HTMLDivElement | null>(null);

  // 固定的 32 支竹签几何散布（丰富扇形群落，高低错落有致）
  const sticks: StickConfig[] = useMemo(() => {
    const list: StickConfig[] = [];
    const total = 32;
    for (let i = 0; i < total; i++) {
      const p = i / (total - 1);
      const left = 8 + p * 84;
      const arch = Math.sin(p * Math.PI) * 24;
      const jitter = ((i * 23) % 15) - 7;
      const baseH = 192 + arch + jitter;
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

  // 鼠标 / 手指在竹签群中移动与搅拌
  const handlePointerMove = (e: React.PointerEvent) => {
    if (shaking || ejecting) return;
    const bundle = bundleRef.current;
    if (!bundle) return;

    const rect = bundle.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));

    // 寻觅距离指针最近的那支竹签
    let closestId = 0;
    let minDist = 999;
    for (let i = 0; i < sticks.length; i++) {
      const d = Math.abs(sticks[i].leftPercent - pct);
      if (d < minDist) {
        minDist = d;
        closestId = sticks[i].id;
      }
    }

    if (closestId !== hoveredStickId) {
      setHoveredStickId(closestId);
      const now = Date.now();
      if (soundEnabled && now - lastSoundTime.current > 50) {
        lastSoundTime.current = now;
        bambooRustle(0.65);
      }
    }

    // 按住拖动搅拌：计算筒身随动微摆角
    if (isPointerDown.current) {
      const deltaX = e.clientX - startX.current;
      const tilt = Math.max(-5.5, Math.min(5.5, deltaX * 0.08));
      setStirTilt(tilt);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isPointerDown.current = true;
    startX.current = e.clientX;
  };

  const handlePointerUp = () => {
    isPointerDown.current = false;
    setStirTilt(0);
  };

  const handlePointerLeave = () => {
    isPointerDown.current = false;
    setStirTilt(0);
    setHoveredStickId(null);
  };

  // 用户点击挑选特定一支竹签抽起
  const handleStickClick = (stickId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || shaking || ejecting) return;
    if (state === 'idle') {
      onShake();
      return;
    }
    setChosenStickId(stickId);
    if (soundEnabled) bambooDrawSound();
    onShake();
  };

  // 点击下方按钮或筒身（默认抽起选定签或居中神签）
  const handleGeneralShake = () => {
    if (disabled || shaking || ejecting) return;
    if (chosenStickId === null) {
      setChosenStickId(hoveredStickId ?? 16);
    }
    if (soundEnabled) bambooDrawSound();
    onShake();
  };

  // 决定当前探出的神签 ID
  const effectiveChosenId = chosenStickId ?? 16;

  return (
    <div
      className={`cylinder-stage${shaking ? ' shaking' : ''}${ejecting ? ' ejecting' : ''}`}
      data-tone={toneKey}
    >
      {/* 案几落影 */}
      <div className="cylinder-ground-shadow" aria-hidden="true" />

      {/* 摇晃主体包装层（支持搅拌微倾） */}
      <div
        className="cylinder-wrapper"
        style={stirTilt !== 0 ? { transform: `rotate(${stirTilt}deg)` } : undefined}
        onClick={handleGeneralShake}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleGeneralShake();
          }
        }}
        aria-label={en ? 'Temple Fortune Cylinder' : '宮廟問籤筒'}
      >
        {/* 筒口内径深渊阴影（展现 3D 筒内中空景深） */}
        <div className="cylinder-interior" aria-hidden="true" />

        {/* 满筒红头竹签群（支持触控/光标划动搅拌与单支点选） */}
        <div
          className="sticks-bundle"
          ref={bundleRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          aria-label={en ? 'Fortune Sticks Bundle' : '竹籤群'}
        >
          {sticks.map((st) => {
            const isChosen = effectiveChosenId === st.id;
            const isRisen = isChosen && ejecting;
            const isHovered = activeHoveredId === st.id && state === 'ready' && !shaking && !ejecting;
            const isShakingChosen = isChosen && shaking;

            return (
              <div
                key={st.id}
                className={`bundle-stick tier-${st.zTier} notch-${st.notchType}${
                  isRisen ? ' chosen-risen' : ''
                }${isHovered ? ' hovered' : ''}${isShakingChosen ? ' shaking-chosen' : ''}`}
                style={{
                  left: `${st.leftPercent}%`,
                  height: `${isRisen ? 220 : st.heightPx}px`,
                  transform: isRisen
                    ? `translateY(-48px) rotate(${st.rotateDeg * 0.2}deg) scale(1.08)`
                    : isHovered
                      ? `translateY(-22px) rotate(${st.rotateDeg * 0.5}deg) scale(1.08)`
                      : isShakingChosen
                        ? `translateY(-24px) rotate(${st.rotateDeg * 0.7}deg)`
                        : `rotate(${st.rotateDeg}deg)`,
                  zIndex: isRisen ? 30 : isHovered ? 20 : undefined,
                }}
                onClick={(e) => handleStickClick(st.id, e)}
                role="button"
                tabIndex={state === 'ready' ? 0 : -1}
                aria-label={en ? `Fortune Stick #${st.id + 1}` : `第 ${st.id + 1} 籤`}
              >
                {/* 红漆签头与雕口 */}
                <div className={`tally-head${isRisen ? ' gold-head' : ''}`}>
                  <span className="tally-notch-cut" />
                  {/* 抽出的神签探出时，浮现金箔签号 */}
                  {isRisen && sheet && (
                    <div className="chosen-inscription">
                      <span className="chosen-stick-no">
                        {en ? `NO. ${sheet.stick.no}` : `第 ${sheet.stick.no} 籤`}
                      </span>
                    </div>
                  )}
                </div>

                {/* 原木竹身 */}
                <div className="tally-stem" />

                {/* 灵光光环（探出时激荡金色神光） */}
                {isRisen && <div className="lucky-stick-glow" />}

                {/* 悬停挑签微标识 */}
                {isHovered && (
                  <span className="stick-hover-tag" aria-hidden="true">
                    {en ? 'Pick' : '抽'}
                  </span>
                )}
              </div>
            );
          })}
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

            {/* 描金楷书大字「問 籤」 */}
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
                    <stop offset="0%" stopColor="#fff8d6" />
                    <stop offset="35%" stopColor="#f3d06f" />
                    <stop offset="70%" stopColor="#bd8928" />
                    <stop offset="100%" stopColor="#87580d" />
                  </linearGradient>
                </defs>
                <path
                  d="M12,18 C6,18 2,14 5,8 C8,2 18,3 21,7 C23,4 29,3 32,7 C36,2 45,3 47,8 C51,5 57,6 59,10 C62,7 69,9 68,14 C67,19 60,19 56,18 C51,23 37,24 30,19 C25,23 16,22 12,18 Z"
                  fill="url(#ruyiGold)"
                  opacity="0.95"
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

      {/* 底部交互指引与动作区 */}
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
          activeHoveredId !== null ? (
            <button
              type="button"
              className="cylinder-shake-btn pick-active"
              onClick={() => handleStickClick(activeHoveredId, { stopPropagation: () => undefined } as any)}
              disabled={disabled}
            >
              <span className="shake-btn-icon" aria-hidden="true">✦</span>
              <span className="shake-btn-text">
                {en ? `Draw Chosen Stick #${activeHoveredId + 1}` : `心誠擇定 · 抽出此第 ${activeHoveredId + 1} 籤`}
              </span>
            </button>
          ) : (
            <div className="cylinder-stir-prompt">
              <span className="stir-hand-icon" aria-hidden="true">🖐️</span>
              <span className="stir-prompt-text">
                {en ? 'Stir tallies or click to pick your stick' : '滑動攪動竹籤 · 隨心挑選一籤抽出'}
              </span>
            </div>
          )
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
