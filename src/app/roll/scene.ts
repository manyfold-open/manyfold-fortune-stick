/**
 * 把纯数学和纯贴图装配成一个 Three.js 场景。这里只管「怎么摆」，不管「怎么动」——
 * 每一帧往哪儿推，是 FortunePaperRoll 的事。
 *
 * 层级（坐标约定见 kinematics.ts 开头）：
 *   scene
 *     └ yawGroup      位置 = 滚筒中心，rotation.y = 行进朝向
 *         └ spinGroup rotation.x = spinAngle(s)
 *             ├ barrel   手搓的圆柱侧壁，UV 由顶点自己的角位置算出
 *             └ cap ×2   黄铜端盖
 *     ├ ribbon        纸带，顶点每帧覆写
 *     ├ blob          柔焦接触阴影，跟着滚筒走
 *     └ table         案几地面
 */

import * as THREE from 'three';
import type { Language } from '../../shared/lang';
import {
  BARREL_SEGMENTS,
  R,
  TAIL_FADE,
  W,
  barrelRingY,
  barrelRingZ,
  barrelPhi,
  barrelU,
  barrelVertexX,
  createBarrelIndices,
  createRibbonBuffers,
  createRibbonIndices,
  createTrail,
  type RibbonBuffers,
  type Trail,
} from '../../shared/roll/kinematics';
import { createAtlasCanvas, createBlobCanvas, createBlockCanvas, createBrassCanvas } from './textures';

/** 案几的颜色。纸带尾端就是溶进这个颜色里，所以两处必须是同一个值。 */
const TABLE_COLOR = 0x2b211a;

export interface RollScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  yawGroup: THREE.Group;
  spinGroup: THREE.Group;
  blob: THREE.Mesh;
  ribbonGeo: THREE.BufferGeometry;
  buffers: RibbonBuffers;
  trail: Trail;
  atlasCanvas: HTMLCanvasElement;
  blockCanvas: HTMLCanvasElement;
  atlasTex: THREE.CanvasTexture;
  blockTex: THREE.CanvasTexture;
  setTailS: (v: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

/** 手搓圆柱侧壁：接缝放在滚筒顶部，u 由顶点自己的角位置算出，和纸带同一套算术。 */
function buildBarrelGeometry(): THREE.BufferGeometry {
  const rings = BARREL_SEGMENTS + 1;
  const position = new Float32Array(rings * 2 * 3);
  const normal = new Float32Array(rings * 2 * 3);
  const uv = new Float32Array(rings * 2 * 2);

  for (let j = 0; j < rings; j += 1) {
    const phi = barrelPhi(j);
    const y = barrelRingY(phi);
    const z = barrelRingZ(phi);
    const u = barrelU(j);
    for (let side = 0; side < 2; side += 1) {
      const v = j * 2 + side;
      position[v * 3] = barrelVertexX(side);
      position[v * 3 + 1] = y;
      position[v * 3 + 2] = z;
      normal[v * 3] = 0;
      normal[v * 3 + 1] = y / R;
      normal[v * 3 + 2] = z / R;
      uv[v * 2] = u;
      uv[v * 2 + 1] = side;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(createBarrelIndices(), 1));
  return geo;
}

export function createRollScene(host: HTMLElement, language: Language): RollScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null; // 没有 WebGL —— 调用方去铺静态兜底
  }

  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(TABLE_COLOR, 1);
  host.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(TABLE_COLOR, 26, 62);

  // 32° 长焦，俯视留景深
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.4, 140);
  camera.position.set(0, 4.2, 7.0);
  camera.lookAt(0, 0, 0);

  // ── 摄影棚光 ──
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x3a2c22, 0.85));
  const key = new THREE.DirectionalLight(0xfff6e8, 1.35);
  key.position.set(5, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 34;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe9cf, 0.3);
  fill.position.set(-7, 5, -6);
  scene.add(fill);

  // ── 案几 ──
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: TABLE_COLOR, roughness: 0.94, metalness: 0.02 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // ── 贴图 ──
  const atlasCanvas = createAtlasCanvas(language);
  const blockCanvas = createBlockCanvas(language);
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.wrapS = THREE.RepeatWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const blockTex = new THREE.CanvasTexture(blockCanvas);
  blockTex.wrapS = THREE.RepeatWrapping;
  blockTex.wrapT = THREE.ClampToEdgeWrapping;
  blockTex.colorSpace = THREE.SRGBColorSpace;
  blockTex.anisotropy = atlasTex.anisotropy;

  // ── 滚筒 ──
  const yawGroup = new THREE.Group();
  yawGroup.position.set(0, R, 0);
  scene.add(yawGroup);
  const spinGroup = new THREE.Group();
  yawGroup.add(spinGroup);

  const barrel = new THREE.Mesh(
    buildBarrelGeometry(),
    new THREE.MeshStandardMaterial({ map: blockTex, roughness: 0.62, metalness: 0.08 }),
  );
  barrel.castShadow = true;
  spinGroup.add(barrel);

  const brassTex = new THREE.CanvasTexture(createBrassCanvas());
  brassTex.colorSpace = THREE.SRGBColorSpace;
  const brassMat = new THREE.MeshStandardMaterial({
    map: brassTex,
    color: 0xc89b3c,
    metalness: 0.75,
    roughness: 0.35,
  });
  for (let side = 0; side < 2; side += 1) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R * 1.04, 64), brassMat);
    cap.position.x = (side - 0.5) * (W + 0.04);
    cap.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    cap.castShadow = true;
    spinGroup.add(cap);
  }

  // ── 柔焦接触阴影 ──
  const blobTex = new THREE.CanvasTexture(createBlobCanvas());
  blobTex.colorSpace = THREE.SRGBColorSpace;
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 4.4, R * 4.4),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.006;
  blob.renderOrder = 1;
  scene.add(blob);

  // ── 纸带 ──
  const buffers = createRibbonBuffers();
  const trail = createTrail();
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3));
  ribbonGeo.setAttribute('normal', new THREE.BufferAttribute(buffers.normal, 3));
  ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(buffers.uv, 2));
  ribbonGeo.setAttribute('aS', new THREE.BufferAttribute(buffers.aS, 1));
  ribbonGeo.setIndex(new THREE.BufferAttribute(createRibbonIndices(), 1));
  // 顶点每帧动，包围盒靠不住；直接给一个大球，别让 three 去剔除它。
  ribbonGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);

  const tailUniform = { value: 0 };
  const ribbonMat = new THREE.MeshStandardMaterial({
    map: atlasTex,
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  ribbonMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTailS = tailUniform;
    shader.uniforms.uTableColor = { value: new THREE.Color(TABLE_COLOR) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aS;\nvarying float vS;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTailS;\nuniform vec3 uTableColor;\nvarying float vS;',
      )
      .replace(
        '#include <tonemapping_fragment>',
        `#include <tonemapping_fragment>
        // 必须在 <colorspace_fragment> 之前混色：uTableColor 是 THREE.Color 存的线性值，
        // 这时 gl_FragColor 也还没被 linearToOutputTexel 编码成 sRGB，两边单位一致才能混。
        // 挪到 dithering_fragment 之后会拿线性色去混一个已经编码过的颜色，尾端会溶成
        // 接近黑色而不是案几的颜色 —— 这条注释和它标注的位置别被"顺手"挪走。
        float tailMix = smoothstep(uTailS, uTailS + ${TAIL_FADE.toFixed(1)}, vS);
        gl_FragColor.rgb = mix(uTableColor, gl_FragColor.rgb, tailMix);`,
      );
  };

  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.frustumCulled = false;
  ribbon.receiveShadow = true;
  scene.add(ribbon);

  const resize = (w: number, h: number): void => {
    const rw = Math.max(1, w);
    const rh = Math.max(1, h);
    renderer.setSize(rw, rh);
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
  };

  const dispose = (): void => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    });
    atlasTex.dispose();
    blockTex.dispose();
    brassTex.dispose();
    blobTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    camera,
    scene,
    yawGroup,
    spinGroup,
    blob,
    ribbonGeo,
    buffers,
    trail,
    atlasCanvas,
    blockCanvas,
    atlasTex,
    blockTex,
    setTailS: (v) => {
      tailUniform.value = v;
    },
    resize,
    dispose,
  };
}
