/**
 * 签筒的 Three.js 装配。只管「怎么摆、怎么打光」，不管「怎么动」——
 * 每一帧往哪儿推是组件的事。
 *
 * 层级：
 *   scene
 *     ├ tiltGroup   斜持的整支签筒（如同捧在手上）
 *     │   ├ tube / inner / 铜箍 ×2 / 筒底
 *     │   └ sticks ×36
 *     ├ blob        案几上的柔焦接触阴影
 *     └ table       案几
 */

import * as THREE from 'three';
import {
  STICK_COUNT,
  STICK_LEN,
  STICK_T,
  STICK_W,
  TUBE_H,
  TUBE_R_IN,
  TUBE_R_OUT,
  bundleSlot,
} from '../../shared/cylinder/geometry';
import {
  STICK_ATLAS_W,
  STICK_CELL_W,
  createBlobCanvas,
  createBrassCanvas,
  createStickAtlas,
  createTubeCanvas,
} from './materials';

const TABLE_COLOR = 0x241a14;
/** 签筒斜持的角度 —— 真实求签就是斜着摇的。 */
export const TILT_Z = -0.46;
export const TILT_X = 0.13;
/** 整支签筒在世界里的落点，让它悬在案几上方。 */
export const RIG_Y = -4.2;
/** 案几平面。脱出的籤落在这里。 */
export const GROUND_Y = RIG_Y - 2.3;
/** 斜持之后整支筒的重心会甩到 x≈+2，这里把它推回画面中轴。 */
export const RIG_X = -2.0;

export interface StickHandle {
  mesh: THREE.Mesh;
  /** 静止时籤底在筒内的高度。 */
  rest: number;
  baseYaw: number;
  baseTiltX: number;
  baseTiltZ: number;
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

export function createCylinderScene(host: HTMLElement): CylinderScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(TABLE_COLOR, 1);
  host.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  // 案几在透视上会一路延伸到视平线，不加雾就是一条生硬的地平线横在画面中间
  scene.fog = new THREE.Fog(TABLE_COLOR, 21, 64);

  const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 120);
  camera.position.set(0, 1.4, 18);
  camera.lookAt(0, -0.1, 0);

  /* ── 摄影棚光 ── */
  scene.add(new THREE.HemisphereLight(0xfff1dd, 0x2a1d15, 0.55));

  const key = new THREE.DirectionalLight(0xfff0d6, 2.6);
  key.position.set(7, 12, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  // 背后的轮廓光：把签筒从暗背景里剥出来，没有它整支筒会糊成一团
  const rim = new THREE.DirectionalLight(0xffd8a8, 1.5);
  rim.position.set(-6, 5, -9);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffe4c4, 0.32);
  fill.position.set(-7, 2, 7);
  scene.add(fill);

  /* ── 案几 ── */
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: TABLE_COLOR, roughness: 0.95, metalness: 0.02 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = GROUND_Y;
  table.receiveShadow = true;
  scene.add(table);

  const blobTex = new THREE.CanvasTexture(createBlobCanvas());
  blobTex.colorSpace = THREE.SRGBColorSpace;
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(RIG_X, GROUND_Y + 0.01, 0);
  scene.add(blob);

  /* ── 贴图 ── */
  const tubeTex = new THREE.CanvasTexture(createTubeCanvas());
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

  const tubeMat = new THREE.MeshStandardMaterial({ map: tubeTex, roughness: 0.42, metalness: 0.05 });
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R_OUT, TUBE_R_OUT * 0.97, TUBE_H, 72, 1, true),
    tubeMat,
  );
  tube.position.y = TUBE_H / 2;
  // 贴图把「問籤」画在 u=0.5，而 CylinderGeometry 的 u=0 对着 +Z —— 不转的话字在背面
  tube.rotation.y = Math.PI;
  tube.castShadow = true;
  tube.receiveShadow = true;
  tiltGroup.add(tube);

  // 内壁：比外壁暗，给筒口深度
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x1b0f0a,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.BackSide,
  });
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R_IN, TUBE_R_IN * 0.97, TUBE_H - 0.04, 48, 1, true),
    innerMat,
  );
  inner.position.y = TUBE_H / 2;
  tiltGroup.add(inner);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a1710, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(TUBE_R_IN, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  tiltGroup.add(floor);

  const brassMat = new THREE.MeshStandardMaterial({
    map: brassTex,
    color: 0xc89b3c,
    metalness: 0.78,
    roughness: 0.33,
  });
  for (const [y, h, r] of [
    [TUBE_H - 0.34, 0.5, TUBE_R_OUT * 1.035],
    [0.3, 0.62, TUBE_R_OUT * 1.05],
  ] as const) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, true), brassMat);
    band.position.y = y;
    band.castShadow = true;
    tiltGroup.add(band);
  }

  /* ── 36 支竹籤 ── */
  const stickGeo = new THREE.BoxGeometry(STICK_W, STICK_LEN, STICK_T);
  const sticks: StickHandle[] = [];
  for (let i = 0; i < STICK_COUNT; i += 1) {
    const slot = bundleSlot(i);
    const tex = atlasTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(STICK_CELL_W / STICK_ATLAS_W, 1);
    tex.offset.set((i * STICK_CELL_W) / STICK_ATLAS_W, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.02 });
    const mesh = new THREE.Mesh(stickGeo, mat);
    mesh.position.set(slot.x, slot.rest + STICK_LEN / 2, slot.z);
    mesh.rotation.set(slot.tiltX, slot.yaw, slot.tiltZ);
    mesh.castShadow = true;
    tiltGroup.add(mesh);
    sticks.push({
      mesh,
      rest: slot.rest,
      baseYaw: slot.yaw,
      baseTiltX: slot.tiltX,
      baseTiltZ: slot.tiltZ,
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

  const dispose = (): void => {
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
    blobTex.dispose();
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
