import { describe, expect, it } from 'vitest';
import {
  buildFollowUpPrompt,
  buildInterpretPrompt,
  drawStickNo,
  fallbackInterpretation,
  normalizeQuestion,
  parseInterpretation,
} from '../src/worker/fortune';
import { LEVEL_LABEL, STICKS, stickByNo, stickText } from '../src/shared/sticks';
import { detectLanguage } from '../src/shared/lang';
import type { Interpretation, Reading } from '../src/shared/types';

const stick = stickByNo(7)!;

describe('签库', () => {
  it('有 36 支，签号连续且唯一', () => {
    expect(STICKS).toHaveLength(36);
    expect(STICKS.map((entry) => entry.no)).toEqual(
      Array.from({ length: 36 }, (_, index) => index + 1),
    );
  });

  it('每支签的六个字段都不为空，签诗是两句', () => {
    for (const entry of STICKS) {
      const text = stickText(entry, 'zh');
      expect(text.title.length).toBeGreaterThan(0);
      expect(text.poem).toHaveLength(2);
      expect(text.poem[0].length).toBeGreaterThan(0);
      expect(text.poem[1].length).toBeGreaterThan(0);
      expect(text.meaning.length).toBeGreaterThan(0);
      // general / action 同时是 AI 不可用时的兜底，必须能独立成话。
      expect(text.general.length).toBeGreaterThan(20);
      expect(text.action.length).toBeGreaterThan(0);
    }
  });

  it('只使用四个等级', () => {
    const levels = new Set(STICKS.map((entry) => entry.level));
    expect([...levels].sort()).toEqual(['上上签', '上签', '下签', '中签'].sort());
  });

  it('下签的文案不使用恐吓性说法', () => {
    const scary = ['大凶', '灾', '必败', '绝望', '完蛋', '死'];
    for (const entry of STICKS.filter((one) => one.level === '下签')) {
      const zh = stickText(entry, 'zh');
      const text = `${zh.meaning}${zh.general}${zh.action}`;
      for (const word of scary) expect(text).not.toContain(word);
    }
  });
});

describe('drawStickNo', () => {
  it('永远落在 1–36', () => {
    for (let i = 0; i < 500; i += 1) {
      const no = drawStickNo();
      expect(no).toBeGreaterThanOrEqual(1);
      expect(no).toBeLessThanOrEqual(36);
    }
  });

  it('拒绝采样：>= 252 的字节被丢弃，不会让前几支签概率偏高', () => {
    const bytes = [255, 254, 3];
    const next = () => bytes.shift()!;
    expect(drawStickNo(next)).toBe(4);
    expect(bytes).toHaveLength(0);
  });

  it('把 0..251 均匀映射到 36 支签上', () => {
    const tally = new Map<number, number>();
    for (let byte = 0; byte < 252; byte += 1) {
      const no = drawStickNo(() => byte);
      tally.set(no, (tally.get(no) ?? 0) + 1);
    }
    expect(tally.size).toBe(36);
    expect([...tally.values()].every((count) => count === 7)).toBe(true);
  });
});

describe('normalizeQuestion', () => {
  it('空问题被拒绝', () => {
    expect(() => normalizeQuestion('   ')).toThrow(/先写下你想问的事/);
    expect(() => normalizeQuestion(undefined)).toThrow(/先写下你想问的事/);
  });

  it('太短、太长都被拒绝', () => {
    expect(() => normalizeQuestion('要换吗')).toThrow(/至少/);
    expect(() => normalizeQuestion('我'.repeat(121))).toThrow(/以内/);
  });

  it('按字符计数，120 个汉字仍然通过', () => {
    expect(normalizeQuestion('我'.repeat(120))).toHaveLength(120);
  });

  it('折叠空白', () => {
    expect(normalizeQuestion('  我该  如何\n面对变化？ ')).toBe('我该 如何 面对变化？');
  });
});

describe('parseInterpretation', () => {
  const good = {
    meaning: '事情正在变清楚。',
    answer: '结合你的问题，可以先把选择的条件列出来，再决定要不要动。',
    notice: '你可能忽略了时间成本。',
    action: '今天写下三个判断标准。',
  };

  it('解析裸 JSON', () => {
    const parsed = parseInterpretation(JSON.stringify(good), stick);
    expect(parsed).toMatchObject({ ...good, source: 'ai' });
  });

  it('剥掉 markdown 代码块和前后客套话', () => {
    const raw = `好的，这是解读：\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\n希望有帮助。`;
    expect(parseInterpretation(raw, stick)?.answer).toBe(good.answer);
  });

  it('answer 为空时返回 null —— 宁可落回通用解释', () => {
    expect(parseInterpretation(JSON.stringify({ ...good, answer: '   ' }), stick)).toBeNull();
    expect(parseInterpretation('完全不是 JSON', stick)).toBeNull();
    expect(parseInterpretation('{ 坏掉的 json', stick)).toBeNull();
  });

  it('缺失的次要字段落回这支签预先写好的内容', () => {
    const parsed = parseInterpretation(JSON.stringify({ answer: good.answer }), stick);
    expect(parsed?.meaning).toBe(stickText(stick, 'zh').meaning);
    expect(parsed?.action).toBe(stickText(stick, 'zh').action);
    expect(parsed?.notice).toBe('');
  });

  it('过长的字段被截断，不会撑坏页面', () => {
    const parsed = parseInterpretation(
      JSON.stringify({ ...good, answer: '长'.repeat(5000) }),
      stick,
    );
    expect(parsed!.answer.length).toBe(600);
  });
});

describe('fallbackInterpretation', () => {
  it('用这支签预先写好的通用解释和行动方向，并标明来源', () => {
    const fallback = fallbackInterpretation(stick);
    expect(fallback.answer).toBe(stickText(stick, 'zh').general);
    expect(fallback.action).toBe(stickText(stick, 'zh').action);
    expect(fallback.source).toBe('fallback');
  });
});

describe('提示词', () => {
  it('解签提示词把签号、等级、签诗当成既定事实交给 agent', () => {
    const prompt = buildInterpretPrompt('我该不该换工作？', stick);
    expect(prompt).toContain('我该不该换工作？');
    expect(prompt).toContain(`第 ${stick.no} 签`);
    expect(prompt).toContain(stick.level);
    expect(prompt).toContain(stickText(stick, 'zh').poem[0]);
    expect(prompt).toContain('由系统抽定，不可更改');
    expect(prompt).toContain('不预言必然发生的事');
  });

  it('下签的提示词明确要求不恐吓', () => {
    const low = STICKS.find((one) => one.level === '下签')!;
    expect(buildInterpretPrompt('问题', low)).toContain('不要使用吓人的说法');
  });

  it('追问提示词始终带上原问题、这支签和已给出的解读，并禁止改签', () => {
    const interpretation: Interpretation = {
      meaning: '签意',
      answer: '回应',
      notice: '留意',
      action: '建议',
      source: 'ai',
    };
    const reading: Reading = {
      id: 'r1',
      question: '我该不该换工作？',
      stick,
      status: 'interpreted',
      interpretation,
      error: null,
      createdAt: new Date().toISOString(),
    };
    const prompt = buildFollowUpPrompt(reading, interpretation, '先从哪一步开始？');
    expect(prompt).toContain('我该不该换工作？');
    expect(prompt).toContain(`第 ${stick.no} 签`);
    expect(prompt).toContain(stickText(stick, 'zh').poem[1]);
    expect(prompt).toContain('回应');
    expect(prompt).toContain('不重新抽签');
    expect(prompt).toContain('先从哪一步开始？');
  });
});

describe('英文签库', () => {
  it('每支签都有 zh 和 en 两套文字，字段齐全，签诗都是两句', () => {
    for (const entry of STICKS) {
      for (const language of ['zh', 'en'] as const) {
        const text = stickText(entry, language);
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.poem).toHaveLength(2);
        expect(text.poem[0].length).toBeGreaterThan(0);
        expect(text.poem[1].length).toBeGreaterThan(0);
        expect(text.meaning.length).toBeGreaterThan(0);
        expect(text.action.length).toBeGreaterThan(0);
      }
      // general / action 同时是 AI 不可用时的兜底，必须能独立成话。
      expect(stickText(entry, 'zh').general.length).toBeGreaterThan(20);
      expect(stickText(entry, 'en').general.length).toBeGreaterThan(60);
    }
  });

  it('英文那一套里没有汉字 —— 漏翻会被这条抓住', () => {
    const han = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    for (const entry of STICKS) {
      const text = stickText(entry, 'en');
      const joined = `${text.title}${text.poem[0]}${text.poem[1]}${text.meaning}${text.general}${text.action}`;
      expect(han.test(joined), `第 ${entry.no} 签的英文里还有汉字`).toBe(false);
    }
  });

  it('英文那一套自己就能被认成英文', () => {
    for (const entry of STICKS) {
      expect(detectLanguage(stickText(entry, 'en').general)).toBe('en');
    }
  });

  it('36 个英文签名互不重复', () => {
    const titles = STICKS.map((entry) => stickText(entry, 'en').title);
    expect(new Set(titles).size).toBe(36);
  });

  it('下签的英文文案同样不恐吓', () => {
    const scary = ['disaster', 'doomed', 'ruin', 'catastrophe', 'death', 'fail utterly'];
    for (const entry of STICKS.filter((one) => one.level === '下签')) {
      const text = stickText(entry, 'en');
      const joined = `${text.meaning} ${text.general} ${text.action}`.toLowerCase();
      for (const word of scary) expect(joined).not.toContain(word);
    }
  });

  it('四个等级都有英文名', () => {
    expect(LEVEL_LABEL.en['上上签']).toBe('GREAT FORTUNE');
    expect(LEVEL_LABEL.en['上签']).toBe('GOOD FORTUNE');
    expect(LEVEL_LABEL.en['中签']).toBe('MIDDLING');
    expect(LEVEL_LABEL.en['下签']).toBe('POOR FORTUNE');
    expect(LEVEL_LABEL.zh['上上签']).toBe('上上签');
  });
});
