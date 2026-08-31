import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { readConfig, validateStartup } from '../src/lib/config';
import type { TeamIdentity } from '../src/lib/access';

// This suite never queries a database. Startup requires a URL before importing db modules.
process.env.DATABASE_URL ??= 'postgresql://localhost/not_connected';
const { validateImage } = await import('../src/lib/image');
const { activeRequest, abortClaims, withAbort } = await import('../src/lib/in-flight');
const { createApp } = await import('../src/app');
const { pool } = await import('@workspace/db');
after(() => pool.end());
const config = { ...readConfig(), production: true, origin: 'https://tori.example', orgId: 'org_test' };
const member = { userId: 'member', orgId: 'org_test', role: 'org:member' };

async function http(identity: TeamIdentity | null, run: (base: string) => Promise<void>, ready = true) {
  const app = createApp({ config, authenticate: (_req, res, next) => { res.locals.identity = identity; next(); },
    readiness: async () => { if (!ready) throw new Error('secret database detail'); },
    frontendDir: path.join(import.meta.dirname, 'frontend-fixture') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}
test('unauthenticated API returns JSON 401 without redirect or cache', () => http(null, async (base) => {
  const response = await fetch(`${base}/api/groups`, { redirect: 'manual' });
  assert.equal(response.status, 401); assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('content-type')!, /json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}));
test('non-team user receives 403', () => http({ ...member, orgId: 'other' }, async (base) => {
  assert.equal((await fetch(`${base}/api/session`)).status, 403);
}));
test('member can read session and reach synthesis validation, but cannot add or remove', () => http(member, async (base) => {
  const response = await fetch(`${base}/api/session`);
  assert.equal(response.status, 200); assert.equal((await response.json() as { isAdmin: boolean }).isAdmin, false);
  const headers = { Origin: config.origin, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/snapshots/synthesize`, { method: 'POST', headers, body: '{}' })).status, 400);
  assert.equal((await fetch(`${base}/api/groups`, { method: 'POST', headers, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/api/snapshots/test`, { method: 'DELETE', headers })).status, 403);
}));
test('admin reaches canonical group validation', () => http({ ...member, role: 'org:admin' }, async (base) => {
  assert.equal((await (await fetch(`${base}/api/session`)).json() as { isAdmin: boolean }).isAdmin, true);
  assert.equal((await fetch(`${base}/api/groups`, { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
}));
test('production serves SPA, public health and JSON API 404 without CORS', () => http(member, async (base) => {
  const spa = await fetch(`${base}/groups/phoebe-diya`, { headers: { Accept: 'text/html' } });
  assert.equal(spa.status, 200); assert.match(await spa.text(), /Tori test shell/);
  const api = await fetch(`${base}/api/not-a-route`);
  assert.equal(api.status, 404); assert.match(api.headers.get('content-type')!, /json/);
  assert.equal(api.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(`${base}/api/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/readyz`)).status, 200);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
}));
test('failed readiness is sanitized JSON 503', () => http(null, async (base) => {
  const response = await fetch(`${base}/api/readyz`); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret/);
}, false));
test('mutations reject missing, null and foreign Origin', () => http(member, async (base) => {
  for (const origin of [undefined, 'null', 'https://evil.example']) {
    assert.equal((await fetch(`${base}/api/snapshots/synthesize`, { method: 'POST', headers: origin ? { Origin: origin } : {} })).status, 403);
  }
}));
test('malformed and oversized JSON receive safe JSON 400 and 413', () => http(member, async (base) => {
  for (const [body, status] of [['{', 400], [JSON.stringify({ value: 'x'.repeat(24 * 1024 * 1024) }), 413]] as const) {
    const response = await fetch(`${base}/api/snapshots/synthesize`, { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status); assert.match(response.headers.get('content-type')!, /json/);
  }
}));
for (const format of ['jpeg', 'png', 'webp'] as const) {
  test(`${format}: decode succeeds without changing uploaded bytes`, async () => {
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })[format]().toBuffer();
    const result = await validateImage(`data:image/${format};base64,${bytes.toString('base64')}`);
    assert.equal(result.imageHash.length, 64);
  });
}
test('invalid, mislabeled, truncated, HEIC and oversized images are rejected', async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  for (const value of ['data:image/heic;base64,aGVsbG8=', 'data:image/jpeg;base64,aGVsbG8=',
    `data:image/jpeg;base64,${png.toString('base64')}`, `data:image/png;base64,${png.subarray(0, 40).toString('base64')}`,
    `data:image/png;base64,${Buffer.alloc(16 * 1024 * 1024 + 1).toString('base64')}`]) {
    await assert.rejects(() => validateImage(value));
  }
});
test('production refuses incomplete configuration and unsafe origins', () => {
  assert.throws(() => validateStartup({ NODE_ENV: 'production', PORT: '3001', DATABASE_URL: 'postgresql://localhost/test' }), /Missing production/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://tori.example' }), /HTTPS/);
  assert.throws(() => readConfig({ SYNTHESIS_MAX_CONCURRENT: '0' }), /Invalid/);
});
test('cancelled claim aborts provider wait, including an already aborted signal', async () => {
  const active = activeRequest(); active.claim('test');
  const wait = withAbort(new Promise(() => {}), active.controller.signal);
  abortClaims(['test']); await assert.rejects(() => wait, /cancelled/);
  await assert.rejects(() => withAbort(Promise.reject(new Error('aborted provider')), active.controller.signal), /cancelled/);
  active.release();
});
