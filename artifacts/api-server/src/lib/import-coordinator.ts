import { randomUUID } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, snapshotsTable, synthesisRequestsTable, synthesisAuditTable } from '@workspace/db';
import { findExistingSynthesis, saveSynthesis, removeSynthesis, SynthesisError } from './synthesis-store';
import type { AppConfig } from './config';
import { abortClaims, abortWeek } from './in-flight';

type Database = typeof db;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type ImportInput = Parameters<typeof saveSynthesis>[0];
export type ClaimInput = Pick<ImportInput, 'weekOf' | 'imageHash' | 'targetGroupId'> & { userId: string };

async function lock(tx: Tx) {
  // Same lock and ordering as save/undo. No network calls occur inside this transaction.
  await tx.execute(sql`LOCK TABLE lab_groups IN SHARE ROW EXCLUSIVE MODE`);
  const result = await tx.execute<{ now: Date }>(sql`SELECT clock_timestamp() AS now`);
  return new Date(result.rows[0].now);
}

export async function claimImport(input: ClaimInput, config: AppConfig, database: Database = db) {
  return database.transaction(async (tx) => {
    const now = await lock(tx);
    await tx.update(synthesisRequestsTable).set({ status: 'expired' }).where(and(
      eq(synthesisRequestsTable.status, 'running'), sql`${synthesisRequestsTable.leaseUntil} <= ${now}`,
    ));
    const existing = await findExistingSynthesis(input.weekOf, input.imageHash, input.targetGroupId, tx as unknown as Database);
    if (existing) return { snapshot: existing, claimId: null };
    const scope = input.targetGroupId ? `group:${input.targetGroupId}` : 'board';
    const recent = await tx.select().from(synthesisRequestsTable).where(gte(synthesisRequestsTable.createdAt, new Date(now.getTime() - 15 * 60_000)));
    const running = await tx.select().from(synthesisRequestsTable).where(eq(synthesisRequestsTable.status, 'running'));
    const duplicate = running.find((row) => row.scope === scope && row.weekOf === input.weekOf);
    if (duplicate) throw new SynthesisError(409, duplicate.imageHash === input.imageHash
      ? 'This image is already being synthesized for that week. Wait for it to finish, then retry.'
      : 'A different image is already being synthesized for that week.');
    if (recent.length >= config.teamLimit || recent.filter((row) => row.userId === input.userId).length >= config.userLimit) {
      throw new SynthesisError(429, 'Synthesis usage limit reached. Try again in 15 minutes.');
    }
    if (running.length >= config.maxConcurrent) throw new SynthesisError(429, 'The team is already processing photos. Please try again shortly.');
    const claimId = randomUUID();
    await tx.insert(synthesisRequestsTable).values({ id: claimId, scope, weekOf: input.weekOf,
      imageHash: input.imageHash, userId: input.userId, status: 'running', createdAt: now,
      leaseUntil: new Date(now.getTime() + config.synthesisTimeoutMs + 15_000) });
    return { claimId, snapshot: null };
  });
}

export async function completeImport(claimId: string, input: ImportInput, signal?: AbortSignal, database: Database = db) {
  return database.transaction(async (tx) => {
    const now = await lock(tx);
    const [claim] = await tx.select().from(synthesisRequestsTable).where(eq(synthesisRequestsTable.id, claimId));
    if (!claim || claim.status !== 'running' || claim.leaseUntil <= now || signal?.aborted ||
      claim.weekOf !== input.weekOf || claim.imageHash !== input.imageHash || claim.scope !== (input.targetGroupId ? `group:${input.targetGroupId}` : 'board')) {
      throw new SynthesisError(409, 'This import expired or was cancelled. It was not saved; explicitly upload again if still wanted.');
    }
    const snapshot = await saveSynthesis(input, tx as unknown as Database);
    if (signal?.aborted) throw new SynthesisError(409, 'The import was cancelled before saving.');
    await tx.update(synthesisRequestsTable).set({ status: 'completed', snapshotId: snapshot.id }).where(eq(synthesisRequestsTable.id, claimId));
    await tx.insert(synthesisAuditTable).values({ id: randomUUID(), snapshotId: snapshot.id, userId: claim.userId, action: 'created' });
    return snapshot;
  });
}

export async function abandonImport(claimId: string, database: Database = db) {
  await database.update(synthesisRequestsTable).set({ status: 'failed' })
    .where(and(eq(synthesisRequestsTable.id, claimId), eq(synthesisRequestsTable.status, 'running')));
}

export async function removeCoordinatedSynthesis(snapshotId: string, userId: string, database: Database = db) {
  const removed = await database.transaction(async (tx) => {
    await lock(tx);
    const [snapshot] = await tx.select().from(snapshotsTable).where(eq(snapshotsTable.id, snapshotId));
    const result = await removeSynthesis(snapshotId, tx as unknown as Database);
    // Fence every in-flight import for this week, including group/bulk overlap. An explicit
    // future upload gets a new claim; a delayed response cannot reuse the old claim.
    const cancelled = await tx.update(synthesisRequestsTable).set({ status: 'cancelled' }).where(and(
      eq(synthesisRequestsTable.weekOf, snapshot.weekOf), eq(synthesisRequestsTable.status, 'running'),
    )).returning({ id: synthesisRequestsTable.id });
    await tx.update(synthesisRequestsTable).set({ status: 'cancelled' }).where(eq(synthesisRequestsTable.snapshotId, snapshotId));
    await tx.insert(synthesisAuditTable).values({ id: randomUUID(), snapshotId, userId, action: 'removed' });
    return { result, ids: cancelled.map((row) => row.id), weekOf: snapshot.weekOf };
  });
  abortClaims(removed.ids);
  abortWeek(removed.weekOf);
  return removed.result;
}
