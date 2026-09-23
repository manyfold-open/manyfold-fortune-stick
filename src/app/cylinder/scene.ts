/**
 * 签筒的 Three.js 装配。只管「怎么摆、怎么打光」，不管「怎么动」——
 * 每一帧往哪儿推是组件的事。
 *
 * 层级：
 *   scene
 *     ├ tiltGroup   斜持的整支签筒（如同捧在手上）
 *     │   ├ tube / inner / 铜箍 ×2 / 筒底
 *     │   └ sticks ×36
 *
 * 画布是透明的，籤筒直接站在页面上 —— 没有案几、没有影子。
 */

import * as THREE from 'three';
import type { StickPose } from '../../shared/cylinder/geometry';
import {
  STICK_COUNT,
  STICK_LEN,
  STICK_T,
  STICK_HEAD_R,
  STICK_HEAD_GAP,
  STICK_W,
  TUBE_H,
  TUBE_R_IN,
  TUBE_R_OUT,
  bundleSlot,
  cupArcU,
  stickPose,
  RIG_X,
  RIG_Y,
  TILT_X,
  TILT_Z,
  cupRadius,
} from '../../shared/cylinder/geometry';
import { IDLE_LOOK_Y, idleCameraZ } from '../../shared/cylinder/framing';
import {
  STICK_ATLAS_W,
  STICK_CELL_W,
  STICK_VARIANTS,
  createBrassCanvas,
  createStickAtlas,
  createStickHeadCanvas,
  createTubeCanvas,
  paintStickAtlas,
  paintStickHead,
  paintTubeCanvas,
} from './materials';
import { loadCylinderArt } from './art';


export interface StickHandle {
  mesh: THREE.Mesh;
  /** 静止时籤底在筒内的高度。 */
  rest: number;
  /** 靜止時的籤心與籤軸（shared/cylinder/geometry.ts 的 stickPose）。籤沿自己的軸滑動。 */
  pose: StickPose;
  /** 靜止時的朝向：先繞自己的軸轉 yaw，再傾到 pose 的籤軸上。 */
  baseQuat: THREE.Quaternion;
  x: number;
  z: number;
}

export interface CylinderScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  tiltGroup: THREE.Group;
  /** tiltGroup 的静止位置 —— 组件摇动时以它为基准沿筒轴滑动。 */
  baseX: number;
  baseY: number;
  baseZ: number;
  sticks: StickHandle[];
  resize: (w: number, h: number) => void;
  render: () => void;
  dispose: () => void;
}


/**
 * 圆角方柱的侧面。等价于 open-ended 的 CylinderGeometry，只是截面换成超椭圆。
 *
 * 法线是从截面**切线**转 90° 算出来的，不是半径方向 —— 平面上每一点的半径方向都
 * 不一样，拿它当法线的话四个平面会被当成曲面来打光，看起来又变回圆筒了。
 *
 * @param scale  相对 cupRadius 的缩放（内壁、领子都用同一个截面，只是大小不同）
 */
function cupShell(scale: number, height: number, segments = 160, fillet = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const EPS = 1e-4;
  // 縱向的每一圈：底部圓角用 8 圈把邊收圓（參考圖的杯底四邊是圓的，方方的底像罐頭），
  // 其餘是直的，頭尾兩圈就夠
  const rows: number[] = [];
  if (fillet > 0) for (let k = 0; k <= 8; k += 1) rows.push((fillet * k) / 8);
  else rows.push(0);
  rows.push(height);
  const R = rows.length;
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    // u = 0.5 要落在**正对镜头**那一面（世界 +Z），贴图上的字才在正面。
    const th = u * Math.PI * 2 - Math.PI / 2;
    const r = cupRadius(th) * scale;
    const cx = Math.cos(th);
    const cz = Math.sin(th);
    const r2 = cupRadius(th + EPS) * scale;
    const dx = Math.cos(th + EPS) * r2 - cx * r;
    const dz = Math.sin(th + EPS) * r2 - cz * r;
    const len = Math.hypot(dx, dz) || 1;
    // 切线转 -90°：(dx,dz) -> (dz,-dx)，指向外
    const nx = dz / len;
    const nz = -dx / len;
    // 貼圖照**弧長**鋪（geometry.ts 的 cupArcU）：照角度鋪的話，平面上越靠方角的
    // 地方一度對到的杯壁越長，字就越靠邊越扁。u 反向：截面逆時針繞，照鋪會左右鏡像
    const tu = 1 - cupArcU(th);
    for (const y of rows) {
      // 底部圓角：往內收 inset，法線往下轉
      const inset = y < fillet ? fillet - Math.sqrt(fillet * fillet - (fillet - y) * (fillet - y)) : 0;
      const tilt = y < fillet ? Math.asin((fillet - y) / fillet) : 0;
      pos.push(cx * r - nx * inset, y, cz * r - nz * inset);
      nor.push(nx * Math.cos(tilt), -Math.sin(tilt), nz * Math.cos(tilt));
      uv.push(tu, y / height);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let k = 0; k < R - 1; k += 1) {
      const a0 = i * R + k;
      const b0 = (i + 1) * R + k;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** 杯底四邊圓角的半徑（世界單位）。 */
const CUP_FILLET = 0.55;

/** 圆角方柱的盖子（杯底）。朝下。 */
function cupCap(scale: number, y: number, segments = 160): THREE.BufferGeometry {
  const pos: number[] = [0, y, 0];
  const nor: number[] = [0, -1, 0];
  const uv: number[] = [0.5, 0.5];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const th = (i / segments) * Math.PI * 2;
    const r = cupRadius(th) * scale;
    pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
    nor.push(0, -1, 0);
    uv.push(0.5 + Math.cos(th) * 0.5, 0.5 + Math.sin(th) * 0.5);
  }
  for (let i = 1; i <= segments; i += 1) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

export function createCylinderScene(host: HTMLElement): CylinderScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      // 画布透明，籤筒直接站在页面底色上 —— 不再自带一块深色背板
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }

  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  // 只放自己的畫布，不清掉 host 裡別的東西：React 會往同一個 host 裡放出籤時的落櫻畫布（SakuraBloom），
  // 那是 React 的節點，這裡清掉的話 React 之後移除它就會丟錯。收場時 dispose 也只拿走自己這一張。
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 120);
  camera.position.set(0, IDLE_LOOK_Y, idleCameraZ(width / height));
  camera.lookAt(0, IDLE_LOOK_Y, 0);

  /* ── 摄影棚光 ── */
  // 暖、柔，但要留住體積感：v3 第一版把環境光拉到 2.0、主光壓到 1.45，側面暗不下去，
  // 杯子看起來像一張紙板。參考圖的杯子邊緣是會自然變暗的
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0xe6d2b6, 1.6));

  const key = new THREE.DirectionalLight(0xffeedd, 1.9);
  key.position.set(7, 12, 9);
  scene.add(key);

  // 背后的轮廓光：把签筒从暗背景里剥出来，没有它整支筒会糊成一团
  const rim = new THREE.DirectionalLight(0xfff0e0, 0.35);
  rim.position.set(-6, 5, -9);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffeedd, 0.6);
  fill.position.set(-7, 2, 7);
  scene.add(fill);

  /* ── 贴图 ── */
  const tubeCanvas = createTubeCanvas();
  const tubeTex = new THREE.CanvasTexture(tubeCanvas);
  tubeTex.colorSpace = THREE.SRGBColorSpace;
  tubeTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const brassTex = new THREE.CanvasTexture(createBrassCanvas());
  brassTex.colorSpace = THREE.SRGBColorSpace;
  brassTex.wrapS = THREE.RepeatWrapping;
  brassTex.repeat.set(6, 1);

  const atlasCanvas = createStickAtlas();
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = tubeTex.anisotropy;

  /* ── 斜持的签筒 ── */
  const tiltGroup = new THREE.Group();
  tiltGroup.position.set(RIG_X, RIG_Y, 0);
  tiltGroup.rotation.z = TILT_Z;
  tiltGroup.rotation.x = TILT_X;
  scene.add(tiltGroup);

  // 黏土：粗糙度拉满、完全不反射。有一点点金属度就会出现生漆那种高光
  const tubeMat = new THREE.MeshStandardMaterial({ map: tubeTex, roughness: 0.97, metalness: 0 });
  const tube = new THREE.Mesh(cupShell(1, TUBE_H, 160, CUP_FILLET), tubeMat);
  tube.position.y = 0;
  tiltGroup.add(tube);

  // 内壁：比外壁暗，给筒口深度
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x8d7a60,
    roughness: 0.98,
    metalness: 0.0,
    side: THREE.BackSide,
  });
  const inner = new THREE.Mesh(cupShell(TUBE_R_IN / TUBE_R_OUT, TUBE_H - 0.04, 96), innerMat);
  inner.position.y = 0.02;
  tiltGroup.add(inner);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x9b8b6c, roughness: 0.98 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(TUBE_R_IN, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  tiltGroup.add(floor);

  // 杯口那圈外翻的领子 —— 参考图上最好认的轮廓之一
  const collarMat = new THREE.MeshStandardMaterial({
    map: brassTex,
    roughness: 0.97,
    metalness: 0,
  });
  const collar = new THREE.Mesh(cupShell(1.055, TUBE_H * 0.14), collarMat);
  collar.position.y = TUBE_H - TUBE_H * 0.14;
  tiltGroup.add(collar);

  // 杯底：不封起来的话，斜着看会直接看穿整只杯子
  // 杯底跟著圓角往內收，不然會從圓角外面多出一圈平邊
  const bottomCap = new THREE.Mesh(cupCap((TUBE_R_OUT - CUP_FILLET) / TUBE_R_OUT, 0), collarMat);
  tiltGroup.add(bottomCap);

  /* ── 竹籤（STICK_COUNT 支） ── */
  const UP = new THREE.Vector3(0, 1, 0);
  const stickGeo = new THREE.BoxGeometry(STICK_W, STICK_LEN, STICK_T);
  const headCanvas = createStickHeadCanvas();
  const headTex = new THREE.CanvasTexture(headCanvas);
  headTex.colorSpace = THREE.SRGBColorSpace;
  // 圓盤是 CylinderGeometry 的頂蓋轉 90° 立起來的，貼圖跟著轉掉了 ——「籤」字會橫躺。
  // 近拍時才看得出來（竹字頭跑到右邊），轉回來
  headTex.center.set(0.5, 0.5);
  headTex.rotation = Math.PI / 2;
  const headGeo = new THREE.CylinderGeometry(STICK_HEAD_R, STICK_HEAD_R, STICK_T, 28);
  const headMat = new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.97, metalness: 0 });
  const sticks: StickHandle[] = [];
  for (let i = 0; i < STICK_COUNT; i += 1) {
    const slot = bundleSlot(i);
    const tex = atlasTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(STICK_CELL_W / STICK_ATLAS_W, 1);
    // 筒裡的籤不印號碼，只有 STICK_VARIANTS 種圖案輪流
    tex.offset.set(((i % STICK_VARIANTS) * STICK_CELL_W) / STICK_ATLAS_W, 0);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, metalness: 0 });
    const mesh = new THREE.Mesh(stickGeo, mat);
    // 圆籤头。挂成子物件，籤怎么动它就跟着动
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = Math.PI / 2;
    // 这一截跟 geometry.ts 共用一个常数 —— 框景要靠它算整支籤有多长
    head.position.y = STICK_LEN / 2 + STICK_HEAD_GAP;
    // 圓盤往正面挪半個籤厚：跟籤身同一個深度的話，籤身頂端會橫切過圓盤下半，
    // 「籤」字被蓋掉一半。參考圖是圓盤在前、籤身塞在後面
    head.position.z = STICK_T / 2;
    mesh.add(head);
    const pose = stickPose(slot);
    const baseQuat = new THREE.Quaternion()
      .setFromUnitVectors(UP, new THREE.Vector3(pose.ax, pose.ay, pose.az))
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, slot.yaw));
    mesh.position.set(pose.cx, pose.cy, pose.cz);
    mesh.quaternion.copy(baseQuat);
    tiltGroup.add(mesh);
    sticks.push({
      mesh,
      rest: slot.rest,
      pose,
      baseQuat,
      x: slot.x,
      z: slot.z,
    });
  }

  const resize = (w: number, h: number): void => {
    const rw = Math.max(1, w);
    const rh = Math.max(1, h);
    renderer.setSize(rw, rh);
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
  };

  // 插畫（使用者給的 SVG，art.ts）要先解碼：貼圖先用底色和字，圖好了在同一張 canvas 上重畫。
  // 20 支籤的貼圖是同一張 atlas clone 出來的（共用 canvas），但 three 是照每個 Texture 自己的
  // version 決定要不要重傳 —— 每一支都要標 needsUpdate，只標 atlasTex 籤身不會換
  let disposed = false;
  void loadCylinderArt()
    .then((art) => {
      if (disposed) return;
      paintTubeCanvas(tubeCanvas, art);
      tubeTex.needsUpdate = true;
      paintStickAtlas(atlasCanvas, art);
      atlasTex.needsUpdate = true;
      for (const s of sticks) {
        const map = (s.mesh.material as THREE.MeshStandardMaterial).map;
        if (map) map.needsUpdate = true;
      }
      paintStickHead(headCanvas, art);
      headTex.needsUpdate = true;
    })
    .catch(() => {
      /* 圖載不進來就留著底色和字：籤筒照樣能玩 */
    });

  const dispose = (): void => {
    disposed = true;
    const seen = new Set<THREE.Material>();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (!seen.has(m)) {
          seen.add(m);
          m.dispose();
        }
      }
    });
    for (const s of sticks) (s.mesh.material as THREE.MeshStandardMaterial).map?.dispose();
    tubeTex.dispose();
    brassTex.dispose();
    atlasTex.dispose();
    headTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    camera,
    scene,
    tiltGroup,
    baseX: RIG_X,
    baseY: RIG_Y,
    baseZ: 0,
    sticks,
    resize,
    render: () => renderer.render(scene, camera),
    dispose,
  };
}
