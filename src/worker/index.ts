/**
 * The Worker: a Hono app under /api, static assets for everything else.
 *
 * Route map (all responses JSON unless noted):
 *   GET    /api/health                       open   deploy-verification contract
 *   GET    /api/state                        open   bootstrap: game status + admin flags (settings data when authorized)
 *   POST   /api/readings                     open   摇签完成 → 抽一支签并落库
 *   GET    /api/readings/:id                 open   刷新页面后恢复同一支签
 *   POST   /api/readings/:id/interpret       open   解签（失败落回通用解释，可重试）
 *   DELETE /api/readings/:id                 open   删除一条求签记录
 *   GET    /api/readings/:id/messages        open   追问历史
 *   POST   /api/readings/:id/follow-up       open   一轮追问 (text/event-stream)
 *   POST   /api/connect                      admin  start a Manyfold handshake
 *   POST   /api/connect/:id/poll             admin  poll it (2s cadence from the browser)
 *   DELETE /api/connect/:id                  admin  cancel it
 *   GET    /api/agents                       admin  connected agents (never tokens)
 *   POST   /api/agents/:agentId/verify       admin  re-run the non-billing auth probe
 *   DELETE /api/agents/:agentId              admin  disconnect
 *
 * "admin" routes require the x-admin-password header when the ADMIN_PASSWORD
 * secret is set. The game stays public; the password only protects the settings
 * operations that connect, verify and disconnect the deployment's agents.
 */

import { Hono } from 'hono';
import type { AppState } from '../shared/types';
import { isSettingsApiPath } from './auth';
import { HttpError, type Env } from './types';
import { ensureSchema } from './db';
import { withShareMeta } from './meta';
import { claimTarotBonus, findTarotClaim, tarotReturnUrl } from './tarot-bridge';
import { ConfigError, safeEqual } from './crypto';
import { A2AError } from './a2a';
import {
  cancelConnect,
  disconnectAgent,
  getConnectSession,
  listConnectedAgents,
  pollConnect,
  startConnect,
  verifyAgent,
} from './connect';
import {
  createReading,
  deleteReading,
  getReading,
  handleFollowUp,
  interpretReading,
  interpreterReady,
  listFollowUps,
} from './fortune';

const SERVICE = 'wenyiqian';

const app = new Hono<{ Bindings: Env }>();

/* ───────── middleware ───────── */

app.use('/api/*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// Same-origin check on every mutation: browsers always send Origin on cross-site
// POSTs, so this shuts down CSRF without cookies or tokens.
app.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (!origin) {
      throw new HttpError(403, 'origin_required', 'Mutation requests must include a same-origin Origin header.');
    }
    if (origin !== new URL(c.req.url).origin) {
      throw new HttpError(403, 'invalid_origin', 'Cross-origin requests are not allowed.');
    }
  }
  await next();
});

const adminPassword = (env: Env): string | null => {
  const value = (env.ADMIN_PASSWORD ?? '').trim();
  return value.length > 0 ? value : null;
};

const adminHeaderOk = (c: { env: Env; req: { header: (name: string) => string | undefined } }): boolean => {
  const required = adminPassword(c.env);
  if (!required) return true;
  return safeEqual(c.req.header('x-admin-password') ?? '', required);
};

// The game is public. Only the agent-management API behind /settings is gated,
// so visitors can play while the deployment owner keeps the Manyfold connection private.
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (isSettingsApiPath(path) && !adminHeaderOk(c)) {
    throw new HttpError(401, 'admin_password_invalid', 'This deployment requires the admin password.');
  }
  await next();
});

/* ───────── error mapping ───────── */

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status as 400);
  }
  if (error instanceof ConfigError) {
    return c.json({ error: { code: 'misconfigured', message: error.message } }, 400);
  }
  if (error instanceof A2AError) {
    return error.retryable
      ? c.json({ error: { code: 'manyfold_unavailable', message: error.message } }, 502)
      : c.json({ error: { code: 'manyfold_rejected', message: error.message } }, 400);
  }
  console.error('unhandled', error);
  return c.json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500);
});

/* ───────── routes ───────── */

app.get('/api/health', (c) =>
  c.json({ status: 'ok', service: SERVICE, time: new Date().toISOString() }),
);

app.get('/api/state', async (c) => {
  const adminOk = adminHeaderOk(c);
  const [session, agents] = adminOk
    ? await Promise.all([getConnectSession(c.env), listConnectedAgents(c.env)])
    : [null, []];
  const state: AppState = {
    service: SERVICE,
    adminRequired: adminPassword(c.env) !== null,
    adminOk,
    connect: { session },
    agents,
    interpreterReady: await interpreterReady(c.env),
  };
  return c.json(state);
});

/* ───────── 求签 ───────── */

app.post('/api/readings', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { question?: unknown } | null;
  const reading = await createReading(c.env, body?.question);
  return c.json({ reading }, 201);
});

app.post('/api/readings/:id/tarot-claim', async (c) => {
  const reading = await getReading(c.env, c.req.param('id'));
  if (!reading.interpretation) {
    throw new HttpError(409, 'reading_not_complete', 'Finish reading this stick before opening Tarot.');
  }
  const body = (await c.req.json().catch(() => null)) as { returnUrl?: unknown } | null;
  // token is null when the reading is too old to earn today's reward; the
  // browser still opens Tarot, just without a claim Tarot would refuse.
  return c.json({
    token: await claimTarotBonus(c.env, reading),
    tarotUrl: tarotReturnUrl(c.env, body?.returnUrl),
  });
});

// Tarot's Worker asks here (over its service binding) before granting a reward.
// The answer is only the day a code is good for; a code is 32 random bytes, so
// this tells a guesser nothing, and it never names the reading behind it.
app.get('/api/tarot-claims/:id', async (c) => {
  const claim = await findTarotClaim(c.env, c.req.param('id'));
  if (!claim) throw new HttpError(404, 'claim_not_found', 'No such Tarot claim.');
  return c.json({ claim: { day: claim.day } });
});

app.get('/api/readings/:id', async (c) => c.json({ reading: await getReading(c.env, c.req.param('id')) }));

app.post('/api/readings/:id/interpret', async (c) =>
  c.json({ reading: await interpretReading(c.env, c.req.param('id')) }),
);

app.delete('/api/readings/:id', async (c) => {
  await deleteReading(c.env, c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/api/readings/:id/messages', async (c) =>
  c.json({ messages: await listFollowUps(c.env, c.req.param('id')) }),
);

app.post('/api/readings/:id/follow-up', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { message?: unknown } | null;
  if (!body || typeof body.message !== 'string') {
    throw new HttpError(400, 'bad_request', 'Body must be JSON with a string "message".');
  }
  return handleFollowUp({
    env: c.env,
    readingId: c.req.param('id'),
    message: body.message,
    waitUntil: (promise) => c.executionCtx.waitUntil(promise),
  });
});

/* ───────── Manyfold connect (settings) ───────── */

app.post('/api/connect', async (c) => {
  const session = await startConnect(c.env, c.req.url);
  return c.json({ connect: session }, 201);
});

app.post('/api/connect/:connectId/poll', async (c) => {
  const outcome = await pollConnect(c.env, c.req.param('connectId'));
  return c.json(outcome);
});

app.delete('/api/connect/:connectId', async (c) => {
  await cancelConnect(c.env, c.req.param('connectId'));
  return c.json({ ok: true });
});

app.get('/api/agents', async (c) => c.json({ agents: await listConnectedAgents(c.env) }));

app.post('/api/agents/:agentId/verify', async (c) =>
  c.json({ agent: await verifyAgent(c.env, c.req.param('agentId')) }),
);

app.delete('/api/agents/:agentId', async (c) => {
  await disconnectAgent(c.env, c.req.param('agentId'));
  return c.json({ ok: true });
});

app.all('/api/*', () => {
  throw new HttpError(404, 'not_found', 'No such API route.');
});

// Anything else that reaches the Worker is a static asset (or the SPA fallback).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

/* ───────── mount path ───────── */

// The same deployment answers at the root of its workers.dev URL and under
// BASE_PATH on a shared host (app.manyfold.ai/fortune-stick). Requests under
// BASE_PATH are served as if they had arrived at the root; root-relative
// redirects coming back out get the prefix put back on.
const mountPath = (env: Env): string => (env.BASE_PATH ?? '').trim().replace(/\/+$/, '');

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const base = mountPath(env);
    const url = new URL(request.url);
    if (!base || (url.pathname !== base && !url.pathname.startsWith(`${base}/`))) {
      return withShareMeta(await app.fetch(request, env, ctx), url, '');
    }
    // The page loads its assets relative to itself, so the mount root needs its slash.
    if (url.pathname === base) {
      url.pathname = `${base}/`;
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(base.length);
    const response = withShareMeta(
      await app.fetch(new Request(url.toString(), request), env, ctx),
      new URL(request.url),
      base,
    );
    const location = response.headers.get('location');
    if (!location?.startsWith('/') || location.startsWith('//')) return response;
    const redirected = new Response(response.body, response);
    redirected.headers.set('location', base + location);
    return redirected;
  },
} satisfies ExportedHandler<Env>;
