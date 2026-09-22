/**
 * 打印机与交互的拟真音效，使用 WebAudio 纯算法合成，不下载任何音频文件。
 *
 * AudioContext 只在用户第一次交互时创建 —— 遵守现代浏览器的手势唤醒策略。
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
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
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

/** 打字音效：清脆微型机械键帽敲击声，带自然随机音高微动 */
export function typeTick(gain = 0.055): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  // 1. 极短暂的高频键帽微碰撞 (Click transient)
  const click = audio.createBufferSource();
  click.buffer = noiseBuffer(audio, 0.018, 40);
  const clickFilter = audio.createBiquadFilter();
  clickFilter.type = 'bandpass';
  clickFilter.frequency.setValueAtTime(3100 + (Math.random() * 600 - 300), start);
  clickFilter.Q.setValueAtTime(3.5, start);

  const clickGain = audio.createGain();
  clickGain.gain.setValueAtTime(gain * 0.9, start);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.016);

  click.connect(clickFilter).connect(clickGain).connect(audio.destination);
  click.start(start);

  // 2. 键轴底板微共鸣 (Subtle body resonance)
  const osc = audio.createOscillator();
  osc.type = 'triangle';
  const pitch = 750 + Math.random() * 180;
  osc.frequency.setValueAtTime(pitch, start);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.6, start + 0.024);

  const oscGain = audio.createGain();
  oscGain.gain.setValueAtTime(gain * 0.65, start);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.025);

  osc.connect(oscGain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + 0.03);
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

/** 打印完成/定签：按等级演绎不同的东方铜磬、颂钵与古寺晨钟 */
export function chime(level?: StickLevel): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  if (level === '上上签') {
    // 上上签【双磬合鸣·天籁吉庆】：D5 (587Hz) + A5 (880Hz) 和弦铃韵，长泛音 2.6s
    const playChime = (freq: number, vol: number, dur: number) => {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const oscOvertone = audio.createOscillator();
      oscOvertone.type = 'sine';
      oscOvertone.frequency.setValueAtTime(freq * 2.5, start);

      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      const otGain = audio.createGain();
      otGain.gain.setValueAtTime(0.0001, start);
      otGain.gain.exponentialRampToValueAtTime(vol * 0.35, start + 0.01);
      otGain.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.6);

      osc.connect(gain).connect(audio.destination);
      oscOvertone.connect(otGain).connect(audio.destination);

      osc.start(start);
      oscOvertone.start(start);
      osc.stop(start + dur + 0.1);
      oscOvertone.stop(start + dur * 0.6 + 0.1);
    };

    playChime(587.33, 0.13, 2.5); // 主音 D5
    playChime(880.0, 0.09, 2.2);  // 纯五度 A5
    playChime(1174.66, 0.04, 1.4); // 高八度 D6
    return;
  }

  if (level === '上签') {
    // 上签【青铜清磬·旭日澄明】：D5 (587Hz) 清脆纯和，高阶谐波清亮
    const osc1 = audio.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, start);

    const osc2 = audio.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1468.3, start); // ~2.5x

    const osc3 = audio.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(2643.0, start); // ~4.5x

    const vol1 = audio.createGain();
    vol1.gain.setValueAtTime(0.0001, start);
    vol1.gain.exponentialRampToValueAtTime(0.15, start + 0.015);
    vol1.gain.exponentialRampToValueAtTime(0.0001, start + 2.0);

    const vol2 = audio.createGain();
    vol2.gain.setValueAtTime(0.0001, start);
    vol2.gain.exponentialRampToValueAtTime(0.05, start + 0.012);
    vol2.gain.exponentialRampToValueAtTime(0.0001, start + 1.2);

    const vol3 = audio.createGain();
    vol3.gain.setValueAtTime(0.0001, start);
    vol3.gain.exponentialRampToValueAtTime(0.025, start + 0.01);
    vol3.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);

    osc1.connect(vol1).connect(audio.destination);
    osc2.connect(vol2).connect(audio.destination);
    osc3.connect(vol3).connect(audio.destination);

    osc1.start(start);
    osc2.start(start);
    osc3.start(start);
    osc1.stop(start + 2.1);
    osc2.stop(start + 1.3);
    osc3.stop(start + 0.8);
    return;
  }

  if (level === '中签') {
    // 中签【温润古磬·静水流深】：A4 (440Hz)，圆润平缓，余韵宁静
    const osc1 = audio.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440.0, start);

    const osc2 = audio.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100.0, start); // 2.5x

    const osc3 = audio.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1760.0, start); // 4x

    const vol1 = audio.createGain();
    vol1.gain.setValueAtTime(0.0001, start);
    vol1.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
    vol1.gain.exponentialRampToValueAtTime(0.0001, start + 1.8);

    const vol2 = audio.createGain();
    vol2.gain.setValueAtTime(0.0001, start);
    vol2.gain.exponentialRampToValueAtTime(0.035, start + 0.015);
    vol2.gain.exponentialRampToValueAtTime(0.0001, start + 1.0);

    const vol3 = audio.createGain();
    vol3.gain.setValueAtTime(0.0001, start);
    vol3.gain.exponentialRampToValueAtTime(0.015, start + 0.01);
    vol3.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);

    osc1.connect(vol1).connect(audio.destination);
    osc2.connect(vol2).connect(audio.destination);
    osc3.connect(vol3).connect(audio.destination);

    osc1.start(start);
    osc2.start(start);
    osc3.start(start);
    osc1.stop(start + 1.9);
    osc2.stop(start + 1.1);
    osc3.stop(start + 0.7);
    return;
  }

  if (level === '下签') {
    // 下签【禅寺古钟·暮鼓晨钟】：146.8Hz (D3) 低沉大钟嗡鸣，安神定心、警醒化厄
    const bellBase = audio.createOscillator();
    bellBase.type = 'sine';
    bellBase.frequency.setValueAtTime(146.83, start);

    const bellSecond = audio.createOscillator();
    bellSecond.type = 'sine';
    bellSecond.frequency.setValueAtTime(293.66, start);

    const bellThird = audio.createOscillator();
    bellThird.type = 'sine';
    bellThird.frequency.setValueAtTime(440.0, start);

    // 钟体轻微颤音（Beat frequency 0.8Hz）
    const tremolo = audio.createOscillator();
    tremolo.type = 'sine';
    tremolo.frequency.setValueAtTime(0.8, start);
    const tremoloGain = audio.createGain();
    tremoloGain.gain.setValueAtTime(6.0, start);
    tremolo.connect(tremoloGain);
    tremoloGain.connect(bellBase.frequency);

    const vol1 = audio.createGain();
    vol1.gain.setValueAtTime(0.0001, start);
    vol1.gain.exponentialRampToValueAtTime(0.18, start + 0.035);
    vol1.gain.exponentialRampToValueAtTime(0.0001, start + 2.6);

    const vol2 = audio.createGain();
    vol2.gain.setValueAtTime(0.0001, start);
    vol2.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
    vol2.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);

    const vol3 = audio.createGain();
    vol3.gain.setValueAtTime(0.0001, start);
    vol3.gain.exponentialRampToValueAtTime(0.025, start + 0.015);
    vol3.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);

    bellBase.connect(vol1).connect(audio.destination);
    bellSecond.connect(vol2).connect(audio.destination);
    bellThird.connect(vol3).connect(audio.destination);

    bellBase.start(start);
    bellSecond.start(start);
    bellThird.start(start);
    tremolo.start(start);

    bellBase.stop(start + 2.7);
    bellSecond.stop(start + 1.7);
    bellThird.stop(start + 1.2);
    tremolo.stop(start + 2.7);
    return;
  }

  // 默认单音铜磬
  const osc1 = audio.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, start);
  const vol1 = audio.createGain();
  vol1.gain.setValueAtTime(0.0001, start);
  vol1.gain.exponentialRampToValueAtTime(0.15, start + 0.015);
  vol1.gain.exponentialRampToValueAtTime(0.0001, start + 2.0);
  osc1.connect(vol1).connect(audio.destination);
  osc1.start(start);
  osc1.stop(start + 2.1);
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
 * 撕纸音效：模拟沿齿孔撕下热敏纸/宣纸的脆裂摩擦质感
 * 包含：
 * 1. 纤维撕裂带通噪声扫频 (High-to-mid frequency paper rip friction)
 * 2. 齿孔连续断裂微爆破 (Granular snap impulses as perforation breaks)
 * 3. 纸张脱离空气摩擦轻微尾韵
 */
export function tearPaperSound(gain = 0.28): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;
  const duration = 0.42;

  // 1. 纸张撕扯主要摩擦声 (Swept bandpass noise)
  const tearBuffer = noiseBuffer(audio, duration, 1.2);
  const tearSource = audio.createBufferSource();
  tearSource.buffer = tearBuffer;

  const tearFilter = audio.createBiquadFilter();
  tearFilter.type = 'bandpass';
  tearFilter.frequency.setValueAtTime(3600, start);
  tearFilter.frequency.exponentialRampToValueAtTime(1400, start + duration);
  tearFilter.Q.setValueAtTime(2.2, start);

  const tearGain = audio.createGain();
  tearGain.gain.setValueAtTime(0.0001, start);
  tearGain.gain.exponentialRampToValueAtTime(gain * 0.95, start + 0.04);
  tearGain.gain.setValueAtTime(gain * 0.95, start + duration * 0.65);
  tearGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  tearSource.connect(tearFilter).connect(tearGain).connect(audio.destination);
  tearSource.start(start);

  // 2. 齿孔崩断微颗粒脉冲 (Perforation teeth snapping sequence)
  const snapCount = 14;
  for (let i = 0; i < snapCount; i++) {
    const snapTime = start + (i / snapCount) * (duration * 0.85) + (Math.random() * 0.015 - 0.007);
    if (snapTime < start) continue;

    const snapNoise = audio.createBufferSource();
    snapNoise.buffer = noiseBuffer(audio, 0.015, 35);

    const snapFilter = audio.createBiquadFilter();
    snapFilter.type = 'bandpass';
    snapFilter.frequency.setValueAtTime(2800 + Math.random() * 1600, snapTime);
    snapFilter.Q.setValueAtTime(4.0, snapTime);

    const snapGain = audio.createGain();
    const snapVol = gain * (0.35 + Math.random() * 0.35);
    snapGain.gain.setValueAtTime(snapVol, snapTime);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, snapTime + 0.014);

    snapNoise.connect(snapFilter).connect(snapGain).connect(audio.destination);
    snapNoise.start(snapTime);
  }

  // 3. 撕开瞬间的纸张微颤音 (Low resonance rustle)
  const rustle = audio.createOscillator();
  rustle.type = 'triangle';
  rustle.frequency.setValueAtTime(180, start + 0.05);
  rustle.frequency.exponentialRampToValueAtTime(75, start + duration * 0.7);

  const rustleGain = audio.createGain();
  rustleGain.gain.setValueAtTime(0.0001, start);
  rustleGain.gain.exponentialRampToValueAtTime(gain * 0.22, start + 0.08);
  rustleGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.8);

  rustle.connect(rustleGain).connect(audio.destination);
  rustle.start(start + 0.05);
  rustle.stop(start + duration);
}

/** 贴回/纸张复位轻柔抚平声 */
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
