/**
 * 打印机与交互的拟真音效，使用 WebAudio 纯算法合成，不下载任何音频文件。
 * 3D 签筒（神社主题）用到的：在绘马上写字 typeTick、竹签 bamboo*、揭晓的铃 suzu、落印 stampSound、签纸翻面 paperSettleSound。
 *
 * 手機上要能響，AudioContext 得在一個「放手」的手勢裡被叫醒（installAudioUnlock）——
 * 見下面那段說明。
 */

import type { StickLevel } from '../shared/sticks';

let context: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    // suspended：還沒被手勢叫醒；interrupted：iOS 切到背景、來電之後。不在手勢裡的話 resume 會被拒，
    // 那就等下一次手勢（installAudioUnlock），別丟出未處理的 rejection
    if (context.state !== 'running' && context.state !== 'closed') void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

/**
 * 手機（尤其 iOS Safari）沒有聲音的原因：第一個音效通常是攪籤時的沙沙聲，從 requestAnimationFrame
 * 裡叫出來 —— 那不是手勢，AudioContext 建出來就停在 suspended，之後每次 resume 也都不在手勢裡，
 * 一整局都是啞的。桌機 Chrome 碰過頁面一次就放行，所以只有手機聽不到。
 *
 * iOS 只認「放開」那一下（touchend / pointerup / click，外加按鍵），按下（touchstart / pointerdown）
 * 不算。所以在這幾個事件上：還沒在跑就當場 resume，再播一個 1 取樣的靜音 —— 舊版 iOS 要在手勢裡
 * 真的有聲音開始播，才算解鎖。一直掛著：切到背景回來 iOS 會把它變成 interrupted，下一次點擊再救回來。
 * 已經在跑的話只是讀一次 state，不花什麼。
 *
 * `enabled` 是使用者的聲音開關 —— 關著就不建 AudioContext。回傳拆掉監聽的函式。
 */
export function installAudioUnlock(enabled: () => boolean): () => void {
  const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
  const unlock = (): void => {
    if (context?.state === 'running' || !enabled()) return;
    const audio = ctx();
    if (!audio) return;
    try {
      const blip = audio.createBufferSource();
      blip.buffer = audio.createBuffer(1, 1, audio.sampleRate);
      blip.connect(audio.destination);
      blip.start(0);
    } catch {
      /* 解不開就算了，下一次手勢再試 */
    }
  };
  for (const name of events) window.addEventListener(name, unlock, { capture: true, passive: true });
  return () => {
    for (const name of events) window.removeEventListener(name, unlock, { capture: true });
  };
}

/** 一段衰减的噪声，模拟实体材质与空气阻尼摩擦 */
function noiseBuffer(audio: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-decay * i) / length);
  }
  return buffer;
}

/**
 * 在繪馬上寫字：筆尖在木牌上輕輕一劃（以前是機械鍵帽的「喀」，跟神社不搭）。
 * 一段很短、偏中頻的柔和摩擦，外加一點點木頭的悶響；每一下音色略有不同。
 */
export function typeTick(gain = 0.055): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;
  const stroke = 0.045 + Math.random() * 0.025;

  // 1. 筆尖擦過木紋
  const brush = audio.createBufferSource();
  brush.buffer = noiseBuffer(audio, stroke, 3);
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1500 + Math.random() * 700, start);
  bp.frequency.exponentialRampToValueAtTime(900 + Math.random() * 300, start + stroke);
  bp.Q.setValueAtTime(0.9, start);
  const brushGain = audio.createGain();
  brushGain.gain.setValueAtTime(0.0001, start);
  brushGain.gain.exponentialRampToValueAtTime(gain * 1.1, start + 0.008);
  brushGain.gain.exponentialRampToValueAtTime(0.0001, start + stroke);
  brush.connect(bp).connect(brushGain).connect(audio.destination);
  brush.start(start);

  // 2. 木牌本身的一點悶響
  const body = audio.createOscillator();
  body.type = 'triangle';
  const pitch = 320 + Math.random() * 80;
  body.frequency.setValueAtTime(pitch, start);
  const bodyGain = audio.createGain();
  bodyGain.gain.setValueAtTime(gain * 0.25, start);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
  body.connect(bodyGain).connect(audio.destination);
  body.start(start);
  body.stop(start + 0.035);
}

/** 按下面板实体按键：深沉机械开关触底与弹簧回弹 */
export function press(gain = 0.22): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  // 外壳微撞
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer(audio, 0.06, 18);
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1600, start);
  filter.Q.setValueAtTime(3.2, start);

  const volume = audio.createGain();
  volume.gain.setValueAtTime(gain, start);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);

  source.connect(filter).connect(volume).connect(audio.destination);
  source.start(start);

  // 按键深层「咚」感
  const thud = audio.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(160, start);
  thud.frequency.exponentialRampToValueAtTime(55, start + 0.07);

  const thudGain = audio.createGain();
  thudGain.gain.setValueAtTime(gain * 0.8, start);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);

  thud.connect(thudGain).connect(audio.destination);
  thud.start(start);
  thud.stop(start + 0.08);
}

/**
 * 走纸：真实热敏打印机高频步进马达（Stepper Motor）微步脉冲 + 滚轮与纸张摩擦质感
 */
export function motor(ms: number): () => void {
  const audio = ctx();
  if (!audio) return () => undefined;
  const start = audio.currentTime;
  const seconds = ms / 1000;

  // 1. 步进马达齿轮脉冲（轻微调制的高频机械嗡鸣）
  const stepper = audio.createOscillator();
  stepper.type = 'sawtooth';
  stepper.frequency.setValueAtTime(260, start);
  stepper.frequency.linearRampToValueAtTime(290, start + 0.15);
  stepper.frequency.setValueAtTime(290, start + seconds - 0.2);
  stepper.frequency.linearRampToValueAtTime(210, start + seconds);

  const stepperFilter = audio.createBiquadFilter();
  stepperFilter.type = 'bandpass';
  stepperFilter.frequency.setValueAtTime(580, start);
  stepperFilter.Q.setValueAtTime(2.0, start);

  const stepperGain = audio.createGain();
  stepperGain.gain.setValueAtTime(0.0001, start);
  stepperGain.gain.exponentialRampToValueAtTime(0.038, start + 0.08);
  stepperGain.gain.setValueAtTime(0.038, start + seconds - 0.12);
  stepperGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  // 2. 低沉机械底噪
  const subHum = audio.createOscillator();
  subHum.type = 'sine';
  subHum.frequency.setValueAtTime(78, start);
  const subFilter = audio.createBiquadFilter();
  subFilter.type = 'lowpass';
  subFilter.frequency.setValueAtTime(140, start);
  const subGain = audio.createGain();
  subGain.gain.setValueAtTime(0.0001, start);
  subGain.gain.exponentialRampToValueAtTime(0.045, start + 0.06);
  subGain.gain.setValueAtTime(0.045, start + seconds - 0.1);
  subGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  // 3. 纸张被橡胶滚轮匀速带出的沙沙摩擦声
  const paper = audio.createBufferSource();
  paper.buffer = noiseBuffer(audio, seconds, 0.25);
  paper.loop = false;

  const paperFilter = audio.createBiquadFilter();
  paperFilter.type = 'bandpass';
  paperFilter.frequency.setValueAtTime(2400, start);
  paperFilter.Q.setValueAtTime(0.9, start);

  const paperGain = audio.createGain();
  paperGain.gain.setValueAtTime(0.0001, start);
  paperGain.gain.exponentialRampToValueAtTime(0.032, start + 0.15);
  paperGain.gain.setValueAtTime(0.032, start + seconds - 0.1);
  paperGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  stepper.connect(stepperFilter).connect(stepperGain).connect(audio.destination);
  subHum.connect(subFilter).connect(subGain).connect(audio.destination);
  paper.connect(paperFilter).connect(paperGain).connect(audio.destination);

  stepper.start(start);
  stepper.stop(start + seconds + 0.05);
  subHum.start(start);
  subHum.stop(start + seconds + 0.05);
  paper.start(start);

  return () => {
    try {
      stepper.stop();
      subHum.stop();
      paper.stop();
    } catch {
      /* 已经停止 */
    }
  };
}

/**
 * 摇签筒：竹签在生漆木筒内相互撞击的真实「沙沙沙、嗒嗒嗒」竹木碰撞回声
 */
export function bambooRattle(ms: number): () => void {
  const audio = ctx();
  if (!audio) return () => undefined;
  const start = Math.max(0, audio.currentTime);
  const seconds = ms / 1000;
  let active = true;

  try {
    // 1. 竹签密集细碎摩擦声（以白噪声经过窄带滤波调制）
    const noise = audio.createBufferSource();
    noise.buffer = noiseBuffer(audio, seconds, 0.35);
    const noiseFilter = audio.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1800, start);
    noiseFilter.Q.setValueAtTime(2.2, start);

    const noiseGain = audio.createGain();
    noiseGain.gain.setValueAtTime(0.0001, start);
    noiseGain.gain.linearRampToValueAtTime(0.042, start + 0.1);
    noiseGain.gain.setValueAtTime(0.042, Math.max(start + 0.1, start + seconds - 0.15));
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

    noise.connect(noiseFilter).connect(noiseGain).connect(audio.destination);
    noise.start(start);

    // 2. 规律而有机的竹木碰撞微脉冲（敲击共鸣）
    const clicks = Math.floor(ms / 60);
    for (let i = 0; i < clicks; i++) {
      const clickTime = Math.max(start, start + (i * 60 + ((i * 17) % 25)) / 1000);
      if (clickTime >= start + seconds) break;

      const osc = audio.createOscillator();
      osc.type = 'sine';
      const pitch = 650 + ((i * 31) % 400);
      osc.frequency.setValueAtTime(pitch, clickTime);
      osc.frequency.exponentialRampToValueAtTime(180, clickTime + 0.02);

      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 + ((i * 43) % 600), clickTime);
      filter.Q.setValueAtTime(5.0, clickTime);

      const gain = audio.createGain();
      const vol = 0.03 + ((i * 13) % 30) / 1000;
      gain.gain.setValueAtTime(vol, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, clickTime + 0.025);

      osc.connect(filter).connect(gain).connect(audio.destination);
      osc.start(clickTime);
      osc.stop(clickTime + 0.03);
    }

    return () => {
      if (!active) return;
      active = false;
      try {
        noise.stop();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => undefined;
  }
}

/**
 * 搅动/划过竹签：单次短促轻快的竹木刮擦微碰声（极低延迟，用于鼠标/手指搅动时）
 */
export function bambooRustle(intensity = 0.5): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  // 1. 竹木微敲击
  const osc = audio.createOscillator();
  osc.type = 'triangle';
  const pitch = 750 + Math.random() * 450;
  osc.frequency.setValueAtTime(pitch, start);
  osc.frequency.exponentialRampToValueAtTime(180, start + 0.02);

  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1400 + Math.random() * 600, start);
  filter.Q.setValueAtTime(4.0, start);

  const gain = audio.createGain();
  const vol = Math.min(0.05, 0.02 * intensity);
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.022);

  osc.connect(filter).connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + 0.025);

  // 2. 竹皮轻微摩擦微噪
  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer(audio, 0.035, 0.2);
  const nFilter = audio.createBiquadFilter();
  nFilter.type = 'bandpass';
  nFilter.frequency.setValueAtTime(2200 + Math.random() * 400, start);
  nFilter.Q.setValueAtTime(2.5, start);

  const nGain = audio.createGain();
  nGain.gain.setValueAtTime(vol * 0.7, start);
  nGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);

  noise.connect(nFilter).connect(nGain).connect(audio.destination);
  noise.start(start);
}

/**
 * 抽出一签：竹签从密实竹群中滑出拉升的木质摩擦滑音
 */
export function bambooDrawSound(): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  // 1. 竹竿滑动上升音
  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320, start);
  osc.frequency.exponentialRampToValueAtTime(880, start + 0.28);

  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1100, start);
  filter.frequency.linearRampToValueAtTime(2200, start + 0.28);
  filter.Q.setValueAtTime(2.5, start);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.04, start + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);

  osc.connect(filter).connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + 0.35);

  // 2. 伴随摩擦微白噪
  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer(audio, 0.3, 0.25);
  const nFilter = audio.createBiquadFilter();
  nFilter.type = 'bandpass';
  nFilter.frequency.setValueAtTime(1800, start);
  nFilter.frequency.linearRampToValueAtTime(2800, start + 0.28);
  nFilter.Q.setValueAtTime(2.0, start);

  const nGain = audio.createGain();
  nGain.gain.setValueAtTime(0.0001, start);
  nGain.gain.linearRampToValueAtTime(0.035, start + 0.06);
  nGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);

  noise.connect(nFilter).connect(nGain).connect(audio.destination);
  noise.start(start);
}

/**
 * 放回竹签：竹签顺着竹群滑落入筒底，发出清脆沉稳的竹木落底轻敲声
 */
export function bambooDropSound(): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  // 1. 竹竿向下滑动摩擦微音
  const slide = audio.createOscillator();
  slide.type = 'triangle';
  slide.frequency.setValueAtTime(620, start);
  slide.frequency.exponentialRampToValueAtTime(240, start + 0.12);

  const sFilter = audio.createBiquadFilter();
  sFilter.type = 'bandpass';
  sFilter.frequency.setValueAtTime(900, start);
  sFilter.Q.setValueAtTime(2.2, start);

  const sGain = audio.createGain();
  sGain.gain.setValueAtTime(0.0001, start);
  sGain.gain.linearRampToValueAtTime(0.025, start + 0.03);
  sGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);

  slide.connect(sFilter).connect(sGain).connect(audio.destination);
  slide.start(start);
  slide.stop(start + 0.15);

  // 2. 落底敲击木击点
  const tapTime = start + 0.11;
  const knock = audio.createOscillator();
  knock.type = 'sine';
  knock.frequency.setValueAtTime(420, tapTime);
  knock.frequency.exponentialRampToValueAtTime(95, tapTime + 0.07);

  const kFilter = audio.createBiquadFilter();
  kFilter.type = 'lowpass';
  kFilter.frequency.setValueAtTime(800, tapTime);

  const kGain = audio.createGain();
  kGain.gain.setValueAtTime(0.06, tapTime);
  kGain.gain.exponentialRampToValueAtTime(0.0001, tapTime + 0.08);

  knock.connect(kFilter).connect(kGain).connect(audio.destination);
  knock.start(tapTime);
  knock.stop(tapTime + 0.09);
}

/**
 * 神社的鈴（すず）：拜殿前垂著一條紅白麻繩，繩頭一串黃銅鈴，搖一下「沙啷——」。
 * 以前這裡是佛寺的銅磬、頌缽與晨鐘 —— 使用者：「音效也要跟日本神社的感覺對齊」。
 *
 * 第二版：第一版的小鈴放在 2.3～3.8kHz、瞬間起音、再加一段 6kHz 的鐵丸沙聲，使用者說「鈴聲不太舒服」
 * （尖、刺耳）。現在鈴放低到 1.2～1.9kHz、起音放軟（8ms）、餘韻拉長，拿掉那段高頻沙聲，
 * 整串過一道 4kHz 低通，再疊一點點短回聲當作拜殿的空間。籤越好搖得越久；上上签收在一聲低低的大鈴。
 */
export function suzu(level?: StickLevel): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  // 整串的出口：低通去掉刺的高頻，旁邊接一條短回聲
  const tone = audio.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(4000, start);
  tone.Q.setValueAtTime(0.5, start);
  const master = audio.createGain();
  master.gain.setValueAtTime(0.9, start);
  tone.connect(master).connect(audio.destination);

  const echo = audio.createDelay(0.5);
  echo.delayTime.setValueAtTime(0.11, start);
  const echoGain = audio.createGain();
  echoGain.gain.setValueAtTime(0.22, start);
  const echoTone = audio.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.setValueAtTime(2200, start);
  master.connect(echo);
  echo.connect(echoTone).connect(echoGain).connect(audio.destination);
  echoGain.connect(echo);

  // 一顆鈴：基音加兩個弱很多的泛音，軟起音、慢慢散掉
  const ring = (at: number, base: number, vol: number, decay: number) => {
    [
      [1, 1],
      [2.02, 0.22],
      [2.93, 0.08],
    ].forEach(([ratio, amp]) => {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * ratio, at);
      const g = audio.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * amp, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay / ratio);
      osc.connect(g).connect(tone);
      osc.start(at);
      osc.stop(at + decay + 0.05);
    });
  };

  // 搖一下：五、六顆鈴在 120ms 裡錯落響起
  const shake = (at: number, strength: number) => {
    const count = 5 + Math.round(Math.random());
    for (let i = 0; i < count; i += 1) {
      const t = at + (i / count) * 0.12 + Math.random() * 0.02;
      ring(t, 1250 + Math.random() * 650, 0.024 * strength * (0.7 + Math.random() * 0.3), 0.55 + Math.random() * 0.3);
    }
  };

  const plan: Record<StickLevel, number[]> = {
    上上签: [1, 0.8, 0.9],
    上签: [1, 0.8],
    中签: [0.9, 0.65],
    下签: [0.7],
  };
  const shakes = plan[level ?? '中签'];
  shakes.forEach((strength, i) => shake(start + i * 0.26, strength));

  // 上上签：拜殿的大鈴低低一響，把整串收住
  if (level === '上上签') {
    const at = start + shakes.length * 0.26;
    [
      [523, 0.05],
      [1046, 0.012],
    ].forEach(([freq, vol]) => {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      const g = audio.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
      osc.connect(g).connect(tone);
      osc.start(at);
      osc.stop(at + 1.9);
    });
  }

  // 回聲迴路自己會衰減，但節點要放掉：最後一聲響完再斷開
  const end = start + shakes.length * 0.26 + 2.2;
  window.setTimeout(() => {
    try {
      echoGain.disconnect();
      echo.disconnect();
    } catch {
      /* 已經斷開 */
    }
  }, (end - start) * 1000);
}

/** 实木印章落印声：稳重盖在宣纸上的沉实顿挫回弹，按等级定制不同金石厚度 */
export function stampSound(level?: StickLevel, gain = 0.22): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  const mult = level === '上上签' ? 1.25 : level === '下签' ? 0.95 : level === '中签' ? 0.85 : 1.0;
  const targetGain = gain * mult;

  // 木质撞击低频
  const thud = audio.createOscillator();
  thud.type = 'sine';
  const startPitch = level === '上上签' ? 140 : level === '下签' ? 95 : 120;
  const endPitch = level === '上上签' ? 42 : level === '下签' ? 38 : 45;
  const duration = level === '下签' ? 0.08 : 0.06;

  thud.frequency.setValueAtTime(startPitch, start);
  thud.frequency.exponentialRampToValueAtTime(endPitch, start + duration);

  const thudGain = audio.createGain();
  thudGain.gain.setValueAtTime(targetGain * 0.9, start);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, start + duration + 0.01);

  thud.connect(thudGain).connect(audio.destination);
  thud.start(start);
  thud.stop(start + duration + 0.02);

  // 宣纸/印泥吸附接触声
  const snap = audio.createBufferSource();
  snap.buffer = noiseBuffer(audio, 0.035, 25);
  const snapFilter = audio.createBiquadFilter();
  snapFilter.type = 'bandpass';
  snapFilter.frequency.setValueAtTime(level === '上上签' ? 1600 : 1200, start);
  snapFilter.Q.setValueAtTime(1.5, start);

  const snapGain = audio.createGain();
  snapGain.gain.setValueAtTime(targetGain * 0.6, start);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);

  snap.connect(snapFilter).connect(snapGain).connect(audio.destination);
  snap.start(start);

  // 上上签额外附带一丝清灵玉石/金石回弹
  if (level === '上上签') {
    const jade = audio.createOscillator();
    jade.type = 'sine';
    jade.frequency.setValueAtTime(2200, start + 0.01);
    jade.frequency.exponentialRampToValueAtTime(1800, start + 0.045);
    const jadeGain = audio.createGain();
    jadeGain.gain.setValueAtTime(0.0001, start);
    jadeGain.gain.setValueAtTime(gain * 0.25, start + 0.012);
    jadeGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    jade.connect(jadeGain).connect(audio.destination);
    jade.start(start + 0.01);
    jade.stop(start + 0.055);
  }
}

/**
 * 滚印签纸机：沉重木滚筒碾过案几的低频隆隆 + 宣纸被压出来的连续沙沙。
 * 返回一个停止函数，用法和 motor / bambooRattle 一样。
 */
export function paperRollRumble(ms: number): () => void {
  const audio = ctx();
  if (!audio) return () => undefined;
  const start = audio.currentTime;
  const seconds = ms / 1000;

  // 1. 实木滚筒碾过案几的低频体震
  const body = audio.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(52, start);
  body.frequency.linearRampToValueAtTime(63, start + seconds * 0.35);
  body.frequency.linearRampToValueAtTime(46, start + seconds);
  const bodyGain = audio.createGain();
  bodyGain.gain.setValueAtTime(0.0001, start);
  bodyGain.gain.exponentialRampToValueAtTime(0.07, start + 0.12);
  bodyGain.gain.setValueAtTime(0.07, Math.max(start + 0.12, start + seconds - 0.18));
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  // 2. 木轴与铜箍的摩擦嗡鸣
  const axle = audio.createOscillator();
  axle.type = 'sawtooth';
  axle.frequency.setValueAtTime(122, start);
  axle.frequency.linearRampToValueAtTime(138, start + seconds);
  const axleFilter = audio.createBiquadFilter();
  axleFilter.type = 'lowpass';
  axleFilter.frequency.setValueAtTime(320, start);
  axleFilter.Q.setValueAtTime(1.1, start);
  const axleGain = audio.createGain();
  axleGain.gain.setValueAtTime(0.0001, start);
  axleGain.gain.exponentialRampToValueAtTime(0.026, start + 0.16);
  axleGain.gain.setValueAtTime(0.026, Math.max(start + 0.16, start + seconds - 0.14));
  axleGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  // 3. 宣纸被碾出来的连续沙沙
  const paper = audio.createBufferSource();
  paper.buffer = noiseBuffer(audio, seconds, 0.2);
  const paperFilter = audio.createBiquadFilter();
  paperFilter.type = 'bandpass';
  paperFilter.frequency.setValueAtTime(1900, start);
  paperFilter.Q.setValueAtTime(0.75, start);
  const paperGain = audio.createGain();
  paperGain.gain.setValueAtTime(0.0001, start);
  paperGain.gain.exponentialRampToValueAtTime(0.03, start + 0.2);
  paperGain.gain.setValueAtTime(0.03, Math.max(start + 0.2, start + seconds - 0.12));
  paperGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  body.connect(bodyGain).connect(audio.destination);
  axle.connect(axleFilter).connect(axleGain).connect(audio.destination);
  paper.connect(paperFilter).connect(paperGain).connect(audio.destination);

  body.start(start);
  body.stop(start + seconds + 0.05);
  axle.start(start);
  axle.stop(start + seconds + 0.05);
  paper.start(start);

  return () => {
    try {
      body.stop();
      axle.stop();
      paper.stop();
    } catch {
      /* 已经停止 */
    }
  };
}

/** 长卷铺开：宣纸从滚筒底下舒展出去、落定在案几上的一声轻响。 */
export function paperUnfurl(): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer(audio, 0.5, 0.9);
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, start);
  filter.frequency.exponentialRampToValueAtTime(2600, start + 0.34);
  filter.Q.setValueAtTime(1.3, start);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.045, start + 0.07);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.46);
  noise.connect(filter).connect(gain).connect(audio.destination);
  noise.start(start);
}

/** 雕版落印：实木压上宣纸的一记闷实顿挫。 */
export function woodblockPress(gain = 0.24): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  const thud = audio.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(128, start);
  thud.frequency.exponentialRampToValueAtTime(41, start + 0.075);
  const thudGain = audio.createGain();
  thudGain.gain.setValueAtTime(gain, start);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
  thud.connect(thudGain).connect(audio.destination);
  thud.start(start);
  thud.stop(start + 0.1);

  const grain = audio.createBufferSource();
  grain.buffer = noiseBuffer(audio, 0.05, 22);
  const grainFilter = audio.createBiquadFilter();
  grainFilter.type = 'bandpass';
  grainFilter.frequency.setValueAtTime(1050, start);
  grainFilter.Q.setValueAtTime(1.6, start);
  const grainGain = audio.createGain();
  grainGain.gain.setValueAtTime(gain * 0.55, start);
  grainGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
  grain.connect(grainFilter).connect(grainGain).connect(audio.destination);
  grain.start(start);
}

/** 纸张轻柔抚平声：签纸翻面时用 */
export function paperSettleSound(gain = 0.18): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;
  const duration = 0.25;

  const rustle = audio.createBufferSource();
  rustle.buffer = noiseBuffer(audio, duration, 4.5);

  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, start);
  filter.frequency.exponentialRampToValueAtTime(400, start + duration);

  const vol = audio.createGain();
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(gain * 0.8, start + 0.02);
  vol.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  rustle.connect(filter).connect(vol).connect(audio.destination);
  rustle.start(start);
}
