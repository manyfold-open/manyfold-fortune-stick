/**
 * 签筒的程序化贴图 —— 全部用 Canvas 2D 现画，一张外部图片都不下载。
 *
 * 只产出 HTMLCanvasElement，不 import three：「画什么」和「怎么贴」分开，
 * 于是版面算术能在 node 下被测到，真正需要 2D context 的部分才留到浏览器里跑。
 */

import { STICK_COUNT, pseudoRandom } from '../../shared/cylinder/geometry';

/* ── 竹籤贴图集：36 格，每格是一支籤的正面 ── */

export const STICK_CELL_W = 72;
export const STICK_CELL_H = 1024;
export const STICK_ATLAS_W = STICK_CELL_W * STICK_COUNT;

export const stickCellRect = (i: number): { x: number; y: number; w: number; h: number } => ({
  x: i * STICK_CELL_W,
  y: 0,
  w: STICK_CELL_W,
  h: STICK_CELL_H,
});

const HAN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1..36 写成签筒上那种汉字签号：第十八籤、第廿三籤、第卅六籤。 */
export function hanNumber(n: number): string {
  if (n < 10) return HAN_DIGITS[n];
  if (n === 10) return '十';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head = tens === 1 ? '十' : tens === 2 ? '廿' : tens === 3 ? '卅' : HAN_DIGITS[tens] + '十';
  return ones === 0 ? head : head + HAN_DIGITS[ones];
}

const SERIF = '"Kaiti SC", "STKaiti", "BiauKai", "DFKai-SB", "Noto Serif TC", serif';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/** 一支竹籤的正面：竹皮底、朱漆籤首、墨书签号。 */
function paintStick(g: CanvasRenderingContext2D, i: number): void {
  const r = stickCellRect(i);
  const rand = pseudoRandom(4001 + i * 97);
  g.save();
  g.translate(r.x, 0);

  // 竹皮：温润的暖黄，越靠边越暗（圆柱受光）
  const base = g.createLinearGradient(0, 0, r.w, 0);
  base.addColorStop(0.0, '#b9a97e');
  base.addColorStop(0.18, '#ddd0a8');
  base.addColorStop(0.5, '#e8dcb8');
  base.addColorStop(0.82, '#d2c39a');
  base.addColorStop(1.0, '#a89877');
  g.fillStyle = base;
  g.fillRect(0, 0, r.w, r.h);

  // 竹纤维：细密的纵向丝纹
  for (let k = 0; k < 150; k += 1) {
    g.fillStyle = `rgba(120, 100, 62, ${(0.03 + rand() * 0.06).toFixed(3)})`;
    g.fillRect(rand() * r.w, rand() * r.h, 0.8, 40 + rand() * 260);
  }
  // 竹节：两三道横向的深色环
  for (let k = 0; k < 3; k += 1) {
    const y = r.h * (0.26 + k * 0.26) + rand() * 30;
    g.fillStyle = 'rgba(122, 98, 56, 0.22)';
    g.fillRect(0, y, r.w, 3);
    g.fillStyle = 'rgba(255, 246, 214, 0.18)';
    g.fillRect(0, y + 3, r.w, 2);
  }

  // 朱漆籤首（顶端那一截红漆）
  const tip = g.createLinearGradient(0, 0, 0, r.h * 0.17);
  tip.addColorStop(0, '#9e2420');
  tip.addColorStop(0.75, '#8d1f1c');
  tip.addColorStop(1, '#7a1a18');
  g.fillStyle = tip;
  g.fillRect(0, 0, r.w, r.h * 0.17);
  g.fillStyle = 'rgba(255, 220, 190, 0.16)';
  g.fillRect(0, r.h * 0.17 - 3, r.w, 3);

  // 墨书签号，直排
  g.fillStyle = 'rgba(28, 22, 18, 0.88)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 40px ${SERIF}`;
  const label = ['第', ...hanNumber(i + 1), '籤'];
  const top = r.h * 0.26;
  for (let k = 0; k < label.length; k += 1) {
    g.fillText(label[k], r.w / 2, top + k * 46);
  }
  g.restore();
}

export function createStickAtlas(): HTMLCanvasElement {
  const cv = makeCanvas(STICK_ATLAS_W, STICK_CELL_H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  for (let i = 0; i < STICK_COUNT; i += 1) paintStick(g, i);
  return cv;
}

/* ── 筒身：老紫檀生漆 + 阴刻描金「問籤」 ── */

export function createTubeCanvas(): HTMLCanvasElement {
  const W = 1024;
  const H = 1024;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const rand = pseudoRandom(77);

  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0.0, '#2e1a12');
  base.addColorStop(0.22, '#6b3721');
  base.addColorStop(0.48, '#8d4b2b');
  base.addColorStop(0.72, '#5a2c1b');
  base.addColorStop(1.0, '#2a170f');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // 纵向木纹导管
  for (let i = 0; i < 620; i += 1) {
    g.fillStyle = `rgba(14, 7, 4, ${(0.03 + rand() * 0.08).toFixed(3)})`;
    g.fillRect(rand() * W, 0, 1 + rand() * 2.2, H);
  }
  for (let i = 0; i < 200; i += 1) {
    g.fillStyle = `rgba(196, 132, 84, ${(0.015 + rand() * 0.03).toFixed(3)})`;
    g.fillRect(rand() * W, 0, 1, H);
  }
  // 生漆的温润反光带
  const sheen = g.createLinearGradient(0, 0, W, 0);
  sheen.addColorStop(0.0, 'rgba(255, 220, 180, 0)');
  sheen.addColorStop(0.34, 'rgba(255, 224, 186, 0.10)');
  sheen.addColorStop(0.46, 'rgba(255, 236, 205, 0.16)');
  sheen.addColorStop(0.6, 'rgba(255, 220, 180, 0.05)');
  sheen.addColorStop(1.0, 'rgba(255, 220, 180, 0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);

  // 阴刻描金「問籤」直排，落在正面（u ≈ 0.5）
  const cx = W * 0.5;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 96px ${SERIF}`;
  const gold = g.createLinearGradient(0, H * 0.3, 0, H * 0.66);
  gold.addColorStop(0.0, '#fff3cf');
  gold.addColorStop(0.4, '#e8bf63');
  gold.addColorStop(0.75, '#a87a22');
  gold.addColorStop(1.0, '#d9ab4e');
  for (let k = 0; k < 2; k += 1) {
    const ch = k === 0 ? '問' : '籤';
    const y = H * 0.4 + k * 130;
    // 先刻（暗边），再描金
    g.fillStyle = 'rgba(10, 5, 3, 0.75)';
    g.fillText(ch, cx + 2.5, y + 2.5);
    g.fillStyle = gold;
    g.fillText(ch, cx, y);
  }
  return cv;
}

/** 黄铜箍：拉丝 + 细微氧化。 */
export function createBrassCanvas(): HTMLCanvasElement {
  const W = 512;
  const H = 64;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const rand = pseudoRandom(31);
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0.0, '#8a6520');
  base.addColorStop(0.3, '#e7c476');
  base.addColorStop(0.52, '#c89b3c');
  base.addColorStop(0.78, '#8f6a24');
  base.addColorStop(1.0, '#6b4d18');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i += 1) {
    g.fillStyle = `rgba(255, 240, 200, ${(0.02 + rand() * 0.05).toFixed(3)})`;
    g.fillRect(rand() * W, 0, 0.8, H);
  }
  for (let i = 0; i < 90; i += 1) {
    g.fillStyle = `rgba(52, 70, 40, ${(0.02 + rand() * 0.05).toFixed(3)})`;
    g.fillRect(rand() * W, rand() * H, 2 + rand() * 6, 1.5);
  }
  return cv;
}

/** 案几上的柔焦接触阴影。 */
export function createBlobCanvas(): HTMLCanvasElement {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const c = S / 2;
  const gr = g.createRadialGradient(c, c, 10, c, c, S * 0.47);
  gr.addColorStop(0.0, 'rgba(14, 9, 6, 0.55)');
  gr.addColorStop(0.32, 'rgba(14, 9, 6, 0.32)');
  gr.addColorStop(0.65, 'rgba(14, 9, 6, 0.11)');
  gr.addColorStop(1.0, 'rgba(14, 9, 6, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return cv;
}
