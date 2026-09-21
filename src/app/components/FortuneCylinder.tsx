/**
 * 正统宫庙 True 3D 朱砂生漆问签筒（Three.js WebGL 拟真实现）。
 *
 * 核心互动：
 * 1. 真实 3D 漆器圆柱立面（MeshPhysicalMaterial 生漆高光清漆、描金「问签」与如意金云）。
 * 2. 满筒 36 支 3D 楠竹木签（红漆雕口签首 + 原木竹纹）。
 * 3. 实时 3D 鼠标/触控交互：
 *    - 划过/拖拽竹签群：Raycaster 碰撞检测，竹签随指针物理起伏拨动、摇晃碰撞（发出 bambooRustle 撞击声）。
 *    - 自由挑签：靠近的竹签在 3D 空间中主动拔高探头（浮现「抽」字金色标籤），供求签者从容挑选。
 *    - 点选抽起：点击所选神签，该签破筒拔高升空，金光圣环激荡，浮现烫金签号（bambooDrawSound）。
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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

interface Stick3DData {
  mesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  stemMesh: THREE.Mesh;
  inscriptionMesh?: THREE.Mesh;
  id: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotX: number;
  baseRotZ: number;
  currentY: number;
  targetY: number;
  wobbleX: number;
  wobbleZ: number;
  isChosen: boolean;
}

/**
 * 动态绘制筒身生漆描金「問 籤」高精度贴图
 */
function createCylinderTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. 底层宫庙朱砂生漆质感渐变（极具温润光泽与深度）
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  bgGrad.addColorStop(0.0, '#42080a');
  bgGrad.addColorStop(0.18, '#6b1114');
  bgGrad.addColorStop(0.5, '#991c1f');
  bgGrad.addColorStop(0.82, '#6b1114');
  bgGrad.addColorStop(1.0, '#42080a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. 细微金粉飞屑（生漆莳绘工法）
  ctx.fillStyle = 'rgba(255, 235, 170, 0.15)';
  for (let i = 0; i < 220; i++) {
    const rx = Math.random() * canvas.width;
    const ry = Math.random() * canvas.height;
    ctx.fillRect(rx, ry, Math.random() * 2 + 1, Math.random() * 2 + 1);
  }

  // 3. 描金楷书大字「問 籤」
  const cx = canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 138px "Kaiti SC", "STKaiti", "BiauKai", "DFKai-SB", "Noto Serif TC", serif';

  const goldGrad = ctx.createLinearGradient(0, 240, 0, 680);
  goldGrad.addColorStop(0.0, '#ffffff');
  goldGrad.addColorStop(0.2, '#fff4cb');
  goldGrad.addColorStop(0.5, '#f5c64b');
  goldGrad.addColorStop(0.8, '#b8821d');
  goldGrad.addColorStop(1.0, '#754b08');

  // 深邃漆刻阴影 + 描金浮雕层
  ctx.shadowColor = 'rgba(10, 0, 0, 0.95)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = goldGrad;
  ctx.fillText('問', cx, 350);
  ctx.fillText('籤', cx, 520);

  // 浮雕亮金边勾勒
  ctx.shadowColor = 'rgba(255, 225, 130, 0.8)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(255, 245, 200, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.strokeText('問', cx, 350);
  ctx.strokeText('籤', cx, 520);

  // 4. 如意金祥云
  ctx.shadowColor = 'rgba(10, 0, 0, 0.85)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = goldGrad;
  const cy = 665;
  ctx.beginPath();
  ctx.arc(cx - 40, cy + 4, 18, 0, Math.PI * 2);
  ctx.arc(cx - 15, cy - 8, 23, 0, Math.PI * 2);
  ctx.arc(cx + 15, cy - 8, 23, 0, Math.PI * 2);
  ctx.arc(cx + 40, cy + 4, 18, 0, Math.PI * 2);
  ctx.fill();

  // 5. 朱砂方印「問一」
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#7a1214';
  ctx.strokeStyle = '#e6ba50';
  ctx.lineWidth = 2.5;
  const sx = cx + 62;
  const sy = cy - 6;
  ctx.fillRect(sx, sy, 44, 44);
  ctx.strokeRect(sx, sy, 44, 44);

  ctx.fillStyle = '#fff6e0';
  ctx.font = '700 22px "Kaiti SC", "STKaiti", serif';
  ctx.fillText('問', sx + 22, sy + 14);
  ctx.fillText('一', sx + 22, sy + 31);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 动态绘制竹签木纹与红漆签头贴图
 */
function createBambooStickTexture(isHead = false, stickNoText?: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  if (isHead) {
    // 签头正统宫庙深红朱砂生漆
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0.0, '#420b0d');
    grad.addColorStop(0.2, '#6f1416');
    grad.addColorStop(0.5, '#9a1d20');
    grad.addColorStop(0.8, '#6f1416');
    grad.addColorStop(1.0, '#420b0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 金漆签头顶端金箔倒角
    ctx.fillStyle = '#f5c64b';
    ctx.fillRect(0, 0, canvas.width, 8);

    // 宫庙传统双侧阴刻倒梯形刻槽
    ctx.fillStyle = 'rgba(15, 0, 0, 0.7)';
    ctx.fillRect(0, 52, canvas.width, 7);
    ctx.fillStyle = 'rgba(255, 235, 175, 0.45)';
    ctx.fillRect(0, 59, canvas.width, 2.5);

    // 如果有铭文（如第 1 签）
    if (stickNoText) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff6db';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 8;
      ctx.font = '800 36px "Kaiti SC", "STKaiti", serif';
      const chars = stickNoText.split('');
      const startY = 120;
      chars.forEach((char, idx) => {
        ctx.fillText(char, canvas.width / 2, startY + idx * 44);
      });
    }
  } else {
    // 楠竹陈年竹木原色（质朴温润，竹节分明）
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0.0, '#754a1d');
    grad.addColorStop(0.25, '#a4743b');
    grad.addColorStop(0.5, '#c59a58');
    grad.addColorStop(0.75, '#b58747');
    grad.addColorStop(1.0, '#754a1d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 竹节阴阳线 (Bamboo nodes)
    ctx.fillStyle = 'rgba(40, 20, 5, 0.35)';
    ctx.fillRect(0, 160, canvas.width, 5);
    ctx.fillRect(0, 340, canvas.width, 5);
    ctx.fillStyle = 'rgba(255, 235, 180, 0.25)';
    ctx.fillRect(0, 165, canvas.width, 2);
    ctx.fillRect(0, 345, canvas.width, 2);

    // 细微竹纤维条纹
    ctx.fillStyle = 'rgba(55, 30, 10, 0.18)';
    for (let i = 0; i < 45; i++) {
      ctx.fillRect(Math.random() * canvas.width, 0, Math.random() * 2 + 0.5, canvas.height);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function FortuneCylinder(props: FortuneCylinderProps) {
  const { state, sheet, fault, language, soundEnabled = true, onShake, disabled } = props;
  const en = language === 'en';
  const shaking = state === 'shaking';
  const ejecting = state === 'ejecting';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredStickId, setHoveredStickId] = useState<number | null>(null);
  const [chosenStickId, setChosenStickId] = useState<number | null>(null);

  // Three.js 核心对象保存
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sticksDataRef = useRef<Stick3DData[]>([]);
  const cylinderGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2(-999, -999));
  const isPointerDownRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const lastRustleTimeRef = useRef(0);
  const haloLightRef = useRef<THREE.PointLight | null>(null);

  const effectiveChosenId = chosenStickId ?? 18;

  // 1. 初始化 Three.js 场景、材质与竹签群
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 场景与透视相机
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    // 聚焦大型拟真 3D 签筒与满束神签
    camera.position.set(0, 2.3, 12.8);
    camera.lookAt(0, 2.0, 0);
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

    // 灯光体系：暖调东方庙堂光影（温润内敛，杜绝过曝）
    const ambientLight = new THREE.AmbientLight(0xffedd8, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff6e4, 1.75);
    dirLight.position.set(5, 13, 9);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 28;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.0008;
    scene.add(dirLight);

    const rimLight = new THREE.PointLight(0xffa855, 1.5, 20);
    rimLight.position.set(-6, 4, 6);
    scene.add(rimLight);

    // 神签探出时的金光圣环光源
    const haloLight = new THREE.PointLight(0xffd700, 0, 16);
    haloLight.position.set(0, 5.2, 2.2);
    scene.add(haloLight);
    haloLightRef.current = haloLight;

    // 签筒主体 Group（底部置于 -2.2）
    const cylinderGroup = new THREE.Group();
    cylinderGroup.position.set(0, -2.2, 0);
    scene.add(cylinderGroup);
    cylinderGroupRef.current = cylinderGroup;

    // ── 制作 3D 朱砂生漆外筒（更大更雄伟） ──
    const cylRadiusTop = 2.65;
    const cylRadiusBottom = 2.45;
    const cylHeight = 5.2;
    const cylSegments = 64;

    const cylinderTexture = createCylinderTexture();
    const cylMat = new THREE.MeshPhysicalMaterial({
      map: cylinderTexture,
      color: 0xffffff,
      roughness: 0.20,
      metalness: 0.05,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
    });

    const cylGeo = new THREE.CylinderGeometry(cylRadiusTop, cylRadiusBottom, cylHeight, cylSegments, 1, false);
    // 旋转贴图 180° 使描金「問 籤」正对相机 (+Z)
    cylGeo.rotateY(Math.PI);
    const cylinderMesh = new THREE.Mesh(cylGeo, cylMat);
    cylinderMesh.position.y = cylHeight / 2;
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = true;
    cylinderGroup.add(cylinderMesh);

    // 筒内空腔深渊（Dark Interior）
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x120203, side: THREE.BackSide });
    const innerGeo = new THREE.CylinderGeometry(cylRadiusTop - 0.12, cylRadiusBottom - 0.12, cylHeight - 0.1, 48, 1, true);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.y = cylHeight / 2 + 0.05;
    cylinderGroup.add(innerMesh);

    // 筒口凸雕实木箍环
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x480a0c, roughness: 0.35, metalness: 0.2 });
    const topBand1 = new THREE.Mesh(new THREE.TorusGeometry(cylRadiusTop + 0.04, 0.065, 16, 64), bandMat);
    topBand1.rotation.x = Math.PI / 2;
    topBand1.position.y = cylHeight - 0.12;
    cylinderGroup.add(topBand1);

    const topBand2 = new THREE.Mesh(new THREE.TorusGeometry(cylRadiusTop + 0.02, 0.05, 16, 64), bandMat);
    topBand2.rotation.x = Math.PI / 2;
    topBand2.position.y = cylHeight - 0.36;
    cylinderGroup.add(topBand2);

    // 筒底实木基座箍环
    const bottomBand = new THREE.Mesh(new THREE.CylinderGeometry(cylRadiusBottom + 0.12, cylRadiusBottom + 0.15, 0.38, 48), bandMat);
    bottomBand.position.y = 0.19;
    cylinderGroup.add(bottomBand);

    // 案几地面柔和落影接收面
    const groundGeo = new THREE.PlaneGeometry(28, 28);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.38 });
    const groundMesh = new THREE.Mesh(groundGeo, shadowMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -2.21;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // ── 制作 36 支 3D 楠竹木签群 ──
    const sticksList: Stick3DData[] = [];
    const stickStemMat = new THREE.MeshStandardMaterial({
      map: createBambooStickTexture(false),
      roughness: 0.55,
      metalness: 0.05,
    });
    const stickHeadMat = new THREE.MeshStandardMaterial({
      map: createBambooStickTexture(true),
      roughness: 0.25,
      metalness: 0.1,
    });

    const totalSticks = 36;
    const stickW = 0.28;
    const stickH = 7.2;
    const stickD = 0.08;

    // 按照 3 圈同心圆科学散布，确保绝不穿出筒壁（筒口半径 2.65）
    // Ring 0: 6 支 (r = 0.56)
    // Ring 1: 12 支 (r = 1.18)
    // Ring 2: 18 支 (r = 1.78)
    const ringConfig = [
      { count: 6, radius: 0.56 },
      { count: 12, radius: 1.18 },
      { count: 18, radius: 1.78 },
    ];

    let stickIndex = 0;
    ringConfig.forEach((ring, ringIdx) => {
      for (let j = 0; j < ring.count; j++) {
        const i = stickIndex++;
        const p = j / ring.count;
        const angle = p * Math.PI * 2 + ringIdx * 0.45;
        // 椭圆微调整增加自然散漫感
        const rJitter = ring.radius + ((i * 7) % 5) * 0.03 - 0.06;
        const x = Math.cos(angle) * rJitter * 1.05;
        const z = Math.sin(angle) * rJitter * 0.92;

        // 顶部自然穹顶微凸起伏（中心稍高，边缘稍低）
        const domeArch = (1 - ring.radius / 2.0) * 0.35;
        const jitter = ((i * 13) % 7) * 0.04 - 0.12;
        // 根部置于筒底上方 0.6
        const y = 0.6 + domeArch + jitter;

        // 扇形向外自然微倾（3° ~ 7°，根据距筒心距离自然倾斜）
        const tiltFactor = (ring.radius / 1.8) * 0.09;
        const rotZ = -Math.cos(angle) * tiltFactor + ((i % 3) - 1) * 0.015;
        const rotX = Math.sin(angle) * tiltFactor + (((i * 3) % 5) - 2) * 0.01;

        // 组合：木签主干 + 红漆签头
        const stickGroup = new THREE.Group();
        stickGroup.position.set(x, y, z);
        stickGroup.rotation.x = rotX;
        stickGroup.rotation.z = rotZ;

        // 下段原木竹身
        const stemHeight = stickH * 0.58;
        const stemGeo = new THREE.BoxGeometry(stickW, stemHeight, stickD);
        const stemMesh = new THREE.Mesh(stemGeo, stickStemMat);
        stemMesh.position.y = stemHeight / 2;
        stemMesh.castShadow = true;
        stemMesh.userData = { stickId: i };
        stickGroup.add(stemMesh);

        // 上段红漆雕口签头
        const headHeight = stickH * 0.42;
        const headGeo = new THREE.BoxGeometry(stickW, headHeight, stickD);
        const headMesh = new THREE.Mesh(headGeo, stickHeadMat);
        headMesh.position.y = stemHeight + headHeight / 2;
        headMesh.castShadow = true;
        headMesh.userData = { stickId: i };
        stickGroup.add(headMesh);

        cylinderGroup.add(stickGroup);

        sticksList.push({
          mesh: stickGroup as unknown as THREE.Mesh,
          headMesh,
          stemMesh,
          id: i,
          baseX: x,
          baseY: y,
          baseZ: z,
          baseRotX: rotX,
          baseRotZ: rotZ,
          currentY: y,
          targetY: y,
          wobbleX: 0,
          wobbleZ: 0,
          isChosen: false,
        });
      }
    });

    sticksDataRef.current = sticksList;

    // ── 动画主循环 ──
    let animId: number;
    let startTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) * 0.001;

      // 摇晃状态（Shaking）
      if (props.state === 'shaking') {
        const shakeSway = Math.sin(elapsed * 24) * 0.12;
        cylinderGroup.rotation.z = shakeSway;
        cylinderGroup.position.x = Math.cos(elapsed * 20) * 0.08;

        // 竹签密集起伏跳动
        sticksList.forEach((st, idx) => {
          const hop = Math.abs(Math.sin(elapsed * 18 + idx * 0.7)) * 0.35;
          st.mesh.position.y = st.baseY + hop;
        });
      } else {
        cylinderGroup.rotation.z *= 0.85;
        cylinderGroup.position.x *= 0.85;

        // 平常/挑签/探出状态下的弹簧插值
        sticksList.forEach((st) => {
          // 柔和弹簧趋向 targetY
          st.currentY += (st.targetY - st.currentY) * 0.16;
          st.mesh.position.y = st.currentY;

          // 微动弹性阻尼恢复
          st.wobbleZ *= 0.88;
          st.mesh.rotation.z = st.baseRotZ + st.wobbleZ;
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
      cylinderTexture.dispose();
      stickStemMat.dispose();
      stickHeadMat.dispose();
    };
  }, []);

  // 2. 状态驱动 3D 表现：挑签探头与神签拔高
  useEffect(() => {
    const sticks = sticksDataRef.current;
    if (sticks.length === 0) return;

    sticks.forEach((st) => {
      const isChosen = st.id === effectiveChosenId;

      if (ejecting && isChosen) {
        // 🌟 神签拔高升空 2.2 个单位！破筒而出！
        st.targetY = st.baseY + 2.4;
        st.mesh.position.z = st.baseZ + 0.3; // 向前突出
        // 打开金光照射
        if (haloLightRef.current) haloLightRef.current.intensity = 3.5;

        // 替换签头贴图为带铭文贴图
        if (sheet) {
          const inscribedTex = createBambooStickTexture(true, en ? `NO.${sheet.stick.no}` : `第${sheet.stick.no}籤`);
          (st.headMesh.material as THREE.MeshStandardMaterial).map = inscribedTex;
          (st.headMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      } else if (hoveredStickId === st.id && state === 'ready' && !shaking && !ejecting) {
        // 🖐️ 鼠标悬停挑签探头 0.7 个单位
        st.targetY = st.baseY + 0.75;
      } else {
        // 复位原高
        st.targetY = st.baseY;
      }
    });
  }, [ejecting, hoveredStickId, effectiveChosenId, state, shaking, sheet, en]);

  // 3. 3D Raycasting 鼠标/触控交互（搅拌与点选）
  const updateRaycaster = (e: React.PointerEvent) => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mousePosRef.current.set(x, y);

    raycasterRef.current.setFromCamera(mousePosRef.current, camera);
    const candidateMeshes: THREE.Mesh[] = [];
    sticksDataRef.current.forEach((st) => {
      candidateMeshes.push(st.headMesh, st.stemMesh);
    });
    const intersects = raycasterRef.current.intersectObjects(candidateMeshes, false);

    if (intersects.length > 0) {
      const hitStickId = intersects[0].object.userData.stickId as number;
      if (hitStickId !== hoveredStickId) {
        setHoveredStickId(hitStickId);

        // 拨弄竹签微晃动弹簧物理
        const hitData = sticksDataRef.current[hitStickId];
        if (hitData) hitData.wobbleZ = (Math.random() - 0.5) * 0.12;

        // 真实竹木碰撞音效
        const now = Date.now();
        if (soundEnabled && now - lastRustleTimeRef.current > 48) {
          lastRustleTimeRef.current = now;
          bambooRustle(0.7);
        }
      }
    } else {
      if (!isPointerDownRef.current) setHoveredStickId(null);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isPointerDownRef.current = true;
    lastMouseXRef.current = e.clientX;
    updateRaycaster(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (shaking || ejecting) return;
    updateRaycaster(e);

    // 拖动搅拌：推动竹签群体碰撞
    if (isPointerDownRef.current) {
      const deltaX = e.clientX - lastMouseXRef.current;
      lastMouseXRef.current = e.clientX;

      if (Math.abs(deltaX) > 2) {
        sticksDataRef.current.forEach((st) => {
          st.wobbleZ += deltaX * 0.003;
        });
        const now = Date.now();
        if (soundEnabled && now - lastRustleTimeRef.current > 55) {
          lastRustleTimeRef.current = now;
          bambooRustle(0.85);
        }
      }
    }
  };

  const handlePointerUp = () => {
    isPointerDownRef.current = false;
  };

  const handlePointerLeave = () => {
    isPointerDownRef.current = false;
    setHoveredStickId(null);
  };

  // 点击 3D 签筒抽取选中的那一支
  const handleCanvasClick = () => {
    if (disabled || shaking || ejecting) return;
    if (state === 'idle') {
      onShake();
      return;
    }

    // 确定挑中的竹签
    const chosenId = hoveredStickId ?? Math.floor(Math.random() * 36);
    setChosenStickId(chosenId);
    if (soundEnabled) bambooDrawSound();
    onShake();
  };

  const toneKey = sheet ? LEVEL_TONE[sheet.stick.level].key : undefined;

  return (
    <div
      className={`cylinder-stage${shaking ? ' shaking' : ''}${ejecting ? ' ejecting' : ''}`}
      data-tone={toneKey}
    >
      {/* 3D WebGL 画布容器（大幅扩大尺寸） */}
      <div
        className="cylinder-3d-canvas-wrapper"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleCanvasClick}
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
          hoveredStickId !== null ? (
            <button
              type="button"
              className="cylinder-shake-btn pick-active"
              onClick={handleCanvasClick}
              disabled={disabled}
            >
              <span className="shake-btn-icon" aria-hidden="true">✦</span>
              <span className="shake-btn-text">
                {en ? `Draw Chosen Stick #${hoveredStickId + 1}` : `心誠擇定 · 抽出此第 ${hoveredStickId + 1} 籤`}
              </span>
            </button>
          ) : (
            <div className="cylinder-stir-prompt" onClick={handleCanvasClick}>
              <span className="stir-hand-icon" aria-hidden="true">🖐️</span>
              <span className="stir-prompt-text">
                {en ? 'Stir in 3D & click any stick to draw' : '3D 攪動竹籤 · 隨心點選一籤抽出'}
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
