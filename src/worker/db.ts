/**
 * D1 access: the schema and the settings key/value store.
 *
 * The schema lives here as a string and is applied on the first request rather than
 * through migrations, because the "Deploy to Cloudflare" button provisions the database
 * but never runs a migration command — and because `npm run dev` should work with no
 * setup at all. Every statement is idempotent, so applying it repeatedly is free.
 *
 * This module deliberately imports nothing from crypto.ts: crypto.ts reads its key
 * material from `settings` through here, and one direction keeps that simple.
 */

import type { Env } from './types';

export const now = (): string => new Date().toISOString();

/* ───────── schema ───────── */

/**
 * Database schema. Add your own tables here — they are created on the next request.
 * Keep semicolons out of statement bodies: the splitter below treats every semicolon
 * as a statement boundary.
 */
const SCHEMA = `
-- Generic key/value store. The starter keeps its generated encryption key here;
-- the rest of the namespace is yours.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One in-flight Manyfold authorization handshake. device_code_* is the only thing that
-- can redeem agent tokens, so it is stored encrypted and never leaves the server; the
-- browser only ever sees the row id.
CREATE TABLE IF NOT EXISTS connect_sessions (
  id             TEXT PRIMARY KEY,
  request_id     TEXT NOT NULL,
  user_code      TEXT NOT NULL,
  auth_url       TEXT NOT NULL,
  device_code_ct TEXT NOT NULL,
  device_code_iv TEXT NOT NULL,
  status         TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL
);

-- Agents the user authorized. token_* is AES-GCM encrypted and never returned by the API.
CREATE TABLE IF NOT EXISTS agents (
  agent_id     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  rpc_url      TEXT NOT NULL,
  card_url     TEXT,
  token_ct     TEXT NOT NULL,
  token_iv     TEXT NOT NULL,
  expires_at   TEXT,
  verified     INTEGER NOT NULL DEFAULT 0,
  warning      TEXT,
  connected_at TEXT NOT NULL
);

-- 一次求签。抽中的签在摇签完成时写进这里，之后永不改动：刷新页面、解签失败或
-- 追问，都从这一行读回同一支签。interpretation 是解签结果的 JSON。
CREATE TABLE IF NOT EXISTS readings (
  id             TEXT PRIMARY KEY,
  question       TEXT NOT NULL,
  stick_no       INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'drawn',
  interpretation TEXT,
  error          TEXT,
  context_id     TEXT,
  active_task_id TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_readings_created ON readings (created_at);

-- 「继续追问」的对话，挂在一次求签下面。追问不会重新抽签，所以这里没有签号。
CREATE TABLE IF NOT EXISTS reading_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  reading_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'complete',
  error      TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reading_messages ON reading_messages (reading_id, id);

-- A Tarot reward claim for a finished reading: a random code handed to Tarot in
-- the link, which Tarot's Worker looks up here (over a service binding) before
-- it grants anything. One code per reading, so drawing it twice cannot mint two.
-- day is the Taipei calendar day the claim is good for.
CREATE TABLE IF NOT EXISTS tarot_claims (
  id         TEXT PRIMARY KEY,
  reading_id TEXT NOT NULL UNIQUE,
  day        TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

/**
 * Split SQL into statements: drop `--` comments first, then split on ';'.
 * Comments go first because they are allowed to contain punctuation that would
 * otherwise split a statement in half. Statement bodies are not.
 */
export function schemaStatements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

let initialized: Promise<void> | null = null;

/** Idempotent; runs at most once per isolate, and retries on the next request if it fails. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!initialized) {
    initialized = db
      .batch(schemaStatements(SCHEMA).map((statement) => db.prepare(statement)))
      .then(() => undefined)
      .catch((error) => {
        initialized = null;
        throw error;
      });
  }
  return initialized;
}

/* ───────── settings ───────── */

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value, now())
    .run();
}

/** Writes only if the key is unset. Used for the generated encryption key, where
 *  concurrent first requests must converge on a single winner. */
export async function setSettingIfAbsent(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .bind(key, value, now())
    .run();
}
