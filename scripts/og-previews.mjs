#!/usr/bin/env node
/**
 * 畫分享連結的預覽圖（og:image），存成 public/og/{no}-{lang}.jpg。
 *
 * worker 裡沒有 canvas，所以這些圖是事先畫好的靜態檔（見 src/app/share.ts 的 renderLinkPreview）。
 * 改了預覽圖的版面、籤詩或語言之後重跑一次，把 public/og/ 一起 commit。
 *
 *   npm run dev                                   # 另一個終端機先開著
 *   node scripts/og-previews.mjs http://localhost:5173            # 全部 36 × 5 張
 *   node scripts/og-previews.mjs http://localhost:5173 18:zh 18:en # 只畫這幾張（輸出到 --out）
 *
 * 用本機的 Chrome（headless）透過 DevTools Protocol 開 tools/og-preview.html，
 * 等頁面標上 data-ready，再把 canvas 讀成 JPEG。Node 22 自帶 WebSocket，不用裝套件。
 */

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const STICK_COUNT = 36;
const LANGUAGES = ['zh', 'en', 'ja', 'ko', 'hi'];
const QUALITY = 0.86;
const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = resolve(outIndex >= 0 ? args.splice(outIndex, 2)[1] : 'public/og');
const [base, ...only] = args;
if (!base) {
  console.error('usage: node scripts/og-previews.mjs <dev-server-url> [no:lang ...] [--out dir]');
  process.exit(1);
}
const jobs = only.length
  ? only.map((pair) => pair.split(':'))
  : Array.from({ length: STICK_COUNT }, (_, i) => LANGUAGES.map((l) => [String(i + 1), l])).flat();

const profile = await mkdtemp(join(tmpdir(), 'og-previews-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);

async function pageSocket() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await pageSocket());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolveMessage) => {
    const id = (nextId += 1);
    pending.set(id, resolveMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

try {
  await mkdir(outDir, { recursive: true });
  for (const [no, lang] of jobs) {
    await send('Page.navigate', { url: new URL(`tools/og-preview.html?s=${no}&l=${lang}`, base).toString() });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      ready = await evaluate(`document.body?.dataset.ready === 'true' && location.search.includes('s=${no}&l=${lang}')`).catch(() => false);
    }
    if (!ready) throw new Error(`${no}-${lang}: page never became ready`);
    const dataUrl = await evaluate(`document.querySelector('canvas').toDataURL('image/jpeg', ${QUALITY})`);
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
    await writeFile(join(outDir, `${no}-${lang}.jpg`), bytes);
    console.log(`${no}-${lang}.jpg  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
} finally {
  ws.close();
  chrome.kill();
  await rm(profile, { recursive: true, force: true });
}
