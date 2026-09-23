/**
 * 正统东方宫庙 3D 拟真问签筒（基于 thebuggeddev/paper-roll 摄影棚光影与 Spring-Damper 物理架构）。
 *
 * 核心设计特色：
 * 1. 32° 长焦镜头 + 35° 俯视透视：清晰俯视筒口深邃景深与 36 支自然扇形错落的竹签束。
 * 2. 纯代码程序化高精材质（Zero Assets）：
 *    - 筒身：老紫檀黑茶色深沉木纹 + 嵌金楷书「問 籤」+ 祥云方印 + 黄铜拉丝金属箍环。
 *    - 竹签：36 支扁平楠竹神签（天然竹节纤丝、硃砂红漆签首、小楷墨字签号）。
 * 3. 双层柔焦接触阴影（Blob Shadow）+ 摄影棚柔和落影，彻底去除锯齿与塑料感。
 * 4. Spring-Damper 物理运动阻尼解算器（源自 paper-roll）：手指/滑鼠拨动竹签时具有沉甸甸的跟手重量感与碰撞微回弹。
 * 5. 心诚自主挑签：悬停时神签主动拔高探头，点击时神签破筒升空、金芒流转。
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import { LEVEL_TONE } from '../constants';
import { bambooDrawSound, bambooDropSound, bambooRustle } from '../sound';

export interface FortuneCylinderProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
  onShake: () => void;
  disabled?: boolean;
}

interface Stick3DData {
  group: THREE.Group;
  mesh: THREE.Mesh;
  id: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotX: number;
  baseRotY: number;
  baseRotZ: number;
  currentY: number;
  targetY: number;
  wobbleX: number;
  wobbleZ: number;
  vx: number;
  vz: number;
}

// 伪随机数发生器（确定性噪点）
function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 1. 摄影棚双层柔焦接触阴影贴图（Blob Contact Shadow，消弭锯齿）
 */
function buildBlobTexture(): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return new THREE.CanvasTexture(cv);

  const cx = S / 2;
  const gr = g.createRadialGradient(cx, cx, 24, cx, cx, S * 0.48);
  gr.addColorStop(0.0, 'rgba(20, 14, 10, 0.65)');
  gr.addColorStop(0.28, 'rgba(20, 14, 10, 0.42)');
  gr.addColorStop(0.55, 'rgba(20, 14, 10, 0.16)');
  gr.addColorStop(0.8, 'rgba(20, 14, 10, 0.04)');
  gr.addColorStop(1.0, 'rgba(20, 14, 10, 0.0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

/**
 * 2. 老紫檀木纹与阴刻描金「問 籤」筒身贴图
 */
function buildCylinderTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return new THREE.CanvasTexture(cv);

  const rand = pseudoRandom(42);

  // 1. 老紫檀基底（微渐变温润深褐红）
  const baseGrad = g.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0.0, '#22140f');
  baseGrad.addColorStop(0.4, '#361d15');
  baseGrad.addColorStop(0.7, '#2a1711');
  baseGrad.addColorStop(1.0, '#1c0f0a');
  g.fillStyle = baseGrad;
  g.fillRect(0, 0, W, H);

  // 2. 天然原木纵向细密棕眼与导管（数百条有机纤维微纹理）
  for (let i = 0; i < 420; i++) {
    const a = 0.03 + rand() * 0.07;
    g.fillStyle = `rgba(10, 4, 2, ${a.toFixed(3)})`;
    const x = rand() * W;
    const w = 1 + rand() * 2;
    g.fillRect(x, 0, w, H);
  }

  // 木质暖调反光纤维
  for (let i = 0; i < 180; i++) {
    const a = 0.02 + rand() * 0.04;
    g.fillStyle = `rgba(180, 120, 80, ${a.toFixed(3)})`;
    const x = rand() * W;
    g.fillRect(x, 0, 1, H);
  }

  // 3. 筒口与底座沉香黄铜箍金线
  g.strokeStyle = 'rgba(220, 175, 80, 0.35)';
  g.lineWidth = 3;
  g.strokeRect(0, 40, W, 1);
  g.strokeRect(0, H - 40, W, 1);

  // 4. 正面阴刻描金大字「問 籤」
  const cx = W / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 136px "Kaiti SC", "STKaiti", "BiauKai", "DFKai-SB", "Noto Serif TC", serif';

  const gold = g.createLinearGradient(0, 220, 0, 680);
  gold.addColorStop(0.0, '#ffffff');
  gold.addColorStop(0.25, '#fff6d5');
  gold.addColorStop(0.55, '#f4ca5b');
  gold.addColorStop(0.85, '#b98822');
  gold.addColorStop(1.0, '#7a510c');

  // 刻痕阴影（雕刻凹凸深邃感）
  g.shadowColor = 'rgba(5, 2, 1, 0.95)';
  g.shadowBlur = 16;
  g.shadowOffsetX = 2;
  g.shadowOffsetY = 5;
  g.fillStyle = gold;
  g.fillText('問', cx, 340);
  g.fillText('籤', cx, 510);

  // 描金高光金边
  g.shadowColor = 'rgba(255, 225, 120, 0.7)';
  g.shadowBlur = 6;
  g.strokeStyle = 'rgba(255, 245, 200, 0.6)';
  g.lineWidth = 2;
  g.strokeText('問', cx, 340);
  g.strokeText('籤', cx, 510);

  // 5. 祥云与方印「問一」
  g.shadowColor = 'rgba(5, 2, 1, 0.85)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 3;
  g.fillStyle = gold;
  const cy = 655;
  g.beginPath();
  g.arc(cx - 36, cy + 3, 16, 0, Math.PI * 2);
  g.arc(cx, cy - 2, 22, 0, Math.PI * 2);
  g.arc(cx + 36, cy + 3, 16, 0, Math.PI * 2);
  g.fill();

  // 朱红吉印
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.fillStyle = '#9b1b1b';
  g.fillRect(cx + 42, cy - 10, 24, 24);
  g.fillStyle = '#fff4db';
  g.font = '700 13px serif';
  g.fillText('問', cx + 54, cy + 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

/**
 * 3. 36 支独立楠竹神签纹理 Atlas（单张大图，极高性能，真实竹节、朱砂漆头、墨字签号）
 */
function buildStickAtlasTexture(totalSticks: number): THREE.CanvasTexture {
  const CELL_W = 128;
  const CELL_H = 1024;
  const cv = document.createElement('canvas');
  cv.width = CELL_W * totalSticks;
  cv.height = CELL_H;
  const g = cv.getContext('2d');
  if (!g) return new THREE.CanvasTexture(cv);

  const rand = pseudoRandom(108);

  for (let i = 0; i < totalSticks; i++) {
    const ox = i * CELL_W;

    // 1. 天然楠竹木底色（竹黄色至温润茶竹色微差异）
    const tone = 0.92 + rand() * 0.16;
    const r1 = Math.round(180 * tone);
    const g1 = Math.round(145 * tone);
    const b1 = Math.round(90 * tone);
    const r2 = Math.round(218 * tone);
    const g2 = Math.round(185 * tone);
    const b2 = Math.round(128 * tone);

    const bg = g.createLinearGradient(ox, 0, ox + CELL_W, 0);
    bg.addColorStop(0.0, `rgb(${r1},${g1},${b1})`);
    bg.addColorStop(0.3, `rgb(${r2},${g2},${b2})`);
    bg.addColorStop(0.7, `rgb(${r2},${g2},${b2})`);
    bg.addColorStop(1.0, `rgb(${r1},${g1},${b1})`);
    g.fillStyle = bg;
    g.fillRect(ox, 0, CELL_W, CELL_H);

    // 2. 纵向细密竹纤维
    for (let f = 0; f < 55; f++) {
      const a = 0.04 + rand() * 0.09;
      g.fillStyle = `rgba(80, 48, 15, ${a.toFixed(3)})`;
      const fx = ox + rand() * CELL_W;
      g.fillRect(fx, 0, 1 + rand(), CELL_H);
    }

    // 4. 签首硃砂红漆浸染（顶部 ~14%，露出温润黄金楠竹身）
    const headH = CELL_H * 0.14;
    const headGrad = g.createLinearGradient(ox, 0, ox + CELL_W, 0);
    headGrad.addColorStop(0.0, '#551113');
    headGrad.addColorStop(0.2, '#7a191b');
    headGrad.addColorStop(0.5, '#a42326');
    headGrad.addColorStop(0.8, '#7a191b');
    headGrad.addColorStop(1.0, '#551113');
    g.fillStyle = headGrad;
    g.fillRect(ox, 0, CELL_W, headH);

    // 签头顶端描金边
    g.fillStyle = '#f2c85b';
    g.fillRect(ox, 0, CELL_W, 6);

    // 硃砂头与竹身接界金线
    g.fillStyle = '#e5b84c';
    g.fillRect(ox, headH - 3, CELL_W, 3);

    // 5. 传统手书签号与吉凶墨字（竖排）
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // 签头金印：签次 (如「第21籤」)
    g.font = '800 22px "Kaiti SC", "STKaiti", "BiauKai", serif';
    g.fillStyle = '#fff4ca';
    g.shadowColor = 'rgba(0,0,0,0.85)';
    g.shadowBlur = 3;
    const stickNo = i + 1;
    g.fillText(`第${stickNo}籤`, ox + CELL_W / 2, headH * 0.52);

    // 竹节 1
    const nodeY1 = headH + 20;
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(60, 32, 10, 0.28)';
    g.fillRect(ox, nodeY1, CELL_W, 4);
    g.fillStyle = 'rgba(255, 240, 200, 0.22)';
    g.fillRect(ox, nodeY1 + 4, CELL_W, 2);

    // 竹身黑墨：吉凶小楷 (如「大吉」、「上吉」、「上上」)
    g.font = '800 25px "Kaiti SC", "STKaiti", "BiauKai", serif';
    g.fillStyle = 'rgba(30, 18, 10, 0.9)';
    const sampleTones = ['上吉', '大吉', '上上', '中吉', '中平', '上上'];
    const toneText = sampleTones[i % sampleTones.length];
    g.fillText(toneText, ox + CELL_W / 2, headH + 62);

    // 竹身下方印记
    g.font = '600 16px serif';
    g.fillStyle = 'rgba(80, 50, 30, 0.7)';
    g.fillText('靈籤', ox + CELL_W / 2, headH + 105);

    const nodeY2 = headH + 200;
    g.fillStyle = 'rgba(60, 32, 10, 0.25)';
    g.fillRect(ox, nodeY2, CELL_W, 4);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export default function FortuneCylinder(props: FortuneCylinderProps) {
  const { state, sheet, fault, language, soundEnabled = true, onShake, disabled } = props;
  const en = language === 'en';
  const shaking = state === 'shaking';
  const ejecting = state === 'ejecting';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredStickId, setHoveredStickId] = useState<number | null>(null);
  const [inspectedStickId, setInspectedStickId] = useState<number | null>(null);
  const [chosenStickId, setChosenStickId] = useState<number | null>(null);
  const [isStirring, setIsStirring] = useState(false);

  // Three.js 核心对象保存
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sticksDataRef = useRef<Stick3DData[]>([]);
  const cylinderGroupRef = useRef<THREE.Group | null>(null);
  const sticksBundleGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2(-999, -999));
  const isPointerDownRef = useRef(false);
  const haloLightRef = useRef<THREE.PointLight | null>(null);

  // 物理解算器（Spring-Damper + 涡流角速度）
  const pointerSpringRef = useRef({
    current: new THREE.Vector2(0, 0),
    target: new THREE.Vector2(0, 0),
    velocity: new THREE.Vector2(0, 0),
  });
  const angularVelocityRef = useRef(0);
  const pointerStartRef = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 });
  const prevPointerRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const lastRustleTimeRef = useRef(0);

  const effectiveChosenId = chosenStickId ?? inspectedStickId ?? 18;

  // 1. 初始化 Three.js 场景、材质与竹签群
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 场景与 32° 长焦透视相机（35° 俯视透视，消除广角变形）
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 100);
    camera.position.set(0, 5.0, 13.0);
    camera.lookAt(0, 0.85, 0);
    cameraRef.current = camera;

    // WebGL 渲染器
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ── 摄影棚级柔和光影（借鉴 paper-roll） ──
    const hemiLight = new THREE.HemisphereLight(0xfff7ea, 0xd4cebd, 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff8ee, 1.2);
    sunLight.position.set(3.5, 16, 6);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -4.5;
    sunLight.shadow.camera.right = 4.5;
    sunLight.shadow.camera.top = 4.5;
    sunLight.shadow.camera.bottom = -4.5;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 28;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xffedd4, 0.35);
    fillLight.position.set(-6, 4, -6);
    scene.add(fillLight);

    // 神签拔出时的金光圣环光源
    const haloLight = new THREE.PointLight(0xffd700, 0, 16);
    haloLight.position.set(0, 4.6, 2.5);
    scene.add(haloLight);
    haloLightRef.current = haloLight;

    // ── 签筒主体 Group（底部置于 y = -2.1） ──
    const cylinderGroup = new THREE.Group();
    cylinderGroup.position.set(0, -2.1, 0);
    scene.add(cylinderGroup);
    cylinderGroupRef.current = cylinderGroup;

    // 内部竹签群独立旋转 Group（用于手势搅拌涡流）
    const sticksBundleGroup = new THREE.Group();
    cylinderGroup.add(sticksBundleGroup);
    sticksBundleGroupRef.current = sticksBundleGroup;

    // ── 摄影棚柔焦接触阴影（Blob Shadow，纯净无锯齿） ──
    const blobGeo = new THREE.PlaneGeometry(8.6, 8.6);
    const blobMat = new THREE.MeshBasicMaterial({
      map: buildBlobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    });
    const blobMesh = new THREE.Mesh(blobGeo, blobMat);
    blobMesh.rotation.x = -Math.PI / 2;
    blobMesh.position.y = -2.09;
    scene.add(blobMesh);

    // ── 制作 3D 老紫檀铜箍外筒 ──
    const cylRadiusTop = 2.4;
    const cylRadiusBottom = 2.22;
    const cylHeight = 4.8;
    const cylSegments = 64;

    const cylTexture = buildCylinderTexture();
    const cylMat = new THREE.MeshStandardMaterial({
      map: cylTexture,
      roughness: 0.32,
      metalness: 0.08,
    });

    const cylGeo = new THREE.CylinderGeometry(cylRadiusTop, cylRadiusBottom, cylHeight, cylSegments, 1, false);
    // 旋转贴图 180° 使描金「問 籤」正对相机 (+Z)
    cylGeo.rotateY(Math.PI);
    const cylinderMesh = new THREE.Mesh(cylGeo, cylMat);
    cylinderMesh.position.y = cylHeight / 2;
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = true;
    cylinderGroup.add(cylinderMesh);

    // 筒内深邃暗影空腔
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x110906, side: THREE.BackSide });
    const innerGeo = new THREE.CylinderGeometry(cylRadiusTop - 0.12, cylRadiusBottom - 0.12, cylHeight - 0.1, 48, 1, true);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.y = cylHeight / 2 + 0.05;
    cylinderGroup.add(innerMesh);

    // 沉香黄铜箍环材质（拉丝金属质感）
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc89b3c,
      roughness: 0.38,
      metalness: 0.68,
    });

    // 筒口上铜箍
    const topBand1 = new THREE.Mesh(new THREE.TorusGeometry(cylRadiusTop + 0.03, 0.05, 16, 64), brassMat);
    topBand1.rotation.x = Math.PI / 2;
    topBand1.position.y = cylHeight - 0.12;
    cylinderGroup.add(topBand1);

    const topBand2 = new THREE.Mesh(new THREE.TorusGeometry(cylRadiusTop + 0.015, 0.035, 16, 64), brassMat);
    topBand2.rotation.x = Math.PI / 2;
    topBand2.position.y = cylHeight - 0.35;
    cylinderGroup.add(topBand2);

    // 筒底沉香木与铜箍基座
    const bottomBand = new THREE.Mesh(new THREE.CylinderGeometry(cylRadiusBottom + 0.1, cylRadiusBottom + 0.12, 0.32, 48), brassMat);
    bottomBand.position.y = 0.16;
    cylinderGroup.add(bottomBand);

    // ── 制作 36 支 3D 楠竹扁平神签群 ──
    const totalSticks = 36;
    const stickAtlasTex = buildStickAtlasTexture(totalSticks);
    const sticksList: Stick3DData[] = [];

    const stickW = 0.34; // 扁平竹签宽度
    const stickH = 6.0; // 竹签高度
    const stickD = 0.048; // 扁平厚度

    // 3 圈同心螺旋散布（最大半径 1.62，远小于筒口半径 2.4）
    const ringConfig = [
      { count: 6, radius: 0.52 },
      { count: 12, radius: 1.08 },
      { count: 18, radius: 1.62 },
    ];

    let stickIndex = 0;
    ringConfig.forEach((ring, ringIdx) => {
      for (let j = 0; j < ring.count; j++) {
        const i = stickIndex++;
        const p = j / ring.count;
        const angle = p * Math.PI * 2 + ringIdx * 0.42;

        // 椭圆微调增加散漫真实度
        const rJitter = ring.radius + ((i * 7) % 5) * 0.025 - 0.05;
        const x = Math.cos(angle) * rJitter * 1.04;
        const z = Math.sin(angle) * rJitter * 0.94;

        // 顶部自然穹顶起伏
        const dome = (1 - ring.radius / 1.8) * 0.28;
        const jitter = ((i * 13) % 7) * 0.03 - 0.08;
        const y = 0.52 + dome + jitter;

        // 向外自然微倾（3° ~ 6°）
        const tilt = (ring.radius / 1.7) * 0.08;
        const rotZ = -Math.cos(angle) * tilt + ((i % 3) - 1) * 0.015;
        const rotX = Math.sin(angle) * tilt + (((i * 3) % 5) - 2) * 0.01;
        const rotY = ((i * 11) % 9 - 4) * 0.04;

        // 制作该签专属 UV 贴图材质（从 Atlas 中切片）
        const stickMat = new THREE.MeshStandardMaterial({
          map: stickAtlasTex.clone(),
          roughness: 0.45,
          metalness: 0.04,
        });
        stickMat.map!.repeat.set(1 / totalSticks, 1);
        stickMat.map!.offset.set(i / totalSticks, 0);
        stickMat.map!.needsUpdate = true;

        // 扁平竹签几何体
        const stickGeo = new THREE.BoxGeometry(stickW, stickH, stickD);
        const stickMesh = new THREE.Mesh(stickGeo, stickMat);
        stickMesh.position.y = stickH / 2;
        stickMesh.castShadow = false;
        stickMesh.receiveShadow = true;
        stickMesh.userData = { stickId: i };

        const stickGroup = new THREE.Group();
        stickGroup.position.set(x, y, z);
        stickGroup.rotation.set(rotX, rotY, rotZ);
        stickGroup.add(stickMesh);

        sticksBundleGroup.add(stickGroup);

        sticksList.push({
          group: stickGroup,
          mesh: stickMesh,
          id: i,
          baseX: x,
          baseY: y,
          baseZ: z,
          baseRotX: rotX,
          baseRotY: rotY,
          baseRotZ: rotZ,
          currentY: y,
          targetY: y,
          wobbleX: 0,
          wobbleZ: 0,
          vx: 0,
          vz: 0,
        });
      }
    });

    sticksDataRef.current = sticksList;

    // ── 动画主循环与 Spring-Damper 物理运动 ──
    let animId: number;
    let lastTime = performance.now();
    let startTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;
      const elapsed = (now - startTime) * 0.001;

      // 1. 物理阻尼弹簧指针追踪（Spring = 18.0, Damp = 5.2）
      const ps = pointerSpringRef.current;
      const accX = (ps.target.x - ps.current.x) * 18.0 - ps.velocity.x * 5.2;
      const accY = (ps.target.y - ps.current.y) * 18.0 - ps.velocity.y * 5.2;
      ps.velocity.x += accX * dt;
      ps.velocity.y += accY * dt;
      ps.current.x += ps.velocity.x * dt;
      ps.current.y += ps.velocity.y * dt;

      // 2. 状态分支逻辑
      if (props.state === 'shaking') {
        const shakeSway = Math.sin(elapsed * 24) * 0.09;
        cylinderGroup.rotation.z = shakeSway;
        cylinderGroup.position.x = Math.cos(elapsed * 20) * 0.06;

        sticksList.forEach((st, idx) => {
          const hop = Math.abs(Math.sin(elapsed * 18 + idx * 0.7)) * 0.32;
          st.group.position.y = st.baseY + hop;
        });
      } else {
        cylinderGroup.rotation.z *= 0.88;
        cylinderGroup.position.x *= 0.88;

        // 竹签群涡流旋转物理（来自手势搅拌）
        if (sticksBundleGroup) {
          sticksBundleGroup.rotation.y += angularVelocityRef.current * dt;
          angularVelocityRef.current *= Math.pow(0.86, dt * 60);

          const spinSpeed = Math.abs(angularVelocityRef.current);
          if (spinSpeed > 0.35) {
            sticksList.forEach((st, idx) => {
              const hop = Math.abs(Math.sin(elapsed * 26 + idx * 0.85)) * 0.06 * Math.min(1.5, spinSpeed * 0.25);
              st.wobbleX += (Math.random() - 0.5) * 0.018 * spinSpeed;
              st.wobbleZ += (Math.random() - 0.5) * 0.018 * spinSpeed;
              st.group.position.y = st.currentY + hop;
            });

            const now = Date.now();
            if (soundEnabled && now - lastRustleTimeRef.current > 55) {
              lastRustleTimeRef.current = now;
              bambooRustle(Math.min(1.0, spinSpeed * 0.2));
            }
          }
        }

        // 3. 竹签受指针弹簧重力微拨弄与回弹
        const stirIntensity = ps.velocity.length();
        const px = ps.current.x * 2.2;
        const pz = ps.current.y * 1.5;

        sticksList.forEach((st) => {
          // 柔和拔高趋向目标高度
          st.currentY += (st.targetY - st.currentY) * (1 - Math.exp(-14 * dt));
          if (Math.abs(angularVelocityRef.current) <= 0.35) {
            st.group.position.y = st.currentY;
          }

          // 物理排斥挤压（当手指拖曳经过时向外侧推挤）
          if (stirIntensity > 0.05) {
            const dx = st.baseX - px;
            const dz = st.baseZ - pz;
            const distSq = dx * dx + dz * dz;
            if (distSq < 1.8) {
              const force = (1.8 - distSq) * 0.025;
              st.wobbleX += dx * force;
              st.wobbleZ += dz * force;
            }
          }

          // 弹性阻尼回弹至基准旋转
          st.wobbleX *= 0.88;
          st.wobbleZ *= 0.88;
          st.group.rotation.x = st.baseRotX + st.wobbleZ;
          st.group.rotation.z = st.baseRotZ + st.wobbleX;
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // 响应式视口大小监听
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      cylGeo.dispose();
      cylMat.dispose();
      cylTexture.dispose();
      blobGeo.dispose();
      blobMat.dispose();
    };
  }, []);

  // 2. 状态驱动 3D 表现：抽起试看、挑签探头与最终神签破筒升空
  useEffect(() => {
    const sticks = sticksDataRef.current;
    if (sticks.length === 0) return;

    sticks.forEach((st) => {
      const isChosen = st.id === effectiveChosenId;
      const isInspected = st.id === inspectedStickId;

      if (ejecting && isChosen) {
        // 🌟 最终破筒升空：神签拔高 2.8 个单位，金芒四射！
        st.targetY = st.baseY + 2.8;
        st.group.position.z = st.baseZ + 0.35;
        if (haloLightRef.current) haloLightRef.current.intensity = 4.5;
      } else if (isInspected) {
        // 🎋 抽起试看端详：拔高 2.2 个单位，微向前探，清晰露出吉凶与签号！
        st.targetY = st.baseY + 2.2;
        st.group.position.z = st.baseZ + 0.28;
      } else if (
        hoveredStickId === st.id &&
        state === 'ready' &&
        !shaking &&
        !ejecting &&
        inspectedStickId === null &&
        !isStirring
      ) {
        // 🖐️ 未拔起试看时，鼠标滑过微浮 0.5 个单位引导挑签
        st.targetY = st.baseY + 0.5;
        st.group.position.z = st.baseZ;
      } else {
        // ↩ 筒内正常原位
        st.targetY = st.baseY;
        st.group.position.z = st.baseZ;
      }
    });
  }, [ejecting, hoveredStickId, inspectedStickId, effectiveChosenId, state, shaking, isStirring]);

  // 3. 3D Raycasting 与物理搅拌交互
  const getNormalizedPos = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
  };

  const getIntersectedStick = (e: React.PointerEvent): number | null => {
    const camera = cameraRef.current;
    if (!camera) return null;
    const { x, y } = getNormalizedPos(e);
    mousePosRef.current.set(x, y);
    raycasterRef.current.setFromCamera(mousePosRef.current, camera);
    const meshes = sticksDataRef.current.map((st) => st.mesh);
    const intersects = raycasterRef.current.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      return (intersects[0].object.userData.stickId as number) ?? null;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || shaking || ejecting) return;
    const container = containerRef.current;
    if (!container) return;

    try {
      container.setPointerCapture(e.pointerId);
    } catch {}

    const { x, y } = getNormalizedPos(e);
    pointerStartRef.current = { x, y, clientX: e.clientX, clientY: e.clientY };
    prevPointerRef.current = { x, y };
    hasDraggedRef.current = false;
    isPointerDownRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled || shaking || ejecting) return;
    const { x, y } = getNormalizedPos(e);
    pointerSpringRef.current.target.set(x, y);

    if (isPointerDownRef.current) {
      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.clientX,
        e.clientY - pointerStartRef.current.clientY
      );

      if (dist > 6) {
        hasDraggedRef.current = true;
        if (!isStirring) setIsStirring(true);

        // 如果之前有抽出试看的签，在主动搅拌时顺滑滑回筒内
        if (inspectedStickId !== null) {
          setInspectedStickId(null);
          if (soundEnabled) bambooDropSound();
        }

        // 计算围绕中心的切向旋转力矩
        const prev = prevPointerRef.current;
        const anglePrev = Math.atan2(prev.y, prev.x);
        const angleCurr = Math.atan2(y, x);
        let dTheta = angleCurr - anglePrev;
        if (dTheta > Math.PI) dTheta -= Math.PI * 2;
        if (dTheta < -Math.PI) dTheta += Math.PI * 2;

        const dx = x - prev.x;
        dTheta += dx * 0.7;

        angularVelocityRef.current += dTheta * 16.0;
        angularVelocityRef.current = Math.max(-12, Math.min(12, angularVelocityRef.current));
        prevPointerRef.current = { x, y };
      }
    } else {
      // 鼠标自由滑过，检测悬停
      if (inspectedStickId === null) {
        const hitStickId = getIntersectedStick(e);
        if (hitStickId !== hoveredStickId) {
          setHoveredStickId(hitStickId);
          if (hitStickId !== null) {
            const hitData = sticksDataRef.current[hitStickId];
            if (hitData) {
              hitData.wobbleX = (Math.random() - 0.5) * 0.08;
              hitData.wobbleZ = (Math.random() - 0.5) * 0.08;
            }
            const now = Date.now();
            if (soundEnabled && now - lastRustleTimeRef.current > 45) {
              lastRustleTimeRef.current = now;
              bambooRustle(0.75);
            }
          }
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (disabled || shaking || ejecting) return;
    const container = containerRef.current;
    if (container) {
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}
    }

    isPointerDownRef.current = false;
    setIsStirring(false);

    // 如果未产生拖曳，则是纯粹的点击 / 挑签
    if (!hasDraggedRef.current) {
      if (state === 'idle') {
        onShake();
        return;
      }

      const hitStickId = getIntersectedStick(e);

      if (hitStickId !== null) {
        if (hitStickId === inspectedStickId) {
          // 点击当前拔起的签：放回筒内
          setInspectedStickId(null);
          if (soundEnabled) bambooDropSound();
        } else {
          // 抽出该支竹签试看端详！
          setInspectedStickId(hitStickId);
          if (soundEnabled) bambooDrawSound();
        }
      } else {
        // 点击空白案几或筒身：若有抽出的签则放回
        if (inspectedStickId !== null) {
          setInspectedStickId(null);
          if (soundEnabled) bambooDropSound();
        }
      }
    }
  };

  const handlePointerLeave = () => {
    isPointerDownRef.current = false;
    setIsStirring(false);
    setHoveredStickId(null);
  };

  // 放回签筒（换抽别支）
  const handlePutBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || shaking || ejecting) return;
    setInspectedStickId(null);
    if (soundEnabled) bambooDropSound();
  };

  // 心诚掷定 · 确定解此签
  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || shaking || ejecting) return;
    const finalId = inspectedStickId ?? hoveredStickId ?? Math.floor(Math.random() * 36);
    setChosenStickId(finalId);
    if (soundEnabled) bambooDrawSound();
    onShake();
  };

  const toneKey = sheet ? LEVEL_TONE[sheet.stick.level].key : undefined;

  return (
    <div
      className={`cylinder-stage${shaking ? ' shaking' : ''}${ejecting ? ' ejecting' : ''}`}
      data-tone={toneKey}
    >
      {/* 3D WebGL 画布容器（摄影棚舞台） */}
      <div
        className="cylinder-3d-canvas-wrapper"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={en ? 'Interactive 3D Fortune Cylinder' : '3D 互動問籤筒'}
      />

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
          inspectedStickId !== null ? (
            <div className="cylinder-inspect-bar">
              <button
                type="button"
                className="cylinder-putback-btn"
                onClick={handlePutBack}
                disabled={disabled}
                aria-label={en ? 'Put stick back into cylinder' : '放回籤筒'}
              >
                <span aria-hidden="true">↩</span>
                <span>{en ? 'Put Back / Reselect' : '放回籤筒 · 換抽別支'}</span>
              </button>
              <button
                type="button"
                className="cylinder-confirm-btn"
                onClick={handleConfirm}
                disabled={disabled}
                aria-label={en ? `Confirm Stick #${inspectedStickId + 1}` : `確定解第 ${inspectedStickId + 1} 籤`}
              >
                <span aria-hidden="true">✦</span>
                <span>
                  {en
                    ? `Confirm Stick #${inspectedStickId + 1}`
                    : `心誠擲定 · 確定解第 ${inspectedStickId + 1} 籤`}
                </span>
              </button>
            </div>
          ) : isStirring ? (
            <div className="cylinder-stir-prompt stirring">
              <span className="stir-hand-icon spinning" aria-hidden="true">🎋</span>
              <span className="stir-prompt-text">
                {en ? 'Stirring the cylinder... tap any stick to draw' : '攪動籤筒中... 隨時點選竹籤抽起試看'}
              </span>
            </div>
          ) : (
            <div className="cylinder-stir-prompt">
              <span className="stir-hand-icon" aria-hidden="true">🖐️</span>
              <span className="stir-prompt-text">
                {en ? 'Drag to stir sticks · Tap any stick to inspect' : '按住拖曳攪動竹籤 · 點選任意一籤抽起試看'}
              </span>
            </div>
          )
        ) : shaking ? (
          <div className="cylinder-shaking-indicator">
            <span className="shaking-dots" aria-hidden="true" />
            <p className="cylinder-hint active">
              {en ? 'Shaking the bamboo tallies in 3D...' : '心誠則靈，3D 竹籤碰撞搖晃中...'}
            </p>
          </div>
        ) : ejecting ? (
          <div className="cylinder-risen-indicator">
            <p className="cylinder-hint highlight">
              {en
                ? `✦ Lucky stick drawn in 3D! Revealing oracle... ✦`
                : `✦ 神籤破筒拔出！正為您呈遞神諭籤詩... ✦`}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
