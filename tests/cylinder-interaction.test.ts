import { describe, expect, it } from 'vitest';
import * as I from '../src/shared/cylinder/interaction';

const PHASES: I.Phase[] = ['ask', 'printing', 'ejecting'];
const TIMER_DRIVEN: I.Vessel[] = ['cylinder', 'printer', 'roll'];

describe('出籤阶段的输入闸门', () => {
  it('籤筒 v2 的籤是使用者摇出来的 —— 任何一个 phase 都不许把手势关掉', () => {
    for (const phase of PHASES) {
      expect(I.acceptsGesture('cylinder3d', phase)).toBe(true);
    }
  });

  it('计时器驱动的器具离开 ask 就不再收手势 —— 别把籤筒的修法漏到它们身上', () => {
    for (const vessel of TIMER_DRIVEN) {
      expect(I.acceptsGesture(vessel, 'ask')).toBe(true);
      expect(I.acceptsGesture(vessel, 'printing')).toBe(false);
      expect(I.acceptsGesture(vessel, 'ejecting')).toBe(false);
    }
  });

  it('只有籤筒 v2 是手势驱动的', () => {
    expect(I.isGestureDriven('cylinder3d')).toBe(true);
    for (const vessel of TIMER_DRIVEN) expect(I.isGestureDriven(vessel)).toBe(false);
  });
});

describe('開始抽籤那一刻放什麼聲音', () => {
  it('3D 籤筒不能放印表機的聲音 —— 以前 cylinder3d 掉進預設分支，放的是按鍵聲加馬達', async () => {
    const { drawStartSound } = await import('../src/shared/cylinder/interaction');
    expect(drawStartSound('cylinder3d')).toBe('none');
    expect(drawStartSound('printer')).toBe('printer');
    expect(drawStartSound('cylinder')).toBe('rattle');
    expect(drawStartSound('roll')).toBe('rumble');
  });

  it('3D 籤筒的鈴聲在號碼出現那一刻響（組件自己放），交棒給籤紙時只剩蓋章聲', async () => {
    const { chimeAtSlip } = await import('../src/shared/cylinder/interaction');
    expect(chimeAtSlip('cylinder3d')).toBe(false);
    for (const v of ['printer', 'cylinder', 'roll'] as const) expect(chimeAtSlip(v)).toBe(true);
  });
});
