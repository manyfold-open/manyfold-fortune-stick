import { describe, expect, it } from 'vitest';
import {
  buildFollowUpPrompt,
  buildInterpretPrompt,
  drawStickNo,
  fallbackInterpretation,
  interpretMessageId,
  normalizeQuestion,
  parseInterpretation,
  unparseableError,
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
    const parsed = parseInterpretation(JSON.stringify(good), stick, 'zh');
    expect(parsed).toMatchObject({ ...good, source: 'ai' });
  });

  it('解析后不会把 dash 带进解读内容', () => {
    const parsed = parseInterpretation(
      JSON.stringify({ ...good, answer: '先做这一步——再观察结果。' }),
      stick,
      'zh',
    );
    expect(parsed?.answer).toBe('先做这一步 再观察结果。');
    expect(parsed?.answer).not.toMatch(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/);
  });

  it('剥掉 markdown 代码块和前后客套话', () => {
    const raw = `好的，这是解读：\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\n希望有帮助。`;
    expect(parseInterpretation(raw, stick, 'zh')?.answer).toBe(good.answer);
  });

  it('answer 为空时返回 null —— 宁可落回通用解释', () => {
    expect(parseInterpretation(JSON.stringify({ ...good, answer: '   ' }), stick, 'zh')).toBeNull();
    expect(parseInterpretation('{ 坏掉的 json', stick, 'zh')).toBeNull();
  });

  it('缺失的次要字段落回这支签预先写好的内容', () => {
    const parsed = parseInterpretation(JSON.stringify({ answer: good.answer }), stick, 'zh');
    expect(parsed?.meaning).toBe(stickText(stick, 'zh').meaning);
    expect(parsed?.action).toBe(stickText(stick, 'zh').action);
    expect(parsed?.notice).toBe('');
  });

  it('过长的字段被截断，不会撑坏页面', () => {
    const parsed = parseInterpretation(
      JSON.stringify({ ...good, answer: '长'.repeat(5000) }),
      stick,
      'zh',
    );
    expect(parsed!.answer.length).toBe(600);
  });

  it('agent 回普通文字时也保留解读，不退回通用解释', () => {
    const parsed = parseInterpretation('前面的准备已经够了，今天可以先迈出第一步。', stick, 'zh');
    expect(parsed).toMatchObject({
      answer: '前面的准备已经够了，今天可以先迈出第一步。',
      source: 'ai',
    });
    expect(parsed?.meaning).toBe(stickText(stick, 'zh').meaning);
  });

  it('接受常见的 response/content JSON 包装', () => {
    const parsed = parseInterpretation(
      JSON.stringify({ response: '先把最小的一步做出来。' }),
      stick,
      'zh',
    );
    expect(parsed?.answer).toBe('先把最小的一步做出来。');
  });

  it('串流重复多个 JSON 物件时仍取出有效解读', () => {
    const raw = `${JSON.stringify(good)}${JSON.stringify(good)}`;
    expect(parseInterpretation(raw, stick, 'zh')).toMatchObject({
      answer: good.answer,
      source: 'ai',
    });
  });
});

describe('fallbackInterpretation', () => {
  it('用这支签预先写好的通用解释和行动方向，并标明来源', () => {
    const fallback = fallbackInterpretation(stick, 'zh');
    expect(fallback.answer).toBe(stickText(stick, 'zh').general);
    expect(fallback.action).toBe(stickText(stick, 'zh').action);
    expect(fallback.source).toBe('fallback');
  });
});

describe('提示词', () => {
  it('解签提示词把签号、等级、签诗当成既定事实交给 agent', () => {
    const prompt = buildInterpretPrompt('我该不该换工作？', stick, 'zh');
    expect(prompt).toContain('我该不该换工作？');
    expect(prompt).toContain(`第 ${stick.no} 签`);
    expect(prompt).toContain(stick.level);
    expect(prompt).toContain(stickText(stick, 'zh').poem[0]);
    expect(prompt).toContain('由系统抽定，不可更改');
    expect(prompt).toContain('不预言必然发生的事');
  });

  it('下签的提示词明确要求不恐吓', () => {
    const low = STICKS.find((one) => one.level === '下签')!;
    expect(buildInterpretPrompt('问题', low, 'zh')).toContain('不要使用吓人的说法');
  });

  it('追问提示词始终带上原问题、这支签和已给出的解读，并禁止改签', () => {
    const interpretation: Interpretation = {
      meaning: '签意',
      answer: '回应',
      notice: '留意',
      action: '建议',
      source: 'ai',
      language: 'zh',
    };
    const reading: Reading = {
      id: 'r1',
      question: '我该不该换工作？',
      stick,
      status: 'interpreted',
      interpretation,
      error: null,
      language: 'zh',
      createdAt: new Date().toISOString(),
    };
    const prompt = buildFollowUpPrompt(reading, interpretation, '先从哪一步开始？', 'zh');
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
        expect(text.luckyItem.length).toBeGreaterThan(0);
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
      const joined = `${text.title}${text.poem[0]}${text.poem[1]}${text.meaning}${text.general}${text.action}${text.luckyItem}`;
      expect(han.test(joined), `第 ${entry.no} 签的英文里还有汉字`).toBe(false);
    }
  });

  it('英文那一套自己就能被认成英文', () => {
    for (const entry of STICKS) {
      expect(detectLanguage(stickText(entry, 'en').general)).toBe('en');
    }
  });

  it('英文文案不带明显的逐字翻译腔', () => {
    const forbidden = [
      'the walking is yours',
      'fixedly means',
      'fix your direction',
      'the thing is moving underneath',
      'what it lacks is contact with the outside',
      'the answer is more direct than you think',
    ];
    for (const entry of STICKS) {
      const text = stickText(entry, 'en');
      const joined = `${text.title} ${text.poem.join(' ')} ${text.meaning} ${text.general} ${text.action}`.toLowerCase();
      for (const phrase of forbidden) {
        expect(joined, `第 ${entry.no} 签仍含有直译腔：${phrase}`).not.toContain(phrase);
      }
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

  it('英文珍藏卡使用英文等级名，而不是内部中文等级键', () => {
    for (const entry of STICKS) {
      expect(LEVEL_LABEL.en[entry.level]).not.toBe(entry.level);
    }
  });
});

describe('按问题的语言解签', () => {
  it('英文问题得到英文提示词，而且不含中文指令', () => {
    const prompt = buildInterpretPrompt('Should I take this job offer?', stick, 'en');
    expect(prompt).toContain('Should I take this job offer?');
    expect(prompt).toContain(stickText(stick, 'en').poem[0]);
    expect(prompt).toContain('Reply in English');
    expect(prompt).not.toContain('全部用中文');
  });

  it('英文提示词照样把签当成既定事实，也照样禁止预言', () => {
    const prompt = buildInterpretPrompt('Should I move?', stick, 'en');
    expect(prompt).toContain('fixed by the machine');
    expect(prompt).toContain('Do not predict');
  });

  it('英文提示词里带的是英文等级名，不是中文等级', () => {
    const prompt = buildInterpretPrompt('Should I move?', stick, 'en');
    expect(prompt).toContain(LEVEL_LABEL.en[stick.level]);
    expect(prompt).not.toContain(`第 ${stick.no} 签`);
  });

  it('中文问题的提示词一个字没变', () => {
    const prompt = buildInterpretPrompt('我该不该换工作？', stick, 'zh');
    expect(prompt).toContain('由系统抽定，不可更改');
    expect(prompt).toContain('全部用中文');
  });

  it('英文下签同样要求不恐吓', () => {
    const low = STICKS.find((one) => one.level === '下签')!;
    expect(buildInterpretPrompt('Anything?', low, 'en')).toContain('never frightening');
  });

  it('兜底文案跟着语言走，并记下自己是哪种语言写的', () => {
    const fallback = fallbackInterpretation(stick, 'en');
    expect(fallback.answer).toBe(stickText(stick, 'en').general);
    expect(fallback.action).toBe(stickText(stick, 'en').action);
    expect(fallback.source).toBe('fallback');
    expect(fallback.language).toBe('en');
    // 兜底整段都得是英文，包括那句「还没结合你的问题」。
    expect(detectLanguage(fallback.answer)).toBe('en');
    expect(detectLanguage(fallback.notice)).toBe('en');
    expect(detectLanguage(fallbackInterpretation(stick, 'zh').notice)).toBe('zh');
  });

  it('解析出来的解读记下语言，缺字段时落回同语言的预写内容', () => {
    const parsed = parseInterpretation(JSON.stringify({ answer: 'Take the week.' }), stick, 'en');
    expect(parsed?.language).toBe('en');
    expect(parsed?.meaning).toBe(stickText(stick, 'en').meaning);
    expect(parsed?.action).toBe(stickText(stick, 'en').action);
  });

  it('追问提示词用同一种语言，并且仍然禁止改签', () => {
    const interpretation: Interpretation = {
      meaning: 'Things are clearing up.',
      answer: 'Given your question, list the conditions first.',
      notice: 'You may be ignoring the cost of waiting.',
      action: 'Write down three criteria today.',
      source: 'ai',
      language: 'en',
    };
    const reading: Reading = {
      id: 'r1',
      question: 'Should I take this job offer?',
      stick,
      status: 'interpreted',
      interpretation,
      error: null,
      language: 'en',
      createdAt: new Date().toISOString(),
    };
    const prompt = buildFollowUpPrompt(reading, interpretation, 'Where do I start?', 'en');
    expect(prompt).toContain('Should I take this job offer?');
    expect(prompt).toContain('does not draw a new stick');
    expect(prompt).toContain('Where do I start?');
    expect(prompt).not.toContain('不重新抽签');
  });
});

describe('unparseableError', () => {
  it('把 agent 原文的开头一起存下来 —— 只存「解析失败」的话，事后没人知道它到底回了什么', () => {
    expect(unparseableError('好的，我来帮你看看这支签')).toBe(
      'unparseable: 好的，我来帮你看看这支签',
    );
  });

  it('原文是空的就只存码', () => {
    expect(unparseableError('   ')).toBe('unparseable');
  });

  it('原文很长就截断 —— 这一条会进 D1，也会回到浏览器', () => {
    expect(unparseableError('x'.repeat(2000)).length).toBeLessThanOrEqual(240);
  });

  it('原文照样过脱敏', () => {
    expect(unparseableError('Bearer nca_secret_token')).not.toContain('nca_secret_token');
  });
});

describe('interpretMessageId', () => {
  const FIRST = '2026-09-22T06:27:35.118Z';
  const AFTER_FIRST = '2026-09-22T06:36:52.693Z';

  it('同一次尝试里是稳定的 —— 连点两下不该被算成两轮', () => {
    expect(interpretMessageId('r1', FIRST)).toBe(interpretMessageId('r1', FIRST));
  });

  it('上一次尝试写完之后重试，是一则新的消息 —— 同一个 id 会被 agent 当成同一则，直接关掉串流', () => {
    expect(interpretMessageId('r1', FIRST)).not.toBe(interpretMessageId('r1', AFTER_FIRST));
  });

  it('不同的签不会撞在一起', () => {
    expect(interpretMessageId('r1', FIRST)).not.toBe(interpretMessageId('r2', FIRST));
  });

  it('没有 updated_at 也给得出一个带签号的稳定值', () => {
    expect(interpretMessageId('r1', null)).toBe(interpretMessageId('r1', null));
    expect(interpretMessageId('r1', null)).toContain('r1');
  });
});

// 线上 6747829e 那一条：agent 把中文引号写成没转义的半角引号，一整份写得好好的解读
// 就被当成坏 JSON 丢掉，用户看到的是通用解释。
describe('parseInterpretation：坏 JSON 的保底（按键切片）', () => {
  it('值里有没转义的半角引号，仍旧救得回来', () => {
    const reply =
      '{"meaning":"这件事可以开始","answer":"通常就那么一两个环节最要紧。",' +
      '"notice":"容易把"谨慎"当成拖延","action":"指出最不可逆的一步"}';
    expect(parseInterpretation(reply, stick, 'zh')).toMatchObject({
      meaning: '这件事可以开始',
      answer: '通常就那么一两个环节最要紧。',
      notice: '容易把"谨慎"当成拖延',
      action: '指出最不可逆的一步',
      source: 'ai',
    });
  });

  it('救回来的值里，转义过的引号还原成引号', () => {
    const reply = '{"answer":"他说\\"好\\"就够了","notice":"容易把"谨慎"当成拖延"}';
    expect(parseInterpretation(reply, stick, 'zh')?.answer).toBe('他说"好"就够了');
  });

  it('最后一段被截断，前面已经写完的字段照样救回来', () => {
    const reply = '{"meaning":"到了关键的一小段","answer":"分清楚哪一步最要紧。","notice":"容易把';
    expect(parseInterpretation(reply, stick, 'zh')?.answer).toBe('分清楚哪一步最要紧。');
  });

  it('只有括号、没有认得的字段，还是落回通用解释 —— 保底不是什么都吞', () => {
    expect(parseInterpretation('{ 我觉得这支签还行 }', stick, 'zh')).toBeNull();
  });
});

describe('提示词：少制造坏 JSON', () => {
  it('明确要求字符串里不要用半角引号 —— 那是线上唯一见过的坏 JSON 成因', () => {
    expect(buildInterpretPrompt('我该不该换工作', stick, 'zh')).toContain('「」');
    expect(buildInterpretPrompt('should I switch jobs', stick, 'en')).toMatch(/double quote/i);
  });
});
