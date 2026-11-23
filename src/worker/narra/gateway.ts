/**
 * Narra Messenger Gateway integration for AI Fortune Stick (`fortune-stick`).
 *
 * Keeps `NARRA_GATEWAY_ENABLED` and `NARRA_SYNC` strictly fail-closed (`"off"` by default),
 * provides crisis safety responses, local CSPRNG stick draws from `src/shared/sticks.ts`
 * in pure `zh-Hant` / `zh-Hans` / `en`, opt-in solar-term / weekly broadcasts, and
 * Manyfold A2A fallback.
 */

import {
  MemoryStore,
  detectExplicitLangSwitch,
  detectLang,
  isNarraGatewayEnabled,
  stripAgentMentions,
  type AgentSpec,
  type AgentUpdateItem,
  type InboundEvent,
  type LangCode,
  type RecallTurnResult,
  type RoomContext,
  type TriageDecision,
} from '@manyfold/narra-agent-kit';
import {
  getNarraGatewayStatus,
  kickNarraGateway,
  type NarraA2ACredentialResult,
  type NarraGatewayConfig,
  type NarraGatewayKickResult,
  type NarraGatewayStatus,
} from '@manyfold/narra-agent-kit/worker';
import { LEVEL_LABEL, STICK_COUNT, stickByNo, stickText, type FortuneStick } from '../../shared/sticks';
import { withoutDashes } from '../../shared/text';
import { credentialFor, listConnectedAgents } from '../connect';
import { ensureSchema } from '../db';
import { drawStickNo } from '../fortune';
import type { Env } from '../types';
import { toZhHant } from './zh-hant';

export const FORTUNE_STICK_AGENT_ID = 'fortune-stick';
export const FORTUNE_STICK_DEFAULT_AGENT_RECORD_ID = 'agt_agqvtekvjbzldl5u2jczbc5equ';
export const FORTUNE_STICK_DEFAULT_MATRIX_ID = '@agent-bc3282c7:matrix.netmind.chat';
export const FORTUNE_STICK_SITE_URL = 'https://app.manyfold.ai/fortune-stick/';

export const FORTUNE_STICK_AGENT_SPEC: AgentSpec = {
  id: FORTUNE_STICK_AGENT_ID,
  matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
  name: 'AI Fortune Stick',
  aliases: ['fortune-stick', 'wenyiqian', '問一籤', '问一签', '解籤師', '解签师'],
  domainDescription:
    'Traditional Chinese fortune stick draws (問一籤 / 問一簽 / 问一签 / 求籤 / 求签), poetic couplets, fortune levels, and grounded next-step reflections for decisions and crossroads in zh-Hant, zh-Hans, and en.',
  domainKeywords: [
    'fortune stick',
    'fortune sticks',
    'draw a stick',
    'shake a stick',
    'wenyiqian',
    '問一籤',
    '问一签',
    '求籤',
    '求签',
    '求一籤',
    '求一签',
    '求一支籤',
    '求一支签',
    '求個籤',
    '求个签',
    '這支籤',
    '这支签',
    '搖籤',
    '摇签',
    '搖一籤',
    '摇一签',
    '抽籤',
    '抽签',
    '抽一籤',
    '抽一签',
    '抽一支籤',
    '抽一支签',
    '抽一支',
    '再抽一支',
    '來一籤',
    '来一签',
    '解籤',
    '解签',
    '籤詩',
    '签诗',
    '靈籤',
    '灵签',
    '運勢',
    '运势',
    '今日運勢',
    '今日运势',
    /求一?[支根個个]?[籤签]/,
    /抽一?[支根個个]?[籤签]/,
    /搖一?[支根個个]?[籤签]/,
    /問一?[支根個个]?[籤签]/,
    /來一?[支根個个]?[籤签]/,
    /[這那]支[籤签]/,
    /看第?\s*\d{1,2}\s*[籤签]/,
    /\bstick\s*#?\d{1,2}\b/i,
  ],
  antiKeywords: [
    'tarot',
    'tarot reading',
    'tarot card',
    'arcana',
    'spread',
    '塔羅',
    '塔罗',
    '塔羅牌',
    '塔罗牌',
    '抽牌',
    '牌陣',
    '牌阵',
    '占卜',
    'restaurant',
    'restaurants',
    'ramen',
    'dim sum',
    'hotpot',
    'bubble tea',
    'boba',
    'chinatown',
    'soho',
    '餐廳',
    '餐厅',
    '美食',
    '拉麵',
    '拉面',
    '火鍋',
    '火锅',
    '奶茶',
    '點心',
    '点心',
    '中餐',
    '川菜',
    'voucher',
    'vouchers',
    'promo code',
    'discount',
    'coupon',
    'cashback',
    'split',
    'owe',
    'expense',
    'receipt',
    '優惠碼',
    '优惠码',
    '折扣',
    '代金券',
    '分帳',
    '分账',
    'ai news',
    'newsletter',
    'openai',
    'anthropic',
    'llm',
    'AI新聞',
    'AI新闻',
    '新聞',
    '新闻',
    'popup',
    'pop-up',
    'pop up',
    'exhibition',
    'sample sale',
    '快閃',
    '快闪',
    '市集',
    'visa',
    'hackathon',
    'recall',
    'food alert',
    '簽證',
    '签证',
    '召回',
  ],
  sessionWindowMs: 180_000,
  silenceThreshold: 0.55,
  capabilities: {
    supportsVoice: true,
    supportsImages: false,
    supportsProactiveDm: true,
  },
};

const HANT_SIGNAL_RE =
  /[搖籤運勢靈詩週決態隱處導幫覺殺撐這們說帳賬還麼為錢誰嗎過個對沒開關請問謝購買賣優惠碼號網頁鏈記錄裡裏點電話車飯館倫國給讓覺得應該會樣時間現剛後邊塊張條筆實際薦評價雞麵湯鍋燒餃餅魚蝦豬鴨鵝鹹熱凍廳樓區訂預約單掃發總結轉聯繫試錯誤漏補刪變換選擇歡認識聽寫讀學習業產務題詳細簡複雜難兩萬億歲體驗視頻聲語銀幣鎊歐減費郵滿贈禮獎勵積員級專屬貴劃維護與雖經較處種從離來進無動飲]/;
const HANS_SIGNAL_RE =
  /[摇签运势灵诗周决态隐处导帮觉杀撑这们说帐账还么为钱谁吗过个对没开关请问谢购买卖优惠码号网页链记录里点电话车饭馆伦国给让觉得应该会样时间现刚后边块张条笔实际荐评价鸡汤锅烧饺饼鱼虾猪鸭鹅咸热冻厅楼区订预约单扫发总结转联系试错误漏补删变换选择欢认识听写读学习业产物题详细简复杂难两万亿岁体验视频声语银币镑欧减费邮满赠礼奖励积员级专属贵划维护与虽经较处种从离来进无动饮]/;

const EN_CRISIS_RE =
  /\b(?:suicid(?:e|al)|kill\s+myself|end\s+my\s+life|want\s+to\s+die|wanna\s+die|better\s+off\s+dead|self[- ]?harm|hurt\s+myself|cut\s+myself|overdose|hang\s+myself|kill\s+someone|hurt\s+someone|in\s+immediate\s+danger)\b/i;
const ZH_CRISIS_RE =
  /(?:想死|不想活|活不下去了|活不下去|自殺|自杀|輕生|轻生|尋死|寻死|結束生命|结束生命|了結生命|了结生命|割腕|跳樓|跳楼|上吊|服毒|自殘|自残|傷害自己|伤害自己|傷害別人|伤害别人|殺了別人|杀了别人|遇到危險|遇到危险)/;

const ALL_KNOWN_MENTION_NAMES = [
  'AI Tarot',
  'Tarot Master',
  'tarot-master-2',
  '塔羅大師',
  '塔罗大师',
  '塔羅師',
  '塔罗师',
  'AI Fortune Stick',
  'fortune-stick',
  'wenyiqian',
  '問一籤',
  '问一签',
  '解籤師',
  '解签师',
  'AI in 5',
  'AI5',
  'ai5-chat',
  'AI新聞',
  'AI新闻',
  'Spotted London',
  'spotted-guide',
  'London Chinese Food',
  'lcf-guide',
  'Manyfold Data',
  'mfd-guide',
  'Penny',
  'penny',
  '記帳狗',
  'Quidpaw',
  'QuidPaw',
  '省錢小幫手',
];

const BARE_DRAW_TRIGGER_RE =
  /^(?:搖|摇|搖籤|摇签|搖一籤|摇一签|抽|抽籤|抽签|抽一支|抽一支籤|抽一支签|求籤|求签|求一籤|求一签|問一籤|问一签|問籤|问签|來一籤|来一签|再抽一支|draw|draw\s+(?:a\s+)?(?:fortune\s+)?stick|shake(?:\s+(?:a\s+)?stick)?|pull\s+(?:a\s+)?stick|fortune\s*stick)$/i;
const SESSION_CONFIRM_RE = /^(?:ok|okay|go|ready|yes|好|好的|可以|來吧|来吧|開始|开始|請|请)$/i;
const EXPLICIT_DRAW_PHRASE_RE =
  /(?:搖一?支?籤|摇一?支?签|求一?支?籤|求一?支?签|求個?籤|求个?签|抽一?支?籤|抽一?支?签|抽個?籤|抽个?签|問一?支?籤|问一?支?签|來一?支?籤|来一?支?签|幫我求.{0,4}[籤签]|帮我求.{0,4}[籤签]|draw\s+(?:me\s+)?(?:a\s+)?(?:fortune\s+)?stick|shake\s+(?:a\s+)?(?:fortune\s+)?stick|pull\s+(?:a\s+)?(?:fortune\s+)?stick)/i;
const JACKPOT_QUESTION_RE =
  /^(?:(?:我)?(?:今天|今晚|明天)?(?:會|会|能|可以)?(?:中(?:獎|奖|頭獎|头奖|大獎|大奖|\s*\d[\d,.]*\s*[萬万]?)|贏(?:得)?頭獎|赢(?:得)?头奖)[嗎吗]|(?:will|can)\s+i\s+win\s+(?:(?:the|a)\s+)?(?:lottery|jackpot)(?:\s+(?:today|tonight|tomorrow))?)$/i;
const STICK_LOOKUP_RE =
  /^(?:請|请)?(?:幫我|帮我)?(?:查(?:詢|询|一下|看)?|看(?:一下|一眼|看)?)?\s*第?\s*(\d{1,2})\s*[籤签]|^(?:please\s+)?(?:check\s+|show\s+(?:me\s+)?|look\s+up\s+)?stick\s*#?(\d{1,2})$/i;

const OPT_IN_SOLAR_RE =
  /^(?:訂閱節氣|订阅节气|開啟節氣|开启节气|打開節氣|打开节气|opt[- ]?in\s+solar[- ]?term|subscribe\s+solar[- ]?term)\b/i;
const OPT_OUT_SOLAR_RE =
  /^(?:取消節氣|取消节气|關閉節氣|关闭节气|停止節氣|停止节气|退訂節氣|退订节气|opt[- ]?out\s+solar[- ]?term|unsubscribe\s+solar[- ]?term)\b/i;
const OPT_IN_WEEKLY_RE =
  /^(?:訂閱每週|订阅每周|開啟每週|开启每周|opt[- ]?in\s+weekly|subscribe\s+weekly)\b/i;
const OPT_OUT_WEEKLY_RE =
  /^(?:取消每週|取消每周|關閉每週|关闭每周|停止每週|停止每周|opt[- ]?out\s+weekly|unsubscribe\s+weekly)\b/i;
const DM_GREETING_RE =
  /^(?:hi|hello|hey|yo|morning|good\s+(?:morning|afternoon|evening)|你好|您好|哈囉|哈啰|嗨|安安|早安|午安|晚安|在嗎|在吗|有人嗎|有人吗)$/i;
const DM_THANKS_RE =
  /(?:謝謝|谢谢|感謝|感谢|多謝|多谢|謝啦|谢啦|\b(?:thanks?|thank\s+you|thx|tysm|cheers|appreciated)\b)/i;
const CAPABILITY_RE =
  /(?:你能(?:幫我|帮我)?(?:做|求|查|看)(?:什麼|什么|哪些)|你可以(?:幫我|帮我)?(?:做|求|查|看)(?:什麼|什么|哪些)|what\s+can\s+you\s+(?:do|help))/i;
const CASUAL_SMALL_TALK_PHRASE_RE =
  /天氣|天气|下雨|下雪|晴天|陰天|阴天|出太陽|出太阳|刮風|刮风|降溫|降温|回暖|好冷|好熱|好热|早點休息|早点休息|早點睡|早点睡|去睡覺|去睡觉|睡覺了|睡觉了|想睡了|先休息|休息了|去休息|先去忙|去忙一下|先忙了|去忙了|晚點聊|晚点聊|晚點見|晚点见|下次聊|改天聊|回頭聊|回头聊|先這樣|先这样|先走了|先走囉|掰掰|拜拜|晚安|沒事了|没事了|不用了|先不用|下線了|下线了|(?:好[喔哦啊呀]?[，,\s]*)?(?:謝謝|谢谢|感謝|感谢|多謝|多谢)(?:你|您)?(?:啦|喔|哦|呀)?(?:[!！。.~～\s]*$|[，,\s]*(?:我先|先去|沒事|没事|先這樣|先这样|早點|早点|晚點|晚点|掰掰|拜拜|大家|各位|了))|\b(?:nice\s+weather|good\s+weather|bad\s+weather|weather\s+(?:is|today)|going\s+to\s+(?:bed|sleep)|go\s+to\s+(?:bed|sleep)|get\s+some\s+rest|heading\s+out|got\s+to\s+go|gotta\s+go|gtg|g2g|brb|ttyl|see\s+(?:you|ya)|bye(?:\s+bye)?|goodbye|good\s*night|goodnight|never\s*mind|nvm|talk\s+later)\b|\b(?:thanks?(?:\s+(?:a\s+lot|so\s+much))?|thank\s+you(?:\s+(?:so\s+much|very\s+much))?|thx|tysm|ty|cheers)\b(?:\s*[!！.。~～]*$|\s*,?\s*(?:i(?:'m|\s+am)?\s+(?:going|heading|off)|got\s+to\s+go|gotta\s+go|gtg|g2g|brb|ttyl|bye|see\s+(?:you|ya)|talk\s+later|good\s*night|goodnight))/i;
const BARE_GREETING_OR_THANKS_RE =
  /^(?:(?:(?:hi|hello|hey|yo|gm|gn|morning|afternoon|evening|good\s+(?:morning|afternoon|evening|night)|goodnight|你好|您好|哈囉|哈啰|嗨|安安|早安|午安|晚安|早啊?|大家好|各位好|各位早|大家早|在嗎|在吗|有人嗎|有人吗|打擾了|打扰了)(?:[\s,，!！.。~～]*(?:各位|大家|all|everyone|there))?)(?:[,，\s]+)?|(?:(?:(?:hi|hello|hey|你好|您好|嗨|早安|午安|晚安)[,，\s]+|(?:好[喔哦啊呀]?|好的|嗯嗯?)[,，\s]*|(?:ok(?:ay)?|got\s+it|alright|sure|cool)[,，\s]+)?(?:(?:非常|真的|太|很)?(?:謝謝(?:你|您|大家)?|谢谢(?:你|您|大家)?|謝啦|谢啦|感謝(?:你|您|大家)?|感谢(?:你|您|大家)?|多謝|多谢|辛苦了|麻煩你?了|麻烦你?了)(?:的幫忙|的帮助)?|thanks?(?:\s+(?:you|a\s+lot|so\s+much))?|thank\s+you(?:\s+(?:so\s+much|very\s+much))?|thx|tysm|ty|cheers|appreciated)(?:\s+for\s+(?:your\s+help|the\s+help|helping|everything))?)|好[喔哦]|嗯嗯|了解|收到|好累[喔哦啊呀]?|累死了|好睏|好困|哈哈+|呵呵+|笑死|lol|lmao)[!！.。~～?？\s]*$/i;
const STICK_FOLLOWUP_CUE_RE =
  /(?:籤|签|搖|摇|抽|求籤|求签|問籤|问签|解讀|解读|解釋|解释|怎麼解|怎么解|第\s*[0-9一二三四五六七八九十兩两]+\s*[籤签句]|[這那][支句首]|再來一[支籤签]|再来一[支签]|詩句|诗句|聖意|圣意|解曰|上上|上吉|中平|中吉|下下|下籤|下签|\b(?:fortune\s*stick|sticks?|draw|shake|pull|couplet|poem|reading|interpret(?:ation)?|explain|meaning)\b)/i;

function stripMentionsAndPunct(text: string): string {
  return stripAgentMentions(text ?? '', ALL_KNOWN_MENTION_NAMES)
    .replace(/^[\s,，.。!！?？:：;；"'「」『』()（）]+|[\s,，.。!！?？:：;；"'「」『』()（）]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Checks whether the inbound message expresses acute self-harm, violence, or immediate danger. */
export function isCrisisMessage(text: string): boolean {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  return EN_CRISIS_RE.test(clean) || ZH_CRISIS_RE.test(clean);
}

/** Resolves pure `'zh-Hant' | 'zh-Hans' | 'en'` matching the speaker's script or stored preference. */
export function resolveStickLang(
  text: string,
  decisionLang: LangCode,
  memories?: RecallTurnResult,
): LangCode {
  const clean = stripMentionsAndPunct(text);
  const explicitSwitch = detectExplicitLangSwitch(clean);
  if (explicitSwitch) return explicitSwitch;

  const hasHant = HANT_SIGNAL_RE.test(clean);
  const hasHans = HANS_SIGNAL_RE.test(clean);
  if (hasHant && !hasHans) return 'zh-Hant';
  if (hasHans && !hasHant) return 'zh-Hans';

  const stored = memories?.userMemories.find((m) => m.key === 'lang')?.value;
  const storedOrDecision: LangCode =
    stored === 'zh-Hant' || stored === 'zh-Hans' || stored === 'en' ? stored : decisionLang;
  return detectLang(clean, storedOrDecision, storedOrDecision, {
    extraMentionNames: ALL_KNOWN_MENTION_NAMES,
  });
}

export function crisisReply(lang: LangCode): string {
  if (lang === 'zh-Hant') {
    return [
      '聽到你現在很不容易，我們先不求籤。',
      '如果你有傷害自己或他人的念頭，或正處於危險之中，請立刻聯絡身邊信任的人或專業支援：',
      '英國請撥緊急電話 999 或 Samaritans 116 123；美國請撥 911 或 988；中國大陸請撥 110／120 或心理援助熱線 12356。你不需要一個人扛著。',
    ].join('\n');
  }
  if (lang === 'zh-Hans') {
    return [
      '听到你现在很不容易，我们先不求签。',
      '如果你有伤害自己或他人的念头，或正处于危险之中，请立刻联系身边信任的人或专业支持：',
      '英国请拨紧急电话 999 或 Samaritans 116 123；美国请拨 911 或 988；中国大陆请拨 110／120 或心理援助热线 12356。你不需要一个人扛着。',
    ].join('\n');
  }
  return [
    'I hear how heavy things feel right now, so let us pause the stick draw.',
    'If you are in immediate danger or thinking of hurting yourself or someone else, please reach someone right away: emergency services (UK 999, US 911, China 110 or 120) or a crisis line (UK Samaritans 116 123, US 988, China 12356). You do not have to carry this alone.',
  ].join('\n');
}

function localizedStickText(raw: string, lang: LangCode): string {
  const clean = withoutDashes(raw);
  return lang === 'zh-Hant' ? toZhHant(clean) : clean;
}

/** Formats a stick reading in pure `zh-Hant` / `zh-Hans` / `en` with zero dashes. */
export function formatStickReply(
  stick: FortuneStick,
  lang: LangCode,
  options: { isVoice?: boolean } = {},
): string {
  const textLocale = lang === 'en' ? 'en' : 'zh';
  const copy = stickText(stick, textLocale);
  const loc = (s: string) => localizedStickText(s, lang);
  const levelLabel = loc(LEVEL_LABEL[textLocale][stick.level]);
  const title = loc(copy.title);
  const poem0 = loc(copy.poem[0]);
  const poem1 = loc(copy.poem[1]);
  const meaning = loc(copy.meaning);
  const general = loc(copy.general);
  const action = loc(copy.action);

  if (options.isVoice) {
    if (lang === 'zh-Hant') {
      return `第 ${stick.no} 籤，${levelLabel}，「${title}」。籤詩：${poem0}，${poem1}。這支籤的意思是：${meaning} ${general} 今天可以做的一件小事：${action}`;
    }
    if (lang === 'zh-Hans') {
      return `第 ${stick.no} 签，${levelLabel}，「${title}」。签诗：${poem0}，${poem1}。这支签的意思是：${meaning} ${general} 今天可以做的一件小事：${action}`;
    }
    return `Stick ${stick.no} of ${STICK_COUNT}, ${levelLabel}, ${title}. ${poem0}. ${poem1}. ${meaning} ${general} One small step today: ${action}`;
  }

  if (lang === 'zh-Hant') {
    return [
      `第 ${stick.no} 籤 · ${levelLabel} · ${title}`,
      `籤詩：${poem0}，${poem1}`,
      `籤意：${meaning}`,
      `解讀：${general}`,
      `今日可行的一件小事：${action}`,
      `若想結合你的處境繼續追問這支籤，直接接著說即可。線上求籤：${FORTUNE_STICK_SITE_URL}`,
    ].join('\n');
  }
  if (lang === 'zh-Hans') {
    return [
      `第 ${stick.no} 签 · ${levelLabel} · ${title}`,
      `签诗：${poem0}，${poem1}`,
      `签意：${meaning}`,
      `解读：${general}`,
      `今日可行的一件小事：${action}`,
      `如果想结合你的处境继续追问这支签，直接接着说即可。在线求签：${FORTUNE_STICK_SITE_URL}`,
    ].join('\n');
  }
  return [
    `Stick ${stick.no} of ${STICK_COUNT} · ${levelLabel} · ${title}`,
    `Couplet: ${poem0} / ${poem1}`,
    `Meaning: ${meaning}`,
    `Reading: ${general}`,
    `One small thing today: ${action}`,
    `Ask a follow-up about this stick anytime, or shake one online at ${FORTUNE_STICK_SITE_URL}`,
  ].join('\n');
}

/** Formats a fresh CSPRNG-drawn fortune stick via `drawStickNo()`. */
export function formatLocalStickDraw(
  lang: LangCode,
  options: { isVoice?: boolean; randomByte?: () => number } = {},
): string {
  const no = drawStickNo(options.randomByte);
  const stick = stickByNo(no) ?? stickByNo(1)!;
  return formatStickReply(stick, lang, { isVoice: options.isVoice });
}

interface SolarTermSpec {
  month: number; // 1-12
  c21: number; // 21st century (2000-2099) C value
  slug: string;
  zhHans: string;
  zhHant: string;
  en: string;
}

const SOLAR_TERMS_21C: readonly SolarTermSpec[] = [
  { month: 1, c21: 5.4055, slug: 'xiaohan', zhHans: '小寒', zhHant: '小寒', en: 'Minor Cold (Xiaohan)' },
  { month: 1, c21: 20.12, slug: 'dahan', zhHans: '大寒', zhHant: '大寒', en: 'Major Cold (Dahan)' },
  { month: 2, c21: 3.87, slug: 'lichun', zhHans: '立春', zhHant: '立春', en: 'Start of Spring (Lichun)' },
  { month: 2, c21: 18.73, slug: 'yushui', zhHans: '雨水', zhHant: '雨水', en: 'Rain Water (Yushui)' },
  { month: 3, c21: 5.63, slug: 'jingzhe', zhHans: '惊蛰', zhHant: '驚蟄', en: 'Awakening of Insects (Jingzhe)' },
  { month: 3, c21: 20.646, slug: 'chunfen', zhHans: '春分', zhHant: '春分', en: 'Spring Equinox (Chunfen)' },
  { month: 4, c21: 4.81, slug: 'qingming', zhHans: '清明', zhHant: '清明', en: 'Pure Brightness (Qingming)' },
  { month: 4, c21: 20.1, slug: 'guyu', zhHans: '谷雨', zhHant: '穀雨', en: 'Grain Rain (Guyu)' },
  { month: 5, c21: 5.52, slug: 'lixia', zhHans: '立夏', zhHant: '立夏', en: 'Start of Summer (Lixia)' },
  { month: 5, c21: 21.04, slug: 'xiaoman', zhHans: '小满', zhHant: '小滿', en: 'Grain Buds (Xiaoman)' },
  { month: 6, c21: 5.678, slug: 'mangzhong', zhHans: '芒种', zhHant: '芒種', en: 'Grain in Ear (Mangzhong)' },
  { month: 6, c21: 21.37, slug: 'xiazhi', zhHans: '夏至', zhHant: '夏至', en: 'Summer Solstice (Xiazhi)' },
  { month: 7, c21: 7.108, slug: 'xiaoshu', zhHans: '小暑', zhHant: '小暑', en: 'Minor Heat (Xiaoshu)' },
  { month: 7, c21: 22.83, slug: 'dashu', zhHans: '大暑', zhHant: '大暑', en: 'Major Heat (Dashu)' },
  { month: 8, c21: 7.5, slug: 'liqiu', zhHans: '立秋', zhHant: '立秋', en: 'Start of Autumn (Liqiu)' },
  { month: 8, c21: 23.13, slug: 'chushu', zhHans: '处暑', zhHant: '處暑', en: 'End of Heat (Chushu)' },
  { month: 9, c21: 7.646, slug: 'bailu', zhHans: '白露', zhHant: '白露', en: 'White Dew (Bailu)' },
  { month: 9, c21: 23.042, slug: 'qiufen', zhHans: '秋分', zhHant: '秋分', en: 'Autumn Equinox (Qiufen)' },
  { month: 10, c21: 8.318, slug: 'hanlu', zhHans: '寒露', zhHant: '寒露', en: 'Cold Dew (Hanlu)' },
  { month: 10, c21: 23.438, slug: 'shuangjiang', zhHans: '霜降', zhHant: '霜降', en: 'Frost Descent (Shuangjiang)' },
  { month: 11, c21: 7.438, slug: 'lidong', zhHans: '立冬', zhHant: '立冬', en: 'Start of Winter (Lidong)' },
  { month: 11, c21: 22.36, slug: 'xiaoxue', zhHans: '小雪', zhHant: '小雪', en: 'Minor Snow (Xiaoxue)' },
  { month: 12, c21: 7.18, slug: 'daxue', zhHans: '大雪', zhHant: '大雪', en: 'Major Snow (Daxue)' },
  { month: 12, c21: 21.94, slug: 'dongzhi', zhHans: '冬至', zhHant: '冬至', en: 'Winter Solstice (Dongzhi)' },
];

/** Returns today's solar term in UTC+8 (or `null` if today is not a solar term boundary). */
export function getSolarTermForDate(date: Date): (SolarTermSpec & { dateIso: string }) | null {
  const taipei = new Date(date.getTime() + 8 * 3_600_000);
  const year = taipei.getUTCFullYear();
  if (year < 2000 || year > 2099) return null;
  const month = taipei.getUTCMonth() + 1;
  const day = taipei.getUTCDate();
  const y = year % 100;
  const leapAdjust = Math.floor((y - 1) / 4);
  for (const term of SOLAR_TERMS_21C) {
    if (term.month !== month) continue;
    const termDay = Math.floor(y * 0.2422 + term.c21) - leapAdjust;
    if (termDay === day) {
      const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { ...term, dateIso };
    }
  }
  return null;
}

function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CJK_CHAR_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

function matchSpecKeyword(text: string, lowerText: string, kw: string | RegExp): boolean {
  if (kw instanceof RegExp) return kw.test(text);
  const needle = kw.trim().toLowerCase();
  if (!needle) return false;
  if (CJK_CHAR_RE.test(needle)) return lowerText.includes(needle);
  return new RegExp(`(?<![a-z0-9])${escapeRegex(needle)}(?![a-z0-9])`, 'i').test(text);
}

function hasAnyDomainKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return (FORTUNE_STICK_AGENT_SPEC.domainKeywords ?? []).some((kw) =>
    matchSpecKeyword(text, lower, kw),
  );
}

function hasAnyAntiKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return (FORTUNE_STICK_AGENT_SPEC.antiKeywords ?? []).some((kw) =>
    matchSpecKeyword(text, lower, kw),
  );
}

function hasStickFollowUpCue(text: string): boolean {
  return (
    hasAnyDomainKeyword(text) ||
    BARE_DRAW_TRIGGER_RE.test(text) ||
    SESSION_CONFIRM_RE.test(text) ||
    EXPLICIT_DRAW_PHRASE_RE.test(text) ||
    STICK_LOOKUP_RE.test(text) ||
    STICK_FOLLOWUP_CUE_RE.test(text)
  );
}

function isCasualActiveSessionChatter(text: string): boolean {
  if (!text || hasStickFollowUpCue(text)) return false;
  return CASUAL_SMALL_TALK_PHRASE_RE.test(text) || BARE_GREETING_OR_THANKS_RE.test(text);
}

/**
 * `fastRespond` handler for `fortune-stick`:
 * 1. Crisis safety check (always runs first, never draws a stick).
 * 2. Language switch & opt-in solar-term / weekly reminder preference commands.
 * 3. Active-session off-topic chatter silence guard.
 * 4. Stick lookup (`stick 8` / `第8籤`) or local CSPRNG draw (`搖`/`摇`/`draw`/`求籤`) in pure `zh-Hant`/`zh-Hans`/`en`.
 * 5. Returns `null` for open questions & follow-ups so Manyfold A2A answers.
 */
export async function fortuneFastRespond(
  env: Env,
  event: InboundEvent,
  decision: TriageDecision,
  memories: RecallTurnResult,
): Promise<string | null> {
  const lang = resolveStickLang(event.text, decision.detectedLang, memories);

  if (isCrisisMessage(event.text)) {
    return crisisReply(lang);
  }

  const stripped = stripMentionsAndPunct(event.text);

  // Explicit language switch persistence
  const explicitLangSwitch = detectExplicitLangSwitch(stripped);
  if (explicitLangSwitch) {
    if (env.DB) {
      await new MemoryStore(env.DB, FORTUNE_STICK_AGENT_ID)
        .rememberUser({
          userId: event.senderId,
          key: 'lang',
          value: explicitLangSwitch,
          kind: 'language',
          originChatType: event.chatType,
          originRoomId: event.roomId,
        })
        .catch(() => undefined);
    }
    if (explicitLangSwitch === 'zh-Hant') {
      return '好的，接下來我會用繁體中文為你解籤。心裡有想問的事，隨時寫下來。';
    }
    if (explicitLangSwitch === 'zh-Hans') {
      return '好的，接下来我会用简体中文为你解签。心里有想问的事，随时写下来。';
    }
    return 'Of course, I will answer in English from here. Tell me what is on your mind when you are ready to draw a stick.';
  }

  // Explicit opt-in / opt-out for solar-term or weekly broadcasts
  if (OPT_IN_SOLAR_RE.test(stripped)) {
    if (env.DB) {
      await new MemoryStore(env.DB, FORTUNE_STICK_AGENT_ID)
        .rememberRoom({
          roomId: event.roomId,
          key: 'opt_in_solar_term',
          value: 'true',
          kind: 'preference',
          updatedBy: event.senderId,
        })
        .catch(() => undefined);
    }
    if (lang === 'zh-Hant') return '好的，已為這個房間開啟節氣求籤提醒。想隨時取消告訴我一聲即可。';
    if (lang === 'zh-Hans') return '好的，已为这个房间开启节气求签提醒。想随时取消告诉我一声即可。';
    return 'Done, solar term stick reminders are now enabled for this room. Let me know anytime if you want to turn them off.';
  }
  if (OPT_OUT_SOLAR_RE.test(stripped)) {
    if (env.DB) {
      await new MemoryStore(env.DB, FORTUNE_STICK_AGENT_ID)
        .rememberRoom({
          roomId: event.roomId,
          key: 'opt_in_solar_term',
          value: 'false',
          kind: 'preference',
          updatedBy: event.senderId,
        })
        .catch(() => undefined);
    }
    if (lang === 'zh-Hant') return '好的，已關閉這個房間的節氣提醒。';
    if (lang === 'zh-Hans') return '好的，已关闭这个房间的节气提醒。';
    return 'Got it, solar term reminders are turned off for this room.';
  }
  if (OPT_IN_WEEKLY_RE.test(stripped)) {
    if (env.DB) {
      await new MemoryStore(env.DB, FORTUNE_STICK_AGENT_ID)
        .rememberRoom({
          roomId: event.roomId,
          key: 'opt_in_weekly',
          value: 'true',
          kind: 'preference',
          updatedBy: event.senderId,
        })
        .catch(() => undefined);
    }
    if (lang === 'zh-Hant') return '好的，已為這個房間開啟每週一籤提醒。';
    if (lang === 'zh-Hans') return '好的，已为这个房间开启每周一签提醒。';
    return 'Done, weekly fortune stick reminders are now enabled for this room.';
  }
  if (OPT_OUT_WEEKLY_RE.test(stripped)) {
    if (env.DB) {
      await new MemoryStore(env.DB, FORTUNE_STICK_AGENT_ID)
        .rememberRoom({
          roomId: event.roomId,
          key: 'opt_in_weekly',
          value: 'false',
          kind: 'preference',
          updatedBy: event.senderId,
        })
        .catch(() => undefined);
    }
    if (lang === 'zh-Hant') return '好的，已關閉這個房間的每週提醒。';
    if (lang === 'zh-Hans') return '好的，已关闭这个房间的每周提醒。';
    return 'Got it, weekly fortune stick reminders are turned off for this room.';
  }

  const isUnmentionedGroup =
    event.chatType === 'group' &&
    decision.reason !== 'explicit_mention' &&
    decision.reason !== 'reply_to_self';

  // Keep unmentioned group turns silent on off-topic anti-keywords and casual active-session chatter
  if (isUnmentionedGroup) {
    if (
      !BARE_DRAW_TRIGGER_RE.test(stripped) &&
      !SESSION_CONFIRM_RE.test(stripped) &&
      !STICK_LOOKUP_RE.test(stripped) &&
      hasAnyAntiKeyword(stripped) &&
      !hasAnyDomainKeyword(stripped)
    ) {
      return '[NO_REPLY]';
    }
    if (decision.reason === 'active_session' && isCasualActiveSessionChatter(stripped)) {
      return '[NO_REPLY]';
    }
  }

  const isDirectConversation =
    event.chatType === 'dm' || decision.reason === 'dm' || decision.reason === 'explicit_mention';

  if (
    isDirectConversation &&
    (!stripped || DM_GREETING_RE.test(stripped) || CAPABILITY_RE.test(stripped))
  ) {
    if (lang === 'zh-Hant') {
      return '嗨！我是問一籤（AI Fortune Stick）🎋 想求支籤看看方向嗎？直接跟我說「求籤」、「搖一籤」、「看第8籤」，或把心裡想問的事告訴我就可以開始。';
    }
    if (lang === 'zh-Hans') {
      return '嗨！我是问一签（AI Fortune Stick）🎋 想求支签看看方向吗？直接跟我说“求签”、“摇一签”、“看第8签”，或把心里想问的事告诉我就可以开始。';
    }
    return 'Hi! I am AI Fortune Stick 🎋 Say "draw a stick", "stick 8", or tell me what is on your mind whenever you are ready.';
  }

  if (
    isDirectConversation &&
    DM_THANKS_RE.test(stripped) &&
    !BARE_DRAW_TRIGGER_RE.test(stripped) &&
    !EXPLICIT_DRAW_PHRASE_RE.test(stripped) &&
    !STICK_LOOKUP_RE.test(stripped) &&
    !/[?？]$/.test(event.text.trim())
  ) {
    if (lang === 'zh-Hant') {
      return '不客氣 🎋 願這支籤帶給你一點平靜與方向！之後想再求籤或查籤詩，隨時來找我。';
    }
    if (lang === 'zh-Hans') {
      return '不客气 🎋 愿这支签带给你一点平静与方向！之后想再求签或查签诗，随时来找我。';
    }
    return "You're very welcome 🎋 May that stick bring a little clarity and calm! Come back anytime you want to draw another stick or look one up.";
  }

  const lookupMatch = STICK_LOOKUP_RE.exec(stripped);
  if (lookupMatch) {
    const no = Number(lookupMatch[1] ?? lookupMatch[2]);
    const found = stickByNo(no);
    if (found) {
      return formatStickReply(found, lang, { isVoice: event.isVoice === true });
    }
  }

  if ((isDirectConversation || decision.reason === 'reply_to_self') && JACKPOT_QUESTION_RE.test(stripped)) {
    const framing = lang === 'zh-Hant'
      ? '開獎結果是隨機的。這支籤可以當作今天的提醒。'
      : lang === 'zh-Hans'
        ? '开奖结果是随机的。这支签可以当作今天的提醒。'
        : 'The draw is random. Here’s a fortune stick for reflection.';
    return framing + '\n\n' + formatLocalStickDraw(lang, { isVoice: event.isVoice === true });
  }

  const isDirectDraw =
    BARE_DRAW_TRIGGER_RE.test(stripped) ||
    (decision.reason === 'active_session' && SESSION_CONFIRM_RE.test(stripped)) ||
    EXPLICIT_DRAW_PHRASE_RE.test(stripped);

  if (isDirectDraw) {
    return formatLocalStickDraw(lang, { isVoice: event.isVoice === true });
  }

  return null;
}

/**
 * Fetches solar-term / weekly broadcasts ONLY for rooms that explicitly opted in
 * (`opt_in_solar_term = 'true'` or `opt_in_weekly = 'true'`). Returns `[]` by default.
 */
export async function fetchFortuneUpdates(
  env: Env,
  _sinceIso: string,
  nowDate = new Date(),
): Promise<AgentUpdateItem[]> {
  if (!isNarraGatewayEnabled(env) || !env.DB) return [];
  try {
    const { results } = await env.DB
      .prepare(
        `SELECT room_id AS roomId, memory_key AS key
         FROM narra_room_memory
         WHERE agent_id = ?
           AND memory_key IN ('opt_in_solar_term', 'opt_in_weekly')
           AND LOWER(memory_value) IN ('true', 'on', '1', 'yes')`,
      )
      .bind(FORTUNE_STICK_AGENT_ID)
      .all<{ roomId: string; key: string }>();

    if (!results || results.length === 0) return [];
    const term = getSolarTermForDate(nowDate);
    const week = isoWeekKey(nowDate);
    const items: AgentUpdateItem[] = [];
    const seenRooms = new Set<string>();

    for (const row of results) {
      if (row.key === 'opt_in_solar_term' && !term) continue;
      if (seenRooms.has(`${row.roomId}:${row.key}`)) continue;
      seenRooms.add(`${row.roomId}:${row.key}`);

      const langRow = await env.DB
        .prepare(
          `SELECT memory_value AS lang
           FROM narra_room_memory
           WHERE agent_id = ? AND room_id = ? AND memory_key = 'lang'`,
        )
        .bind(FORTUNE_STICK_AGENT_ID, row.roomId)
        .first<{ lang: string }>();
      const lang: LangCode =
        langRow?.lang === 'zh-Hans' || langRow?.lang === 'en' || langRow?.lang === 'zh-Hant'
          ? langRow.lang
          : 'zh-Hant';

      if (row.key === 'opt_in_solar_term' && term) {
        const text =
          lang === 'zh-Hant'
            ? `今日節氣「${term.zhHant}」（${term.dateIso}）：想為這個新節點求一支籤看看方向，回覆「搖」即可。 ${FORTUNE_STICK_SITE_URL}`
            : lang === 'zh-Hans'
              ? `今日节气「${term.zhHans}」（${term.dateIso}）：想为这个新节点求一支签看看方向，回复「摇」即可。 ${FORTUNE_STICK_SITE_URL}`
              : `Today marks ${term.en} (${term.dateIso}). Reply "draw" anytime if you would like to shake a stick for this season. ${FORTUNE_STICK_SITE_URL}`;
        items.push({
          updateKey: `solar_term:${term.dateIso}:${term.slug}`,
          roomId: row.roomId,
          title: `Solar term ${term.slug}`,
          text,
          lang,
          priority: 'normal',
        });
      } else if (row.key === 'opt_in_weekly') {
        const text =
          lang === 'zh-Hant'
            ? `每週問一籤（${week}）：如果心裡有在意的事想梳理，回覆「搖」就可以抽一支籤。 ${FORTUNE_STICK_SITE_URL}`
            : lang === 'zh-Hans'
              ? `每周问一签（${week}）：如果心里有在意的事想梳理，回复「摇」就可以抽一支签。 ${FORTUNE_STICK_SITE_URL}`
              : `Weekly fortune stick check-in (${week}): if something is weighing on you, reply "draw" to shake a stick. ${FORTUNE_STICK_SITE_URL}`;
        items.push({
          updateKey: `weekly:${week}`,
          roomId: row.roomId,
          title: `Weekly stick ${week}`,
          text,
          lang,
          priority: 'normal',
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** Resolves A2A credential from `MANYFOLD_A2A_URL`/`MANYFOLD_A2A_TOKEN` or connected D1 agents. */
export async function resolveFortuneA2ACredential(
  env: Env,
): Promise<NarraA2ACredentialResult | null> {
  const directUrl = (env.MANYFOLD_A2A_URL ?? '').trim();
  const directToken = (env.MANYFOLD_A2A_TOKEN ?? '').trim();
  if (directUrl && directToken) {
    return { url: directUrl, token: directToken, label: FORTUNE_STICK_AGENT_SPEC.name };
  }
  if (!env.DB) return null;
  try {
    await ensureSchema(env.DB);
    const agents = await listConnectedAgents(env);
    const preferredId = (env.NARRA_AGENT_ID ?? '').trim();
    const chosen =
      (preferredId ? agents.find((a) => a.agentId === preferredId) : undefined) ?? agents[0];
    if (!chosen) return null;
    const cred = await credentialFor(env, chosen.agentId);
    return { url: cred.rpcUrl, token: cred.token, label: cred.label };
  } catch {
    return null;
  }
}

const STICK_NO_IN_TEXT_RE = /(?:第\s*(\d{1,2})\s*[籤签]|\bstick\s+(\d{1,2})\s+of\s+36\b)/i;
const MAX_EXTRA_FIELD_CHARS = 1000;

function extractStickNoFromText(text: string): number | null {
  const match = STICK_NO_IN_TEXT_RE.exec(text ?? '');
  if (!match) return null;
  const parsed = Number(match[1] ?? match[2]);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= STICK_COUNT ? parsed : null;
}

function formatStickContextSnippet(stick: FortuneStick, lang: LangCode): string {
  const textLocale = lang === 'en' ? 'en' : 'zh';
  const copy = stickText(stick, textLocale);
  const loc = (s: string) => localizedStickText(s, lang);
  const levelLabel = loc(LEVEL_LABEL[textLocale][stick.level]);
  const title = loc(copy.title);
  const poem0 = loc(copy.poem[0]);
  const poem1 = loc(copy.poem[1]);
  const meaning = loc(copy.meaning);
  const general = loc(copy.general);

  let formatted: string;
  if (lang === 'zh-Hant') {
    formatted = `第 ${stick.no} 籤 · ${levelLabel} · ${title} | 籤詩：${poem0}，${poem1} | 籤意：${meaning} | 解讀：${general}`;
  } else if (lang === 'zh-Hans') {
    formatted = `第 ${stick.no} 签 · ${levelLabel} · ${title} | 签诗：${poem0}，${poem1} | 签意：${meaning} | 解读：${general}`;
  } else {
    formatted = `Stick ${stick.no} of ${STICK_COUNT} · ${levelLabel} · ${title} | Couplet: ${poem0} / ${poem1} | Meaning: ${meaning} | Reading: ${general}`;
  }
  return formatted.length <= MAX_EXTRA_FIELD_CHARS
    ? formatted
    : `${formatted.slice(0, MAX_EXTRA_FIELD_CHARS - 1)}…`;
}

/** Progress status text shown if a directly addressed A2A fortune stick turn exceeds `thinkingDelayMs`. */
export function fortuneThinkingMessage(lang: LangCode): string {
  if (lang === 'zh-Hant') return '🎋 正在結合你的籤詩與處境解讀中，稍等一下…';
  if (lang === 'zh-Hans') return '🎋 正在结合你的签诗与处境解读中，稍等一下…';
  return '🎋 Reflecting on your fortune stick and question, one moment…';
}

/**
 * Extracts the latest self-posted stick number from `replyToTarget` or `recentHistory`,
 * looks up the full stick via `stickByNo`, and injects it into A2A envelope context.
 */
export async function buildFortuneExtraEnvelopeFields(
  env: Env,
  event: InboundEvent,
  decision: TriageDecision,
  memories: RecallTurnResult,
  context: RoomContext,
): Promise<Record<string, string> | null> {
  const selfIds = new Set<string>([FORTUNE_STICK_DEFAULT_MATRIX_ID]);
  const configuredId = (env.NARRA_MATRIX_ID ?? env.MATRIX_USER_ID ?? '').trim();
  if (configuredId) selfIds.add(configuredId);

  let stickNo: number | null = null;
  const replyTarget = context.replyToTarget;
  if (replyTarget && (replyTarget.isSelf || selfIds.has(replyTarget.senderId))) {
    stickNo = extractStickNoFromText(replyTarget.text);
  }

  if (stickNo === null) {
    const history = context.recentHistory ?? [];
    for (let i = history.length - 1; i >= 0; i--) {
      const turn = history[i];
      if (!(turn.isSelf || selfIds.has(turn.senderId))) continue;
      const foundNo = extractStickNoFromText(turn.text);
      if (foundNo !== null) {
        stickNo = foundNo;
        break;
      }
    }
  }

  if (stickNo === null) return null;
  const stick = stickByNo(stickNo);
  if (!stick) return null;

  const lang = resolveStickLang(event.text, decision.detectedLang, memories);
  return {
    last_drawn_fortune_stick: formatStickContextSnippet(stick, lang),
  };
}

export const narraGatewayConfig: NarraGatewayConfig<Env> = {
  spec: FORTUNE_STICK_AGENT_SPEC,
  fastRespond: fortuneFastRespond,
  fetchUpdates: (env, sinceIso) => fetchFortuneUpdates(env, sinceIso),
  resolveA2ACredential: resolveFortuneA2ACredential,
  enableA2AFailureReply: true,
  thinkingMessage: (lang) => fortuneThinkingMessage(lang),
  buildExtraEnvelopeFields: buildFortuneExtraEnvelopeFields,
};

export function kickFortuneNarraGateway(env: Env): Promise<NarraGatewayKickResult> {
  return kickNarraGateway(env, narraGatewayConfig);
}

export function getFortuneNarraGatewayStatus(env: Env): Promise<NarraGatewayStatus> {
  return getNarraGatewayStatus(env, narraGatewayConfig);
}
