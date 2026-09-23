/**
 * 籤筒 v3（3D）—— 籤筒固定不動，按住籤繞圈攪，攪夠了放手，被拿起來的那支給你看。
 *
 * 這個組件**不抽籤**。籤是攪夠了那一刻服務端定死的（AGENTS.md 第 4、5 條）：
 * 攪動功到門檻就回調 onShake() 去要籤，簽到了就把號碼記下來，放手之後照劇本
 * （shared/cylinder/pull.ts）把一支籤「拿起來」，轉向鏡頭時那個號碼才淡入。
 * 哪一支實體籤被拿起來跟號碼無關 —— 筒裡的籤不印號碼，拿的永遠是筒心最直那支，
 * 往上拔才不會穿過別的籤。
 *
 * 攪多久由使用者決定，所以什麼時候演完不能用固定計時器 —— 演完了由 onRevealed() 回報。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import {
  createMotions,
  settleStep,
  stepBundle,
  stickTrait,
  type StickMotion,
  type StickTrait,
} from '../../shared/cylinder/bundle';
import {
  STIR_WORK_NEEDED,
  createStir,
  pushStir,
  stepStir,
  type StirState,
} from '../../shared/cylinder/stir';
import {
  PULL_INDEX,
  STICK_COUNT,
  STICK_LEN,
  STICK_T,
  STICK_W,
  bundleSlot,
} from '../../shared/cylinder/geometry';
import { IDLE_LOOK_Y, idleCameraZ, pullCamera } from '../../shared/cylinder/framing';
import {
  CLEAR_AT,
  HOLD_MS,
  PULL_DONE,
  SLIDE_AT,
  neighborNudge,
  numberFade,
  pullCues,
  pullPose,
} from '../../shared/cylinder/pull';
import { createCylinderScene, type CylinderScene } from '../cylinder/scene';
import { STICK_VARIANTS, createNumberedStickCanvas } from '../cylinder/materials';
import { bambooRattle, bambooRustle, chime } from '../sound';

export interface FortuneCylinder3DProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
  /** 使用者開了「減少動畫」：拿起來、推近鏡頭都直接跳到結果。 */
  reducedMotion?: boolean;
  onShake: () => void;
  /** 整段演完（籤拿到面前、鏡頭看清籤號）才回報 —— 攪多久是使用者決定的，不能用固定計時器。 */
  onRevealed?: () => void;
  disabled?: boolean;
}

/** 交棒给签纸前的淡出时长，跟 styles.css 的 transition 对齐。 */
const HANDOFF_FADE_MS = 460;

type Stage = 'rest' | 'shaking' | 'pulling' | 'done';

interface Drive {
  stage: Stage;
  motions: StickMotion[];
  traits: StickTrait[];
  /** 伺服器抽到的籤號（1 起算），還沒回應是 0。 */
  stickNo: number;
  /** 伺服器給的籤運等級 —— 鈴聲的音色跟著它。 */
  level: Reading['stick']['level'] | undefined;
  /** 上一格的拿籤時間，聲音 cue 用區間判斷才不會重複響。 */
  cueMs: number;
  /** 手勢 → 籤束轉角、強度與攪動量 —— 邏輯在 shared/cylinder/stir.ts，那邊有測試釘著。 */
  stir: StirState;
  requested: boolean;
  /** 開始拿籤的時間。 */
  pullAt: number;
  /**
   * 印著「第 N 籤」的那一面：疊在抽出那支的籤身正面，淡入它的不透明度（pull.ts 的
   * numberFade）。號碼一到就先做好、先傳上 GPU —— 等到揭曉那一格才畫畫布、傳貼圖，
   * 那一格一定掉幀，正好卡在最該絲滑的地方。
   */
  numberFace: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null;
  numberTex: THREE.Texture | null;
  /** 淡出计时器，卸载时要清掉。 */
  handoff: number;
  /** 上次回报给 React 的进度档位，用来节流重渲染。 */
  reported: number;
  last: number;
  lastRustle: number;
  camY: number;
  camZ: number;
  lookY: number;
  camReady: boolean;
  pointerX: number;
  pointerY: number;
  pointerAt: number;
  dragging: boolean;
}

export default function FortuneCylinder3D(props: FortuneCylinder3DProps) {
  const { state, sheet, fault, language, soundEnabled, reducedMotion, onShake, onRevealed, disabled } = props;
  const en = language === 'en';

  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CylinderScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [stageLabel, setStageLabel] = useState<Stage>('rest');
  const [handingOff, setHandingOff] = useState(false);
  /**
   * 攪了多少 0..1 —— 只拿來決定提示文字，**不畫進度條**。畫了使用者會以為是限時任務
   * （實際回饋：「好像有限時、要攪很久」）。攪多久由使用者決定，這只是「真的攪了」的下限。
   */
  const [progress, setProgress] = useState(0);
  /** 手還按著嗎 —— 提示要分「繼續攪」與「可以放手了」。 */
  const [dragging, setDragging] = useState(false);

  const d = useRef<Drive>({
    stage: 'rest',
    motions: createMotions(STICK_COUNT),
    traits: Array.from({ length: STICK_COUNT }, (_, i) => stickTrait(i)),
    stickNo: 0,
    level: undefined,
    cueMs: -1,
    stir: createStir(),
    requested: false,
    pullAt: 0,
    numberFace: null,
    numberTex: null,
    handoff: 0,
    reported: -1,
    last: 0,
    lastRustle: 0,
    camY: IDLE_LOOK_Y,
    camZ: 25,
    lookY: IDLE_LOOK_Y,
    camReady: false,
    pointerX: 0,
    pointerY: 0,
    pointerAt: 0,
    dragging: false,
  });

  const stateRef = useRef(state);
  const soundRef = useRef(soundEnabled ?? false);
  const calmRef = useRef(reducedMotion ?? false);
  const shakeCb = useRef(onShake);
  const revealCb = useRef(onRevealed);
  stateRef.current = state;
  soundRef.current = soundEnabled ?? false;
  calmRef.current = reducedMotion ?? false;
  shakeCb.current = onShake;
  revealCb.current = onRevealed;

  /* ── 籤到了：記下號碼。號碼只從這裡來（伺服器），動畫不決定它 ── */
  useEffect(() => {
    d.current.stickNo = sheet ? sheet.stick.no : 0;
    d.current.level = sheet ? sheet.stick.level : undefined;
  }, [sheet]);

  /*
   * ── 畫布填滿首屏剩下的高度 ──
   *
   * 螢幕越大籤筒就該越大（鏡頭距離由 framing.ts 依長寬比算，畫布多高籤筒就多大）。
   * 但提示文字與進度條必須留在折線以上 —— 使用者要看得到「可以放手了」。
   * CSS 量不到畫布上面還有多少東西，所以在這裡量：視窗高 − 畫布頂端 − 下方提示區。
   */
  const actionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = (): void => {
      const top = host.getBoundingClientRect().top + window.scrollY;
      const below = (actionRef.current?.offsetHeight ?? 0) + 28;
      const floor = window.innerWidth <= 640 ? 320 : 380;
      host.style.height = `${Math.max(floor, Math.round(window.innerHeight - top - below))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

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
    const wobble = new THREE.Euler();
    const UP = new THREE.Vector3(0, 1, 0);
    const axisV = new THREE.Vector3();
    const yawQ = new THREE.Quaternion();
    const pullSlot = bundleSlot(PULL_INDEX);
    const spin = new THREE.Quaternion();
    /**
     * 籤束繞筒軸轉 phi：外圈轉得比內圈多一點點，整束才像被攪動的一團，不像一塊板子在轉。
     * 籤心、籤軸、朝向一起轉。
     */
    const place = (h: (typeof rig.sticks)[number], cx: number, cy: number, cz: number, phi: number) => {
      const a = phi * (0.8 + 0.2 * Math.min(1, Math.hypot(h.x, h.z) / 1.6));
      const c = Math.cos(a);
      const sn = Math.sin(a);
      h.mesh.position.set(cx * c + cz * sn, cy, -cx * sn + cz * c);
      return spin.setFromAxisAngle(UP, a);
    };

    let raf = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - dr.last) / 1000);
      dr.last = now;
      if (dt <= 0) return;
      const t = (now - t0) / 1000;

      // armed：这一局可以抽签吗。没写问题时照样跟手动（手感），但不记账 ——
      // 不然使用者写问题之前攪的那些会全部存起来，一写完随手一碰就掉签。
      const armed = stateRef.current === 'ready' && !dr.requested;
      stepStir(dr.stir, dt, dr.dragging, armed);
      const sh = dr.stir;
      if (sh.intensity > 0.05 && armed) {
        const notch = Math.min(20, Math.floor((sh.work / STIR_WORK_NEEDED) * 20));
        if (notch !== dr.reported) {
          dr.reported = notch;
          setProgress(Math.min(1, sh.work / STIR_WORK_NEEDED));
        }
        if (sh.work >= STIR_WORK_NEEDED) {
          dr.requested = true;
          setProgress(1);
          shakeCb.current();
        }
      }

      // 竹籤互相碰撞的沙沙聲，按強度節流
      if (soundRef.current && dr.stage !== 'pulling' && sh.intensity > 0.18 && now - dr.lastRustle > 70) {
        dr.lastRustle = now;
        bambooRustle(Math.min(1, sh.intensity));
      }

      // 號碼到了就先把那一面做好，透明地掛在要被拿起來那支上
      if (!dr.numberFace && dr.stickNo > 0) {
        const tex = new THREE.CanvasTexture(createNumberedStickCanvas(dr.stickNo, PULL_INDEX % STICK_VARIANTS));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = rig.renderer.capabilities.getMaxAnisotropy();
        rig.renderer.initTexture(tex);
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(STICK_W, STICK_LEN),
          new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.97,
            metalness: 0,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        // 貼在籤身正面，籤頭圓盤（往前挪了半個籤厚）仍然蓋在它前面
        face.position.z = STICK_T / 2 + 0.002;
        rig.sticks[PULL_INDEX].mesh.add(face);
        dr.numberFace = face;
        dr.numberTex = tex;
      }

      /* 1. 攪：筒內籤束。中籤那支不再自己往上爬（-1）—— 它是放手之後被「拿」起來的 */
      if (dr.stage === 'rest' || dr.stage === 'shaking') {
        stepBundle(dr.motions, dr.traits, dt, sh.jostle, sh.intensity);
        for (let i = 0; i < STICK_COUNT; i += 1) {
          const h = rig.sticks[i];
          const m = dr.motions[i];
          // 籤沿**自己的**軸滑動 —— 扇形散開之後每支的軸都不一樣；再跟著籤束繞筒軸轉
          const p = h.pose;
          const q = place(h, p.cx + p.ax * m.y, p.cy + p.ay * m.y, p.cz + p.az * m.y, sh.phi);
          const w = sh.intensity * 0.06;
          wobble.set(Math.sin(t * 9 + i) * w, 0, Math.cos(t * 11 + i * 1.7) * w);
          h.mesh.quaternion.setFromEuler(wobble).premultiply(q).multiply(h.baseQuat);
        }
        // 攪夠了、伺服器回了、手也放開了 —— 開始拿籤
        if (dr.requested && dr.stickNo > 0 && !dr.dragging) {
          dr.stage = 'pulling';
          dr.pullAt = now;
          dr.cueMs = -1;
          setStageLabel('pulling');
        }
      }

      /* 2. 拿籤：照劇本走（shared/cylinder/pull.ts），那邊有測試保證不穿出筒壁 */
      if (dr.stage === 'pulling' || dr.stage === 'done') {
        const ms = now - dr.pullAt;
        const calm = calmRef.current;
        const held = rig.sticks[PULL_INDEX];

        // 聲音跟畫面走同一條時間軸（pull.ts 的 pullCues）：抓住那一下、開始往上抽、號碼印上去，
        // 各自在那一格響。「抽到了」的鈴聲以前等籤紙出來才響，晚了將近三秒
        for (const cue of pullCues(dr.cueMs, ms, calm)) {
          if (!soundRef.current) continue;
          if (cue === 'grab') bambooRustle(0.55);
          else if (cue === 'slide') bambooRattle(CLEAR_AT - SLIDE_AT);
          else chime(dr.level);
        }
        dr.cueMs = ms;
        const hp = pullPose(pullSlot, ms, calm);
        // 放手那一刻籤束可能還轉在一邊：拿起來那支跟著它一起轉回正面，才不會一放手就跳一下
        const hq = place(held, hp.cx, hp.cy, hp.cz, sh.phi);
        axisV.set(hp.ax, hp.ay, hp.az);
        held.mesh.quaternion
          .setFromUnitVectors(UP, axisV)
          .premultiply(hq)
          .multiply(yawQ.setFromAxisAngle(UP, hp.yaw));

        // 其他籤：攪動留下的起伏約半秒慢慢歇下來（bundle.ts 的 settleStep），靠近的被帶得跳一下
        for (let i = 0; i < STICK_COUNT; i += 1) {
          if (i === PULL_INDEX) continue;
          const h = rig.sticks[i];
          const m = dr.motions[i];
          settleStep(m, dt);
          const lift = m.y + (calm ? 0 : neighborNudge(Math.hypot(h.x - pullSlot.x, h.z - pullSlot.z), ms));
          const p = h.pose;
          const q = place(h, p.cx + p.ax * lift, p.cy + p.ay * lift, p.cz + p.az * lift, sh.phi);
          h.mesh.quaternion.copy(q).multiply(h.baseQuat);
        }

        // 轉向鏡頭途中號碼淡入 —— 號碼是伺服器給的那一個。鈴聲（上面的 reveal）跟淡入同一格開始
        if (dr.numberFace) dr.numberFace.material.opacity = numberFade(ms, calm);

        if (dr.stage === 'pulling' && ms >= (calm ? HOLD_MS : PULL_DONE)) {
          dr.stage = 'done';
          setStageLabel('done');
          // 先淡出再交棒 —— 直接换掉画面会「啪」一下，看完籤号的那一拍就断了
          setHandingOff(true);
          dr.handoff = window.setTimeout(() => revealCb.current?.(), HANDOFF_FADE_MS);
        }
      }

      /* 3. 鏡頭：待機時平視整支籤筒；拿籤時跟著籤往上、推到籤頭與號碼（不用彈簧，不會翻轉） */
      const aspect = rig.camera.aspect;
      const idleZ = idleCameraZ(aspect);
      if (dr.stage === 'pulling' || dr.stage === 'done') {
        // 鏡頭跟著籤的高度走，籤頭永遠在畫面裡（shared/cylinder/framing.ts 的 pullCamera）
        const c = pullCamera(now - dr.pullAt, aspect, calmRef.current);
        dr.camY = c.camY;
        dr.camZ = c.camZ;
        dr.lookY = c.lookY;
      } else if (!dr.camReady) {
        dr.camY = IDLE_LOOK_Y;
        dr.camZ = idleZ;
        dr.lookY = IDLE_LOOK_Y;
        dr.camReady = true;
      } else {
        // 畫布改尺寸時距離會變，追過去但別一下子跳
        const kk = 1 - Math.exp(-2.6 * dt);
        dr.camY += (IDLE_LOOK_Y - dr.camY) * kk;
        dr.camZ += (idleZ - dr.camZ) * kk;
        dr.lookY += (IDLE_LOOK_Y - dr.lookY) * kk;
      }
      rig.camera.position.set(0, dr.camY, dr.camZ);
      rig.camera.lookAt(0, dr.lookY, 0);

      rig.render();
    };
    raf = requestAnimationFrame(frame);

    const observer = new ResizeObserver(() => rig.resize(host.clientWidth, host.clientHeight));
    observer.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      if (d.current.handoff) window.clearTimeout(d.current.handoff);
      d.current.numberTex?.dispose();
      observer.disconnect();
      rig.dispose();
      sceneRef.current = null;
    };
  }, []);

  /* ── 按住拖動 = 攪 ── */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const dr = d.current;
    dr.dragging = true;
    setDragging(true);
    dr.pointerX = e.clientX;
    dr.pointerY = e.clientY;
    dr.pointerAt = performance.now();
    // 指标捕获不是必需的，拿不到也照样能攪 —— 别让它把整个手势掀掉
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 某些合成事件没有真的 pointerId */
    }
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const dr = d.current;
    if (!dr.dragging || disabled) return;
    const now = performance.now();
    const dx = e.clientX - dr.pointerX;
    const dy = e.clientY - dr.pointerY;
    const gap = Math.max(0.001, (now - dr.pointerAt) / 1000);
    dr.pointerX = e.clientX;
    dr.pointerY = e.clientY;
    dr.pointerAt = now;
    // 手往哪邊，籤束就往哪邊轉；手多快，籤就攪得多兇（shared/cylinder/stir.ts）
    pushStir(dr.stir, dx, dy, gap);
    if (dr.stage === 'rest' && dr.stir.intensity > 0.2) {
      dr.stage = 'shaking';
      setStageLabel('shaking');
    }
  }, [disabled]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    d.current.dragging = false;
    setDragging(false);
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
      : stageLabel === 'pulling' || stageLabel === 'done'
        ? en ? '✦ Your stick is drawn ✦' : '✦ 神籤已出 ✦'
        : stageLabel === 'shaking'
          ? progress >= 1
            ? dragging
              ? en ? 'Stir as long as you like — let go to draw' : '想攪多久都可以 —— 放手就抽'
              : en ? 'A stick is coming up…' : '籤就要出來了…'
            : dragging
              ? en ? 'Stir them round…' : '攪一攪…'
              : en ? 'Give them a real stir first' : '先攪一下再放手'
          : en ? 'Press on the sticks and stir — let go whenever you like' : '按住籤攪一攪 —— 想攪多久都可以，放手就抽';

  return (
    <div className="roll-stage cyl3d-stage">
      <div
        ref={hostRef}
        className={`cyl3d-canvas-wrapper${handingOff ? ' handing-off' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={en ? 'Stir the sticks in the 3D fortune cylinder' : '攪動籤筒裡的籤'}
      />
      <div className="roll-action-area" ref={actionRef}>
        {fault ? (
          <div className="roll-fault-pill" role="alert">
            <span className="fault-badge">{fault.code}</span>
            <span className="fault-text">{fault.text}</span>
          </div>
        ) : (
          <div className="cyl3d-status">
            <p className={`roll-hint${stageLabel === 'pulling' || stageLabel === 'done' ? ' highlight' : ''}`}>
              {hint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
