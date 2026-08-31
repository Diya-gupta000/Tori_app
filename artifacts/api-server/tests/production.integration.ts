import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { asc, eq } from 'drizzle-orm';
import { db, pool, labGroupsTable, snapshotsTable, synthesisRequestsTable, synthesisAuditTable } from '@workspace/db';
import { claimImport, completeImport, removeCoordinatedSynthesis, abandonImport } from '../src/lib/import-coordinator';
import { readConfig } from '../src/lib/config';
import { createApp } from '../src/app';
import { board, roster } from './fixtures';
import sharp from 'sharp';
import { activeRequest } from '../src/lib/in-flight';

if (!process.env.DATABASE_URL?.includes('tori_synthesis_test_')) throw new Error('Dedicated test database required');
// Never exercise request-triggered development seeds in this production suite.
process.env.NODE_ENV = 'production';
const config = { ...readConfig({}), production: true, orgId: 'org_test', origin: 'https://tori.example', userLimit: 100, teamLimit: 500 };
type Database = typeof db;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const rollback = new Error('TEST_ROLLBACK');
const input = { weekOf: '2026-08-24', fileName: 'test.jpg', imageHash: 'production', board: board() };
async function invariant(database: Database = db) {
  const groups = await database.select().from(labGroupsTable).orderBy(asc(labGroupsTable.id));
  assert.equal(groups.length, 14);
  assert.deepEqual(groups.map((g) => ({ id: g.id, name: g.name, students: g.students, color: g.color })),
    roster.map((g) => ({ ...g, color: 'teal' })).sort((a, b) => a.id.localeCompare(b.id)));
}
async function guarded<T>(database: Database, operation: () => Promise<T>) {
  await invariant(database);
  try { return await operation(); } finally { await invariant(database); }
}
async function fixture(run: (database: Database, tx: Tx) => Promise<void>) {
  try { await db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    await invariant(database); await run(database, tx); await invariant(database); throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  await invariant();
}
before(async () => {
  if (!(await db.select().from(labGroupsTable)).length) await db.insert(labGroupsTable).values(roster.map((g) => ({ ...g, project: '', color: 'teal', status: 'On track', progress: 0, currentFocus: '', lastUpdated: '2026-08-24' })));
  await invariant();
});
after(() => pool.end());
const claim = (database: Database, extra: Partial<Parameters<typeof claimImport>[0]> = {}, limits = config) =>
  guarded(database, () => claimImport({ ...input, userId: 'member', ...extra }, limits, database));
const complete = (database: Database, id: string, extra: Partial<typeof input> = {}, signal?: AbortSignal) =>
  guarded(database, () => completeImport(id, { ...input, ...extra }, signal, database));
const remove = (database: Database, id: string) => guarded(database, () => removeCoordinatedSynthesis(id, 'admin', database));

test('simultaneous claims allow exactly one worker; another image for the week conflicts', async () => {
  const results = await Promise.allSettled([claim(db), claim(db)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = results.find((r) => r.status === 'fulfilled')! as PromiseFulfilledResult<Awaited<ReturnType<typeof claim>>>;
  try { await assert.rejects(() => claim(db, { imageHash: 'other' }), /different image/); }
  finally { await abandonImport(winner.value.claimId!); }
  await invariant();
});
test('expired claims can be replaced and late completions cannot save', () => fixture(async (database, tx) => {
  const first = await claim(database);
  await tx.update(synthesisRequestsTable).set({ leaseUntil: new Date(0) }).where(eq(synthesisRequestsTable.id, first.claimId!));
  const second = await claim(database);
  assert.notEqual(first.claimId, second.claimId);
  await assert.rejects(() => complete(database, first.claimId!), /expired/);
  assert.equal((await tx.select().from(snapshotsTable)).length, 0);
}));
test('completion is idempotent on retry and records actor audit', () => fixture(async (database, tx) => {
  const first = await claim(database);
  const saved = await complete(database, first.claimId!);
  const retry = await claim(database);
  assert.equal(retry.claimId, null); assert.equal(retry.snapshot?.id, saved.id);
  assert.equal((await tx.select().from(snapshotsTable)).length, 1);
  assert.equal((await tx.select().from(synthesisAuditTable).where(eq(synthesisAuditTable.snapshotId, saved.id)))[0].userId, 'member');
  await assert.rejects(() => claim(database, { imageHash: 'new' }), /already exists/);
}));
test('removal fences delayed overlapping imports and preserves later manual edits', () => fixture(async (database, tx) => {
  const first = await claim(database);
  const saved = await complete(database, first.claimId!);
  const validating = activeRequest(); validating.week(input.weekOf);
  // A group-scoped request could have started before removal of the bulk snapshot.
  const delayedId = 'delayed-import';
  await tx.insert(synthesisRequestsTable).values({ id: delayedId, scope: 'group:phoebe-diya', weekOf: input.weekOf,
    imageHash: 'delayed', userId: 'other', status: 'running', leaseUntil: new Date(Date.now() + 60_000) });
  await tx.update(labGroupsTable).set({ currentFocus: 'Teacher edits after synthesis' }).where(eq(labGroupsTable.id, 'phoebe-diya'));
  await remove(database, saved.id);
  assert.equal(validating.controller.signal.aborted, true); validating.release();
  await guarded(database, () => assert.rejects(() => completeImport(delayedId, { ...input, imageHash: 'delayed', targetGroupId: 'phoebe-diya' }, undefined, database), /cancelled/));
  assert.equal((await tx.select().from(snapshotsTable)).length, 0);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, 'phoebe-diya')))[0].currentFocus, 'Teacher edits after synthesis');
}));
test('seeded snapshot removal is rejected transactionally', () => fixture(async (database, tx) => {
  await tx.insert(snapshotsTable).values({ id: 'production-seed', weekOf: '2026-08-17', fileName: 'seed.jpg', groups: [], summary: '', wins: [], attentionItems: [] });
  await assert.rejects(() => remove(database, 'production-seed'), /Seeded baseline/);
  assert.equal((await tx.select().from(snapshotsTable)).length, 1);
}));
test('invalid model output and aborted completion leave no partial snapshot', () => fixture(async (database, tx) => {
  const first = await claim(database);
  await assert.rejects(() => complete(database, first.claimId!, { board: {} as never }));
  await assert.rejects(() => complete(database, first.claimId!, {}, AbortSignal.abort()), /cancelled/);
  assert.equal((await tx.select().from(snapshotsTable)).length, 0);
  assert.equal((await tx.select().from(synthesisRequestsTable).where(eq(synthesisRequestsTable.id, first.claimId!)))[0].status, 'running');
}));
test('per-user/team limits and concurrency cap reject excess claims', () => fixture(async (database) => {
  await claim(database);
  await assert.rejects(() => claim(database, { weekOf: '2026-08-31' }, { ...config, maxConcurrent: 1 }), /already processing/);
  await assert.rejects(() => claim(database, { weekOf: '2026-08-31' }, { ...config, userLimit: 1 }), /usage limit/);
  await assert.rejects(() => claim(database, { weekOf: '2026-08-31', userId: 'different' }, { ...config, teamLimit: 1 }), /usage limit/);
}));
test('HTTP duplicate uploads call the reader once; member saves, admin removes, roster is unchanged', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-placeholder-never-sent';
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let calls = 0;
  const app = createApp({ config, authenticate: (req, res, next) => {
    res.locals.identity = { userId: 'http-member', orgId: config.orgId, role: req.headers['x-test-admin'] ? 'org:admin' : 'org:member' }; next();
  }, boardReader: async () => { calls++; entered(); await blocked; return board(); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  const headers = { Origin: config.origin, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ ...input, imageDataUrl: `data:image/png;base64,${bytes.toString('base64')}` });
  let snapshotId: string | undefined;
  try {
    await invariant();
    const pending = fetch(`${base}/snapshots/synthesize`, { method: 'POST', headers, body });
    await started;
    await invariant();
    const duplicate = await guarded(db, () => fetch(`${base}/snapshots/synthesize`, { method: 'POST', headers, body }));
    assert.equal(duplicate.status, 409);
    release();
    const response = await pending; assert.equal(response.status, 201); await invariant();
    snapshotId = (await response.json() as { id: string }).id;
    const retry = await guarded(db, () => fetch(`${base}/snapshots/synthesize`, { method: 'POST', headers, body }));
    assert.equal(retry.status, 200); assert.equal(calls, 1);
    assert.equal((await guarded(db, () => fetch(`${base}/snapshots/${snapshotId}`, { method: 'DELETE', headers }))).status, 403);
    assert.equal((await guarded(db, () => fetch(`${base}/snapshots/${snapshotId}`, { method: 'DELETE', headers: { ...headers, 'x-test-admin': 'yes' } }))).status, 200);
  } finally {
    release();
    if (snapshotId && (await db.select().from(snapshotsTable).where(eq(snapshotsTable.id, snapshotId))).length) await remove(db, snapshotId);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    await invariant();
  }
});

for (const mode of ['timeout', 'disconnect'] as const) {
  test(`HTTP ${mode} aborts analysis and releases the claim without saving`, async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-placeholder-never-sent';
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let providerSignal: AbortSignal | undefined;
    const app = createApp({ config: { ...config, synthesisTimeoutMs: 50 },
      authenticate: (_req, res, next) => { res.locals.identity = { userId: `http-${mode}`, orgId: config.orgId, role: 'org:member' }; next(); },
      boardReader: async (_image, _week, _group, signal) => { providerSignal = signal; started(); return new Promise(() => {}); } });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).jpeg().toBuffer();
    const controller = new AbortController();
    try {
      await invariant();
      const pending = fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/snapshots/synthesize`, {
        method: 'POST', signal: controller.signal, headers: { Origin: config.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekOf: '2026-10-05', fileName: 'test.jpg', imageDataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` }),
      });
      await entered;
      if (mode === 'disconnect') { controller.abort(); await assert.rejects(() => pending); }
      else assert.equal((await pending).status, 504);
      let status: string | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        const rows = await db.select().from(synthesisRequestsTable).where(eq(synthesisRequestsTable.userId, `http-${mode}`));
        status = rows.at(-1)?.status;
        if (status === 'failed' && providerSignal?.aborted) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(status, 'failed'); assert.equal(providerSignal?.aborted, true);
      assert.equal((await db.select().from(snapshotsTable)).length, 0);
    } finally {
      await invariant();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    }
  });
}
