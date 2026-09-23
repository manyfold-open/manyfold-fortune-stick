/**
 * Types shared between the Worker (src/worker) and the browser app (src/app).
 * Everything here is part of the JSON API surface, so keep it serializable
 * and free of runtime imports from either side.
 */

import type { Language } from './lang';
import type { FortuneStick } from './sticks';

/* ───────── Manyfold connect (settings page) ───────── */

/** A Manyfold agent the user authorized, as exposed to the browser (never the token). */
export interface ConnectedAgent {
  agentId: string;
  name: string;
  description: string;
  rpcUrl: string;
  expiresAt: string | null;
  /** Did the non-billing auth probe succeed at connect / last verify time? */
  verified: boolean;
  warning: string | null;
  connectedAt: string;
}

/** An in-flight Manyfold authorization handshake, as exposed to the browser. */
export interface ConnectSession {
  connectId: string;
  /** Shown to the user to compare against Manyfold's consent page (anti-phishing). */
  userCode: string;
  authUrl: string;
  expiresAt: string;
}

export type PollStatus = 'pending' | 'denied' | 'expired' | 'approved';

export interface PollOutcome {
  status: PollStatus;
  agents?: ConnectedAgent[];
  failed?: { name: string; error: string }[];
}

/** Bootstrap payload: everything the SPA needs to render its first frame. */
export interface AppState {
  service: string;
  /** Is ADMIN_PASSWORD set on the deployment? */
  adminRequired: boolean;
  /** Did this request carry a valid x-admin-password header (or none is needed)? */
  adminOk: boolean;
  connect: { session: ConnectSession | null };
  agents: ConnectedAgent[];
  /** Can a reading be interpreted right now? False when no agent is connected. */
  interpreterReady: boolean;
}

/* ───────── 问一签 ───────── */

/**
 * The four-part reading the AI produces. Field order is the display order
 * (see the product spec, step 4).
 */
export interface Interpretation {
  /** 一句话签意 */
  meaning: string;
  /** 回应你的问题（80–150 字） */
  answer: string;
  /** 值得留意 */
  notice: string;
  /** 可以做的一件小事 */
  action: string;
  /**
   * 'ai'      — personalised, generated from the user's question
   * 'fallback'— the stick's pre-written text, shown because generation failed
   */
  source: 'ai' | 'fallback';
  /**
   * 这份解读当初是用哪种语言写的。界面语言可以换，这一段不会重写，
   * 所以把它记在 JSON 里（blob 没有 schema，这一列是免费的），
   * 即使将来 detectLanguage 的规则调整了，旧记录上的标注也还是准的。
   */
  language: Language;
}

export type ReadingStatus = 'drawn' | 'interpreted' | 'failed';

/**
 * One complete 求签: the question, the stick that was drawn (fixed at shake time,
 * never re-rolled) and the interpretation once it exists.
 */
export interface Reading {
  id: string;
  question: string;
  stick: FortuneStick;
  status: ReadingStatus;
  interpretation: Interpretation | null;
  /** Why the last interpretation attempt failed, if it did — a code, localised in the browser. */
  error: string | null;
  /**
   * 这一局的语言。由 question 推导，不落库 —— 见 src/shared/lang.ts。
   * 签纸、解读和追问都用它；界面语言换了也不会动它。
   */
  language: Language;
  createdAt: string;
}

/** One turn of 继续追问. */
export interface FollowUpMessage {
  id: number;
  role: 'user' | 'agent';
  content: string;
  status: 'complete' | 'error';
  error: string | null;
  createdAt: string;
}

/**
 * Events the Worker streams to the browser during a 追问 turn (SSE `data:` payloads).
 * `text` always carries the FULL accumulated reply — the client replaces, never appends,
 * so A2A artifact append/lastChunk semantics stay entirely server-side.
 */
export type FollowUpEvent =
  | { type: 'status'; state: string }
  | { type: 'text'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

export interface ApiErrorBody {
  error: { code: string; message: string };
}
