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

import type { Language } from '../shared/lang';
import type { Interpretation, Reading } from '../shared/types';

const RECORDS_KEY = 'wenyiqian.records';
const CURRENT_KEY = 'wenyiqian.current';
const PREFS_KEY = 'wenyiqian.prefs';
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
   * 界面语言。所有人进来都是简体中文 —— 不猜浏览器语言：这个游戏的默认读者
   * 是中文读者，猜错一次的代价比多按一下右上角的开关大。
   *
   * 注意这只管界面。签纸和解读的语言由问题本身决定（src/shared/lang.ts），
   * 改这个值不会动到任何一张已经印出来的签。
   */
  language: Language;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存不下就算了，不影响这一局 */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
}

/* ───────── 当前这一支签 ───────── */

export const getCurrentReadingId = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
};

export const setCurrentReadingId = (id: string | null): void => {
  if (id) {
    try {
      localStorage.setItem(CURRENT_KEY, id);
    } catch {
      /* 同上 */
    }
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

/* ───────── 偏好 ───────── */

const systemReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function getPrefs(): Prefs {
  const stored = read<Partial<Prefs>>(PREFS_KEY, {});
  return {
    sound: stored.sound ?? true,
    reducedMotion: stored.reducedMotion ?? systemReducedMotion(),
    language: stored.language === 'en' ? 'en' : 'zh',
  };
}

export const setPrefs = (prefs: Prefs): void => write(PREFS_KEY, prefs);
