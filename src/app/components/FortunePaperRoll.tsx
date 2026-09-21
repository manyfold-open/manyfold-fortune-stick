/**
 * 东方木刻 3D 滚印签纸机。
 *
 * 一只老黑檀木刻印滚在案几上碾过去，身后铺出一条没有尽头的澄心堂宣纸长卷，
 * 滚到哪印到哪 —— 无滑动纯滚动锁定由 roll/kinematics.ts 保证，这里只负责「往哪儿推」。
 *
 * 这个组件**不抽签**。签是按下印键那一刻服务端定死的（AGENTS.md 第 4、5 条），
 * 它只把已经定下来的那一张印出来：sheet 一到，就重画此刻转到滚筒顶上、镜头完全
 * 看不见的那一格，再解出停车弧长，让那一格不偏不倚地停在镜头正中。
 *
 * 帧循环里没有一个 new：所有暂存都在挂载时分配好了。
 */

import { useEffect, useRef, useState } from 'react';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import {
  CURL_LEN,
  LAND_OFFSET,
  N,
  R,
  cardIndexAt,
  pushTrail,
  resetTrail,
  slotOppositeNip,
  solveStopS,
  spinAngle,
  springK,
  tailS,
  writeRibbon,
} from '../roll/kinematics';
import { createRollScene, type RollScene } from '../roll/scene';
import { previewStick, repaintSlot } from '../roll/textures';
import { paperRollRumble, paperUnfurl, woodblockPress } from '../sound';

export interface FortunePaperRollProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
  onShake: () => void;
  disabled?: boolean;
}

/** 巡航与冲刺速度（世界单位 / 秒）。 */
const CRUISE = 2.6;
const SPRINT = 5.2;
/** 进入停车段之前还剩多少距离时开始减速。 */
const DECEL_LEN = 4.0;
/** 滑鼠左右滑一个视口宽度，最多能把朝向拧多少（弧度 / 秒）。 */
const YAW_RATE_MAX = 1.15;

/** 帧循环用得到、但不该触发重渲染的那些量，全部塞进一个可变对象里。 */
interface Drive {
  s: number;
  v: number;
  yaw: number;
  yawRate: number;
  yawRateTarget: number;
  nipX: number;
  nipZ: number;
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  camReady: boolean;
  stopS: number | null;
  landed: boolean;
  last: number;
}

export default function FortunePaperRoll(props: FortunePaperRollProps) {
  const { state, sheet, fault, language, soundEnabled, onShake, disabled } = props;
  const en = language === 'en';

  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RollScene | null>(null);
  const [failed, setFailed] = useState(false);

  const driveRef = useRef<Drive>({
    s: 0,
    v: 0,
    yaw: 0,
    yawRate: 0,
    yawRateTarget: 0,
    nipX: 0,
    nipZ: 0,
    camX: 0,
    camY: 4.2,
    camZ: 7,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    camReady: false,
    stopS: null,
    landed: false,
    last: 0,
  });

  // 帧循环要读、但改了不该重建场景的 props
  const stateRef = useRef(state);
  const soundRef = useRef(soundEnabled ?? false);
  stateRef.current = state;
  soundRef.current = soundEnabled ?? false;

  /* ── 场景生命周期：只建一次 ── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const rolls = createRollScene(host, language);
    if (!rolls) {
      setFailed(true);
      return;
    }
    sceneRef.current = rolls;

    const d = driveRef.current;
    d.last = performance.now();

    let raf = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - d.last) / 1000);
      d.last = now;
      if (dt <= 0) return;

      const k = springK(dt);
      const phase = stateRef.current;

      // 1. 转向：滑鼠横移 → 角速度目标 → 弹簧平滑 → 朝向
      if (phase !== 'ready') d.yawRateTarget = 0;
      d.yawRate += (d.yawRateTarget - d.yawRate) * k;
      d.yaw += d.yawRate * dt;

      // 2. 速度
      let target = 0;
      if (phase === 'ready') target = CRUISE;
      else if (phase === 'shaking') target = SPRINT;
      else if (phase === 'ejecting') target = SPRINT;
      if (d.stopS !== null) {
        const remain = d.stopS - d.s;
        const ease = remain <= 0 ? 0 : remain >= DECEL_LEN ? 1 : remain / DECEL_LEN;
        target = Math.min(target, SPRINT * ease * ease * (3 - 2 * ease));
      }
      d.v += (target - d.v) * k;

      // 3. 前进。局部前进方向是 -Z，所以世界朝向向量是 (-sin yaw, 0, -cos yaw)。
      let step = d.v * dt;
      if (d.stopS !== null && d.s + step >= d.stopS) {
        step = d.stopS - d.s;
        d.v = 0;
        if (!d.landed) {
          d.landed = true;
          if (soundRef.current) woodblockPress();
        }
      }
      d.s += step;
      const fx = -Math.sin(d.yaw);
      const fz = -Math.cos(d.yaw);
      d.nipX += fx * step;
      d.nipZ += fz * step;

      // 4. 滚筒姿态
      rolls.yawGroup.position.set(d.nipX, R, d.nipZ);
      rolls.yawGroup.rotation.y = d.yaw;
      rolls.spinGroup.rotation.x = spinAngle(d.s);
      rolls.blob.position.set(d.nipX, 0.006, d.nipZ);
      rolls.blob.rotation.z = -d.yaw;

      // 5. 纸带
      pushTrail(rolls.trail, d.nipX, d.nipZ, d.s);
      writeRibbon(rolls.buffers, rolls.trail, d.nipX, d.nipZ, fx, fz, d.s);
      rolls.ribbonGeo.attributes.position.needsUpdate = true;
      rolls.ribbonGeo.attributes.normal.needsUpdate = true;
      rolls.ribbonGeo.attributes.uv.needsUpdate = true;
      rolls.ribbonGeo.attributes.aS.needsUpdate = true;
      rolls.setTailS(tailS(rolls.trail, d.s));

      // 6. 弹簧追尾相机。定格时凑近看那张刚印出来的签。
      const close = d.stopS !== null;
      const back = close ? 5.2 : 7.0;
      const up = close ? 3.0 : 4.2;
      const ahead = close ? LAND_OFFSET : CURL_LEN * 2.2;
      const dx = d.nipX - fx * back;
      const dy = R + up;
      const dz = d.nipZ - fz * back;
      const lx = d.nipX - fx * ahead;
      const lz = d.nipZ - fz * ahead;
      if (!d.camReady) {
        d.camX = dx; d.camY = dy; d.camZ = dz;
        d.lookX = lx; d.lookY = 0; d.lookZ = lz;
        d.camReady = true;
      } else {
        d.camX += (dx - d.camX) * k;
        d.camY += (dy - d.camY) * k;
        d.camZ += (dz - d.camZ) * k;
        d.lookX += (lx - d.lookX) * k;
        d.lookZ += (lz - d.lookZ) * k;
      }
      rolls.camera.position.set(d.camX, d.camY, d.camZ);
      rolls.camera.lookAt(d.lookX, d.lookY, d.lookZ);

      rolls.renderer.render(rolls.scene, rolls.camera);
    };
    raf = requestAnimationFrame(frame);

    const onResize = (): void => rolls.resize(host.clientWidth, host.clientHeight);
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rolls.dispose();
      sceneRef.current = null;
      resetTrail(rolls.trail);
    };
    // 场景只建一次。语言变了由下一个 effect 重刻整卷版，不重建场景。
  }, []);

  /* ── 语言换了：整卷重刻 ── */
  useEffect(() => {
    const rolls = sceneRef.current;
    if (!rolls) return;
    for (let slot = 0; slot < N; slot += 1) {
      repaintSlot(rolls.atlasCanvas, slot, previewStick(slot), language, 'paper');
      repaintSlot(rolls.blockCanvas, slot, previewStick(slot), language, 'block');
    }
    // 真的那一支签由下面那个 effect 刻上去；它在 sheet 没变时不会重跑，所以这里补一刀。
    if (sheet) {
      const slot = cardIndexAt((driveRef.current.stopS ?? driveRef.current.s) - LAND_OFFSET);
      repaintSlot(rolls.atlasCanvas, slot, sheet.stick, sheet.language, 'paper');
      repaintSlot(rolls.blockCanvas, slot, sheet.stick, sheet.language, 'block');
    }
    rolls.atlasTex.needsUpdate = true;
    rolls.blockTex.needsUpdate = true;
    // sheet 只是补刀用的，语言才是这个 effect 的触发条件，所以不进依赖数组。
  }, [language]);

  /* ── 签落库：刻上真的那一支，解出停车弧长 ── */
  useEffect(() => {
    const rolls = sceneRef.current;
    const d = driveRef.current;
    if (!rolls) return;
    if (!sheet) {
      d.stopS = null;
      d.landed = false;
      return;
    }
    if (d.stopS !== null) return;

    // 此刻转到滚筒顶上、镜头完全看不见的那一格 —— 玩家看不到任何一张卡片变过内容。
    const slot = slotOppositeNip(d.s);
    repaintSlot(rolls.atlasCanvas, slot, sheet.stick, sheet.language, 'paper');
    repaintSlot(rolls.blockCanvas, slot, sheet.stick, sheet.language, 'block');
    rolls.atlasTex.needsUpdate = true;
    rolls.blockTex.needsUpdate = true;

    d.stopS = solveStopS(d.s, slot);
    d.landed = false;
    if (soundRef.current) paperUnfurl();
  }, [sheet]);

  /* ── 滚动的声音 ── */
  useEffect(() => {
    if (!soundEnabled) return;
    if (state !== 'shaking') return;
    const stop = paperRollRumble(2600);
    return () => stop();
  }, [state, soundEnabled]);

  /* ── 转向输入 ── */
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (state !== 'ready' || disabled) return;
    const box = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1; // -1 .. 1
    driveRef.current.yawRateTarget = -nx * YAW_RATE_MAX;
  };
  const onPointerLeave = (): void => {
    driveRef.current.yawRateTarget = 0;
  };
  const request = (): void => {
    if (state !== 'ready' || disabled) return;
    onShake();
  };

  if (failed) {
    return (
      <div className="roll-stage">
        <p className="roll-fallback">
          {en
            ? 'This browser cannot run the 3D press. Switch to the retro printer above.'
            : '這台瀏覽器跑不動 3D 滾印機，請在上方改選復古印表機。'}
        </p>
      </div>
    );
  }

  return (
    <div className="roll-stage">
      <div
        ref={hostRef}
        className="roll-canvas-wrapper"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={request}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            request();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={en ? 'Interactive 3D woodblock fortune press' : '3D 木刻滾印籤紙機'}
      />

      <div className="roll-action-area">
        {fault ? (
          <div className="roll-fault-pill" role="alert">
            <span className="fault-badge">{fault.code}</span>
            <span className="fault-text">{fault.text}</span>
          </div>
        ) : state === 'idle' ? (
          <p className="roll-hint">
            {en ? 'Write your thoughts above to ink the block' : '請先在上方虔心寫下所求之事'}
          </p>
        ) : state === 'ready' ? (
          <p className="roll-hint">
            {en
              ? 'Move left and right to steer the press · Click to set it rolling'
              : '左右移動駕馭印滾 · 點擊落印定籤'}
          </p>
        ) : state === 'shaking' ? (
          <p className="roll-hint active">
            {en ? 'The block turns, the paper runs…' : '木刻印滾碾過案几，長卷正在鋪展…'}
          </p>
        ) : (
          <p className="roll-hint highlight">
            {en ? '✦ The impression is set. Reading your fortune… ✦' : '✦ 落印已定，正為您呈遞神諭籤詩… ✦'}
          </p>
        )}
      </div>
    </div>
  );
}
