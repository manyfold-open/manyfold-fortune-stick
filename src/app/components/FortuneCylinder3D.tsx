/**
 * 重做的宫庙签筒（3D）—— 斜持、拖曳摇动、籤自己爬出来掉在案几上。
 *
 * 和旧版最大的差别不在渲染，在**比例**：旧版 4.8 高 × 4.8 宽，36 支籤只占筒内截面的
 * 3.6%，所以它们只能各自站着，像插在土里。这一版内半径 1.05、高径比 2.8:1，
 * 填充率 35%，籤才挤得成一束。
 *
 * 这个组件**不抽签**。签是按下求签那一刻服务端定死的（AGENTS.md 第 4、5 条），
 * 它只负责把已经定下来的那一支演出来：摇够力道时回调 onShake() 去要签，签到了就给
 * 那一支额外的向上驱力，让它自己爬出筒口。物理不决定抽中谁，只决定它怎么出来。
 *
 * 摇多久由使用者决定，所以出签的时机不能用固定计时器 —— 演完了由 onRevealed() 回报。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import {
  createMotions,
  exitRise,
  stepBundle,
  stickTrait,
  type StickMotion,
  type StickTrait,
} from '../../shared/cylinder/bundle';
import { createFreeStick, stepFree, type FreeStick } from '../../shared/cylinder/eject';
import { STICK_COUNT, STICK_LEN, STICK_T } from '../../shared/cylinder/geometry';
import { GROUND_Y, TILT_X, TILT_Z, createCylinderScene, type CylinderScene } from '../cylinder/scene';
import { bambooDropSound, bambooRustle } from '../sound';

export interface FortuneCylinder3DProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
  onShake: () => void;
  /** 整段演完（籤落定、镜头看清签号）才回报 —— 摇多久是使用者决定的，不能用固定计时器。 */
  onRevealed?: () => void;
  disabled?: boolean;
}

/** 摇到这个累积功才去跟服务端要签。够久才有仪式感，太久会烦。 */
const SHAKE_WORK_NEEDED = 26;
/** 落定之后让镜头看清签号的停顿。 */
const REVEAL_HOLD_MS = 1500;

type Stage = 'rest' | 'shaking' | 'falling' | 'reveal' | 'done';

interface Drive {
  stage: Stage;
  motions: StickMotion[];
  traits: StickTrait[];
  chosen: number;
  /** 手的加速度沿筒轴的分量，与归一化强度。 */
  shakeA: number;
  intensity: number;
  work: number;
  requested: boolean;
  free: FreeStick | null;
  restAt: number;
  last: number;
  lastRustle: number;
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  camReady: boolean;
  pointerY: number;
  pointerV: number;
  dragging: boolean;
}

export default function FortuneCylinder3D(props: FortuneCylinder3DProps) {
  const { state, sheet, fault, language, soundEnabled, onShake, onRevealed, disabled } = props;
  const en = language === 'en';

  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CylinderScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [stageLabel, setStageLabel] = useState<Stage>('rest');

  const d = useRef<Drive>({
    stage: 'rest',
    motions: createMotions(STICK_COUNT),
    traits: Array.from({ length: STICK_COUNT }, (_, i) => stickTrait(i)),
    chosen: -1,
    shakeA: 0,
    intensity: 0,
    work: 0,
    requested: false,
    free: null,
    restAt: 0,
    last: 0,
    lastRustle: 0,
    camX: 0,
    camY: 1.4,
    camZ: 18,
    lookX: 0,
    lookY: -0.1,
    lookZ: 0,
    camReady: false,
    pointerY: 0,
    pointerV: 0,
    dragging: false,
  });

  const stateRef = useRef(state);
  const soundRef = useRef(soundEnabled ?? false);
  const shakeCb = useRef(onShake);
  const revealCb = useRef(onRevealed);
  stateRef.current = state;
  soundRef.current = soundEnabled ?? false;
  shakeCb.current = onShake;
  revealCb.current = onRevealed;

  /* ── 签到了：记下是哪一支 ── */
  useEffect(() => {
    if (!sheet) {
      d.current.chosen = -1;
      return;
    }
    d.current.chosen = Math.min(STICK_COUNT - 1, Math.max(0, sheet.stick.no - 1));
  }, [sheet]);

  /* ── 场景只建一次 ── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const rig = createCylinderScene(host);
    if (!rig) {
      setFailed(true);
      return;
    }
    sceneRef.current = rig;

    const dr = d.current;
    dr.last = performance.now();
    const t0 = dr.last;
    const baseZ = rig.tiltGroup.rotation.z;
    const baseX = rig.tiltGroup.rotation.x;
    // 重力沿筒轴的分量：筒子斜持，不是整个 g
    const axisG = 9.81 * Math.cos(Math.hypot(TILT_Z, TILT_X));
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();

    let raf = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - dr.last) / 1000);
      dr.last = now;
      if (dt <= 0) return;
      const t = (now - t0) / 1000;

      // 手势衰减：放手之后摇动很快停下来
      dr.shakeA *= Math.exp(-6 * dt);
      dr.intensity *= Math.exp(-2.6 * dt);

      const shaking = dr.intensity > 0.05;
      if (shaking && stateRef.current === 'ready' && !dr.requested) {
        dr.work += dr.intensity * dt * 10;
        if (dr.work >= SHAKE_WORK_NEEDED) {
          dr.requested = true;
          shakeCb.current();
        }
      }

      // 竹签互相碰撞的沙沙声，按强度节流
      if (soundRef.current && dr.intensity > 0.18 && now - dr.lastRustle > 70) {
        dr.lastRustle = now;
        bambooRustle(Math.min(1, dr.intensity));
      }

      /* 1. 筒内籤束 */
      if (dr.stage === 'rest' || dr.stage === 'shaking') {
        stepBundle(dr.motions, dr.traits, dt, axisG, dr.shakeA, dr.intensity, dr.chosen);
        for (let i = 0; i < STICK_COUNT; i += 1) {
          const h = rig.sticks[i];
          const m = dr.motions[i];
          h.mesh.position.y = h.rest + m.y + STICK_LEN / 2;
          // 摇动时籤头轻微摆动
          const w = dr.intensity * 0.06;
          h.mesh.rotation.x = h.baseTiltX + Math.sin(t * 9 + i) * w;
          h.mesh.rotation.z = h.baseTiltZ + Math.cos(t * 11 + i * 1.7) * w;
        }
        // 中签那一支重心越过筒口 -> 翻出去，交给自由落体
        if (dr.chosen >= 0) {
          const h = rig.sticks[dr.chosen];
          if (dr.motions[dr.chosen].y >= exitRise(h.rest)) {
            h.mesh.getWorldPosition(worldPos);
            h.mesh.getWorldQuaternion(worldQuat);
            rig.tiltGroup.remove(h.mesh);
            rig.scene.add(h.mesh);
            h.mesh.position.copy(worldPos);
            h.mesh.quaternion.copy(worldQuat);
            const e = createFreeStick();
            e.x = worldPos.x;
            e.y = worldPos.y;
            e.z = worldPos.z;
            // 顺着筒口的方向被甩出去
            e.vx = 1.5 + dr.intensity * 1.2;
            e.vy = 1.1;
            e.vz = 1.9;
            e.wx = 4.2;
            e.wy = 1.4;
            e.wz = -3.1;
            e.rx = h.mesh.rotation.x;
            e.ry = h.mesh.rotation.y;
            e.rz = h.mesh.rotation.z;
            dr.free = e;
            dr.stage = 'falling';
            setStageLabel('falling');
          }
        }
      }

      /* 2. 脱出的那一支自由落体 */
      if (dr.stage === 'falling' && dr.free) {
        const wasResting = dr.free.resting;
        stepFree(dr.free, dt, GROUND_Y, STICK_T / 2);
        const h = rig.sticks[dr.chosen];
        h.mesh.position.set(dr.free.x, dr.free.y, dr.free.z);
        h.mesh.rotation.set(dr.free.rx, dr.free.ry, dr.free.rz);
        if (!wasResting && dr.free.resting) {
          if (soundRef.current) bambooDropSound();
          dr.stage = 'reveal';
          dr.restAt = now;
          setStageLabel('reveal');
        }
      }

      /* 3. 落定之后镜头推近看签号，停一拍再交棒给签纸 */
      if (dr.stage === 'reveal' && now - dr.restAt > REVEAL_HOLD_MS) {
        dr.stage = 'done';
        setStageLabel('done');
        revealCb.current?.();
      }

      /* 4. 筒身跟着手势晃，静止时轻微呼吸 */
      rig.tiltGroup.rotation.z = baseZ + Math.sin(t * 0.55) * 0.016 + dr.shakeA * 0.004;
      rig.tiltGroup.rotation.x = baseX + Math.sin(t * 0.41 + 1.2) * 0.012;
      rig.tiltGroup.position.y = rig.baseY + Math.max(-0.35, Math.min(0.35, dr.shakeA * 0.012));

      /* 5. 弹簧相机 */
      const close = dr.stage === 'reveal' || dr.stage === 'done';
      const f = dr.free;
      const tx = close && f ? f.x : 0;
      const ty = close && f ? f.y + 0.35 : -0.1;
      const tz = close && f ? f.z : 0;
      const cx = close && f ? f.x + 0.6 : 0;
      const cy = close && f ? f.y + 3.3 : 1.4;
      const cz = close && f ? f.z + 4.6 : 18;
      const k = 1 - Math.exp(-2.6 * dt);
      if (!dr.camReady) {
        dr.camX = cx; dr.camY = cy; dr.camZ = cz;
        dr.lookX = tx; dr.lookY = ty; dr.lookZ = tz;
        dr.camReady = true;
      } else {
        dr.camX += (cx - dr.camX) * k;
        dr.camY += (cy - dr.camY) * k;
        dr.camZ += (cz - dr.camZ) * k;
        dr.lookX += (tx - dr.lookX) * k;
        dr.lookY += (ty - dr.lookY) * k;
        dr.lookZ += (tz - dr.lookZ) * k;
      }
      rig.camera.position.set(dr.camX, dr.camY, dr.camZ);
      rig.camera.lookAt(dr.lookX, dr.lookY, dr.lookZ);

      rig.render();
    };
    raf = requestAnimationFrame(frame);

    const observer = new ResizeObserver(() => rig.resize(host.clientWidth, host.clientHeight));
    observer.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rig.dispose();
      sceneRef.current = null;
    };
  }, []);

  /* ── 拖曳 = 摇筒 ── */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const dr = d.current;
    dr.dragging = true;
    dr.pointerY = e.clientY;
    // 指标捕获不是必需的，拿不到也照样能摇 —— 别让它把整个手势掀掉
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 某些合成事件没有真的 pointerId */
    }
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const dr = d.current;
    if (!dr.dragging || disabled) return;
    const dy = e.clientY - dr.pointerY;
    dr.pointerY = e.clientY;
    // 往上拖 = 把筒子往上甩，籤受到向上的惯性
    dr.shakeA = Math.max(-34, Math.min(34, dr.shakeA - dy * 1.5));
    dr.intensity = Math.min(1, dr.intensity + Math.abs(dy) * 0.022);
    if (dr.stage === 'rest' && dr.intensity > 0.2) {
      dr.stage = 'shaking';
      setStageLabel('shaking');
    }
  }, [disabled]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    d.current.dragging = false;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* 同上 */
    }
  }, []);

  if (failed) {
    return (
      <div className="roll-stage">
        <p className="roll-fallback">
          {en
            ? 'This browser cannot run the 3D cylinder. Switch to the retro printer above.'
            : '這台瀏覽器跑不動 3D 籤筒，請在上方改選復古印表機。'}
        </p>
      </div>
    );
  }

  const hint = fault
    ? null
    : state === 'idle'
      ? en ? 'Write your thoughts above first' : '請先在上方虔心寫下所求之事'
      : stageLabel === 'falling'
        ? en ? 'A stick has worked its way out…' : '有一支籤脫出了…'
        : stageLabel === 'reveal' || stageLabel === 'done'
          ? en ? '✦ Your stick has fallen ✦' : '✦ 神籤已落 ✦'
          : stageLabel === 'shaking'
            ? en ? 'Keep shaking — hold and drag up and down' : '繼續搖 —— 按住上下拖曳'
            : en ? 'Hold and drag up and down to shake the cylinder' : '按住上下拖曳，虔心搖動籤筒';

  return (
    <div className="roll-stage">
      <div
        ref={hostRef}
        className="cyl3d-canvas-wrapper"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={en ? 'Shake the 3D fortune-stick cylinder' : '搖動 3D 宮廟籤筒'}
      />
      <div className="roll-action-area">
        {fault ? (
          <div className="roll-fault-pill" role="alert">
            <span className="fault-badge">{fault.code}</span>
            <span className="fault-text">{fault.text}</span>
          </div>
        ) : (
          <p className={`roll-hint${stageLabel === 'reveal' || stageLabel === 'done' ? ' highlight' : ''}`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
