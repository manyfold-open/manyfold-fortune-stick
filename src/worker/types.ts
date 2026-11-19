/**
 * Worker-side types. `Env` mirrors the bindings and vars declared in wrangler.jsonc —
 * if you add a binding there, add it here too.
 */

import type { NarraGatewayEnv } from '@manyfold/narra-agent-kit/worker';

export interface Env extends NarraGatewayEnv {
  /** Static build output in dist/client. Non-/api/ requests are served from here. */
  ASSETS: Fetcher;
  /** D1 database. The starter uses five tables; the rest is yours. */
  DB: D1Database;
  /** Cloudflare Workers AI binding used by Narra Messenger group-chat triage. */
  AI?: Ai;

  /** Manyfold API base, e.g. https://api.manyfold.ai */
  MANYFOLD_API_BASE_URL?: string;
  /** "production" enables https-only and private-IP checks on agent URLs. */
  ENVIRONMENT?: string;
  /** Optional path prefix the app is also mounted under, e.g. /fortune-stick. */
  BASE_PATH?: string;
  /** Optional: >=32 chars. Without it a key is generated and kept in D1. */
  CONFIG_ENCRYPTION_KEY?: string;
  /** Optional: when set, settings/agent-management routes require x-admin-password. */
  ADMIN_PASSWORD?: string;
  /** Tarot app URL; production defaults to app.manyfold.ai/tarot/. */
  TAROT_HANDOFF_URL?: string;
  /** Comma-separated other Tarot URLs a visitor may be sent back to (e.g. the legacy host). */
  TAROT_RETURN_URLS?: string;
  /** GA4 measurement id (G-…). Unset or malformed means no analytics is served at all. */
  GA_MEASUREMENT_ID?: string;

  /** Narra Messenger gateway runtime flags, bindings, and credentials (disabled by default). */
  NARRA_GATEWAY_ENABLED?: string;
  NARRA_SYNC?: string;
  NARRA_AGENT_ID?: string;
  NARRA_MATRIX_ID?: string;
  NARRA_AGENT_TOKEN?: string;
  NARRA_API_ENDPOINT?: string;
  MATRIX_ACCESS_TOKEN?: string;
  MATRIX_HOMESERVER_URL?: string;
  MATRIX_USER_ID?: string;
  NARRA_SYNC_DO?: DurableObjectNamespace;
  NARRA_ROOM_DO?: DurableObjectNamespace;
  MANYFOLD_A2A_URL?: string;
  MANYFOLD_A2A_TOKEN?: string;
  NARRA_BROADCAST_STAGGER?: string;
  NARRA_AUTHORIZE_EVENTS?: string;
}

/** Everything needed to talk to one agent over A2A. */
export interface AgentCredential {
  rpcUrl: string;
  token: string;
  /** Human-readable agent name, used in error messages. */
  label: string;
}

/** Errors that already know their HTTP shape. Thrown anywhere, mapped in index.ts. */
export class HttpError extends Error {
  // Plain fields rather than constructor parameter properties: keeps the class
  // friendly to any TS toolchain that only strips types.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
