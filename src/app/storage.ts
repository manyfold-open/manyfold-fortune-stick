/**
 * 浏览器本地存储：求签记录和两个偏好开关。
 *
 * 记录留在用户自己的浏览器里（产品文档第五节），所以这里存的是完整内容 ——
 * 问题、签号、解读、追问、时间。服务端仍然保有同一份数据，用来在刷新后恢复
 * 当前这一支签和给追问提供上下文；本地这份负责让「求签记录」页立刻能打开。
 *
 * 每一次读写都包在 try/catch 里：无痕窗口、禁用站点数据的浏览器都会让
 * localStorage 直接抛错，那种情况下游戏应当照常能玩，只是记不住历史。
 */

import { addToCollection, collectionFrom, parseCollection, type Collection } from '../shared/collection';
import { readKnotHint, type KnotHint } from '../shared/knot-hint';
import { parseKnots, tieKnot, type Knot, type KnotMeta } from '../shared/knots';
import { isLanguage, languageFromLocales, type Language } from '../shared/lang';
import { browserStorage, safeGet, safeRemove, safeSet } from '../shared/safe-storage';
import type { Interpretation, Reading } from '../shared/types';

const RECORDS_KEY = 'wenyiqian.records';
const CURRENT_KEY = 'wenyiqian.current';
const PREFS_KEY = 'wenyiqian.prefs';
const COLLECTED_KEY = 'wenyiqian.collected';
const KNOTS_KEY = 'wenyiqian.knots';
const KNOT_SEEN_KEY = 'wenyiqian.knotSeen';
const KNOT_PEEKED_KEY = 'wenyiqian.knotPeeked';
/** 繩上的結換了：ShrineBackdrop 聽這個重讀 */
export const KNOTS_EVENT = 'wenyiqian:knots';
const RECORD_LIMIT = 100;

export interface LocalFollowUp {
  role: 'user' | 'agent';
  content: string;
}

export interface LocalRecord {
  id: string;
  question: string;
  stickNo: number;
  interpretation: Interpretation | null;
  followUps: LocalFollowUp[];
  createdAt: string;
}

export interface Prefs {
  /** 摇签音效 */
  sound: boolean;
  /** 减少动画。默认跟随系统的 prefers-reduced-motion。 */
  reducedMotion: boolean;
  /**
   * 界面语言。自己选过的一律照旧；还没选过的人按浏览器的语言挑一种我们有的
   * （languageFromLocales，只看语言不看国家），都没有就是英文。
   *
   * 注意这只管界面。签纸和解读的语言由问题本身决定（src/shared/lang.ts），
   * 改这个值不会动到任何一张已经印出来的签。
   */
  language: Language;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = safeGet(browserStorage('localStorage'), key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  safeSet(browserStorage('localStorage'), key, JSON.stringify(value));
}

function remove(key: string): void {
  safeRemove(browserStorage('localStorage'), key);
}

/* ───────── 当前这一支签 ───────── */

export const getCurrentReadingId = (): string | null => {
  return safeGet(browserStorage('localStorage'), CURRENT_KEY);
};

export const setCurrentReadingId = (id: string | null): void => {
  if (id) {
    safeSet(browserStorage('localStorage'), CURRENT_KEY, id);
  } else {
    remove(CURRENT_KEY);
  }
};

/* ───────── 求签记录 ───────── */

export const listRecords = (): LocalRecord[] => read<LocalRecord[]>(RECORDS_KEY, []);

/** 新记录放在最前；同一个 id 覆盖而不是追加，所以解签后再调用只是更新。 */
export function saveRecord(reading: Reading, followUps: LocalFollowUp[] = []): void {
  const records = listRecords();
  const existing = records.find((record) => record.id === reading.id);
  const next: LocalRecord = {
    id: reading.id,
    question: reading.question,
    stickNo: reading.stick.no,
    interpretation: reading.interpretation,
    followUps: followUps.length ? followUps : (existing?.followUps ?? []),
    createdAt: reading.createdAt,
  };
  write(RECORDS_KEY, [next, ...records.filter((record) => record.id !== reading.id)].slice(0, RECORD_LIMIT));
}

export function deleteRecord(id: string): void {
  write(
    RECORDS_KEY,
    listRecords().filter((record) => record.id !== id),
  );
  if (getCurrentReadingId() === id) setCurrentReadingId(null);
}

export function clearRecords(): void {
  remove(RECORDS_KEY);
  setCurrentReadingId(null);
}

/** Clear every browser-side value owned by this app, including preferences. */
export const clearLocalData = (): void => {
  remove(RECORDS_KEY);
  remove(CURRENT_KEY);
  remove(PREFS_KEY);
  remove(COLLECTED_KEY);
  remove(KNOTS_KEY);
  remove(KNOT_SEEN_KEY);
  remove(KNOT_PEEKED_KEY);
  notifyKnots();
};

/* ───────── 籤譜 ───────── */

/**
 * 讀籤譜；還沒存過就從求籤記錄回填（排除 `excludeId`，也就是正在出的這一局）。
 * 跟記錄分開存：刪記錄不會少收集。
 */
export function getCollection(excludeId?: string): Collection {
  return parseCollection(read<unknown>(COLLECTED_KEY, null)) ?? collectionFrom(listRecords(), excludeId);
}

/**
 * 出籤落定時登記這一支。回傳登記後的籤譜與它是不是新收的；
 * 存不進去（無痕、禁用站點資料）就當不是新的 —— 不然每一支都會蓋「新收」。
 */
export function collectStick(stickNo: number, readingId: string, at: string): { collection: Collection; isNew: boolean } {
  const result = addToCollection(getCollection(readingId), stickNo, at);
  write(COLLECTED_KEY, result.collection);
  const stored = parseCollection(read<unknown>(COLLECTED_KEY, null));
  return stored && stored[stickNo] ? result : { collection: result.collection, isNew: false };
}

/* ───────── 注連繩上的結 ───────── */

export const listKnots = (): Knot[] => parseKnots(read<unknown>(KNOTS_KEY, []));

/** detail.open：這一局的結冒出來之後自己解開一下（隔天回來自動結的那一支） */
function notifyKnots(open?: string): void {
  try {
    window.dispatchEvent(new CustomEvent(KNOTS_EVENT, { detail: { open } }));
  } catch {
    /* 沒有 window（測試環境）就算了 */
  }
}

/** 把一支籤綁上繩。回傳新綁的那一個（給飛上去的動畫找格位）。 */
export function tieStick(stickNo: number, meta: KnotMeta = {}, at: string = new Date().toISOString()): Knot {
  const knots = tieKnot(listKnots(), stickNo, at, meta);
  write(KNOTS_KEY, knots);
  return knots[knots.length - 1];
}

/** 飛上去的紙條到位了：這時候才讓繩上的結出現。給了記錄 id，那個結冒出來後自己解開一下。 */
export const showKnots = (openReadingId?: string): void => notifyKnots(openReadingId);

/** 使用者點開過結了嗎、結為了提示自己解開過了嗎（規則在 shared/knot-hint.ts） */
export const getKnotHint = (): KnotHint =>
  readKnotHint(
    safeGet(browserStorage('localStorage'), KNOT_SEEN_KEY),
    safeGet(browserStorage('localStorage'), KNOT_PEEKED_KEY),
  );

/** 親手點開了一個結：微光與自動解開從此停止 */
export const markKnotSeen = (): void => {
  safeSet(browserStorage('localStorage'), KNOT_SEEN_KEY, '1');
};

/** 結已經為了提示自己解開過一次 */
export const markKnotPeeked = (): void => {
  safeSet(browserStorage('localStorage'), KNOT_PEEKED_KEY, '1');
};

/** 這一局已經綁在繩上了嗎（避免同一支綁兩次） */
export const isTied = (readingId: string): boolean => listKnots().some((knot) => knot.readingId === readingId);

/* ───────── 偏好 ───────── */

const systemReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** 浏览器想要的语言列表。拿不到（很旧的浏览器、测试环境）就当没有偏好。 */
const browserLanguage = (): Language | null => {
  try {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language];
    return languageFromLocales(list.filter(Boolean));
  } catch {
    return null;
  }
};

export function getPrefs(): Prefs {
  const stored = read<Partial<Prefs>>(PREFS_KEY, {});
  return {
    sound: stored.sound ?? true,
    reducedMotion: stored.reducedMotion ?? systemReducedMotion(),
    language: isLanguage(stored.language) ? stored.language : (browserLanguage() ?? 'en'),
  };
}

export const setPrefs = (prefs: Prefs): void => write(PREFS_KEY, prefs);
