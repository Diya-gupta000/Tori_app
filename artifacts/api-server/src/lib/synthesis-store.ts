import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, groupStatesTable, labGroupsTable, snapshotsTable } from "@workspace/db";
import type { LabGroup, StoredGroupState, StoredUnmatchedGroup, GroupState } from "@workspace/db";
import type { BoardRead } from "./board-reader";
import { validateBoard } from "./board-reader";
import { deriveStatus, hasThreeWeekTaskContinuity, matchExtractedGroup, normalizeWeek } from "./synthesis";

export class SynthesisError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Mutable fields only. Canonical name, members, color, and ID cannot enter an UPDATE.
export const ownedFields = ["project", "status", "progress", "currentFocus", "blocker", "phase", "summary", "lastUpdated"] as const;
export function stateOf(group: LabGroup): StoredGroupState {
  return { project: group.project, status: group.status, progress: group.progress, currentFocus: group.currentFocus,
    blocker: group.blocker, phase: group.phase, summary: group.summary, lastUpdated: group.lastUpdated, workItems: [] };
}
export function groupUpdate(state: StoredGroupState) {
  return Object.fromEntries(ownedFields.map((key) => [key, state[key]])) as Omit<StoredGroupState, "workItems">;
}

/** Compare-and-restore: a different current value belongs to a later edit, not this synthesis. */
export function restoreOwnedFields(current: StoredGroupState, after: StoredGroupState, before: StoredGroupState) {
  const result = { ...current };
  const preserved: string[] = [];
  for (const key of ownedFields) {
    if (current[key] === after[key]) Object.assign(result, { [key]: before[key] });
    else preserved.push(key);
  }
  return { state: result, preserved };
}

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const sameIds = (left: { id: string }[], right: { id: string }[]) =>
  JSON.stringify(left.map((g) => g.id).sort()) === JSON.stringify(right.map((g) => g.id).sort());
const offsetWeek = (week: string, days: number) => {
  const date = new Date(`${week}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
function stagnantFor(week: string, tasks: StoredGroupState["workItems"], history: GroupState[]) {
  const previous = history.find((row) => row.weekOf === offsetWeek(week, -7));
  const older = history.find((row) => row.weekOf === offsetWeek(week, -14));
  return hasThreeWeekTaskContinuity(tasks, previous?.state.workItems ?? [], older?.state.workItems ?? []);
}

async function lockRoster(tx: Transaction) {
  // Serializes ingestion, undo, and explicit group creation for a consistent roster invariant.
  await tx.execute(sql`LOCK TABLE lab_groups IN SHARE ROW EXCLUSIVE MODE`);
  return tx.select().from(labGroupsTable).orderBy(asc(labGroupsTable.id));
}
async function assertRoster(tx: Transaction, original: LabGroup[]) {
  const remaining = await tx.select().from(labGroupsTable).orderBy(asc(labGroupsTable.id));
  if (!sameIds(original, remaining) || original.some((before, index) => {
    const after = remaining[index];
    return before.name !== after.name || before.color !== after.color || JSON.stringify(before.students) !== JSON.stringify(after.students);
  })) throw new Error("Synthesis changed canonical group identity; transaction rolled back.");
}

export async function findExistingSynthesis(weekOf: string, imageHash: string, targetGroupId?: string, database: Database = db) {
  weekOf = normalizeWeek(weekOf);
  if (targetGroupId) {
    const [direct] = await database.select().from(snapshotsTable).where(and(
      eq(snapshotsTable.weekOf, weekOf), eq(snapshotsTable.targetGroupId, targetGroupId),
      eq(snapshotsTable.source, "group-synthesis"),
    ));
    if (direct) {
      if (direct.imageHash === imageHash) return direct;
      throw new SynthesisError(409, "This group already has a synthesis for that week. Review or remove it in Snapshots first.");
    }
    const [state] = await database.select().from(groupStatesTable)
      .where(and(eq(groupStatesTable.groupId, targetGroupId), eq(groupStatesTable.weekOf, weekOf)));
    if (!state?.snapshotId) return undefined;
    const [snapshot] = await database.select().from(snapshotsTable).where(eq(snapshotsTable.id, state.snapshotId));
    if (snapshot.imageHash === imageHash) return snapshot;
    throw new SynthesisError(409, "This group already has a synthesis for that week. Review or remove it in Snapshots before uploading a different photo.");
  }
  const [snapshot] = await database.select().from(snapshotsTable)
    .where(and(eq(snapshotsTable.weekOf, weekOf), eq(snapshotsTable.source, "synthesis")));
  if (!snapshot) return undefined;
  if (snapshot.imageHash === imageHash) return snapshot;
  throw new SynthesisError(409, "A board synthesis already exists for that week. Review or remove it in Snapshots before uploading a different photo.");
}

export async function saveSynthesis(input: {
  weekOf: string; fileName: string; imageHash: string; board: BoardRead; targetGroupId?: string;
}, database: Database = db) {
  input = { ...input, weekOf: normalizeWeek(input.weekOf) };
  const board = validateBoard(input.board);
  return database.transaction(async (tx) => {
    const roster = await lockRoster(tx);
    const duplicate = await findExistingSynthesis(input.weekOf, input.imageHash, input.targetGroupId, tx as unknown as Database);
    if (duplicate) return duplicate;
    const target = input.targetGroupId ? roster.find((group) => group.id === input.targetGroupId) : undefined;
    if (input.targetGroupId && !target) throw new SynthesisError(404, "Group not found.");
    const id = `snapshot-${randomUUID()}`;
    const matched: Array<{ group: LabGroup; extracted: BoardRead["groups"][number]; method: string; confidence: number }> = [];
    const unmatched: StoredUnmatchedGroup[] = [];
    const seen = new Set<string>();
    for (const extracted of board.groups) {
      const match = matchExtractedGroup(extracted, target ? [target] : roster);
      if (!match.matched || seen.has(match.group.id)) {
        unmatched.push({ label: extracted.name || "Unreadable group", students: extracted.students,
          workItems: extracted.workItems, reason: match.matched ? "Multiple board labels matched the same group; this extra result needs review." : match.reason,
          suggestedGroupId: match.matched ? match.group.id : match.suggestedGroupId });
        continue;
      }
      seen.add(match.group.id);
      matched.push({ group: roster.find((group) => group.id === match.group.id)!, extracted, method: match.method, confidence: match.confidence });
    }
    const snapshotGroups: Array<LabGroup & { workItems: StoredGroupState["workItems"]; matchMethod: string; matchConfidence: number; statusReason: string }> = [];
    const states: typeof groupStatesTable.$inferInsert[] = [];
    for (const { group, extracted, method, confidence } of matched) {
      const history = await tx.select().from(groupStatesTable).where(eq(groupStatesTable.groupId, group.id))
        .orderBy(asc(groupStatesTable.weekOf), asc(groupStatesTable.createdAt));
      if (history.some((row) => row.weekOf === input.weekOf)) {
        throw new SynthesisError(409, `${group.name} already has a synthesis for that week. Remove it first; no groups were updated.`);
      }
      // Backdated imports require recomputing later evidence; fail explicitly rather than overwrite newer work.
      if (history.some((row) => row.weekOf > input.weekOf)) {
        throw new SynthesisError(409, `${group.name} has a newer synthesis. Remove newer syntheses before importing an older week.`);
      }
      const tasks = extracted.workItems.length ? extracted.workItems : extracted.currentFocus.trim() ? [{ title: extracted.currentFocus, details: null }] : [];
      const derived = deriveStatus(extracted.statusEvidence, stagnantFor(input.weekOf, tasks, history));
      const state: StoredGroupState = { project: extracted.project, status: derived.status,
        progress: Math.round(Math.max(0, Math.min(100, extracted.progress ?? 0))),
        currentFocus: extracted.currentFocus, blocker: extracted.blocker, phase: extracted.phase,
        summary: extracted.summary, lastUpdated: input.weekOf, workItems: tasks };
      const before = stateOf(group);
      before.workItems = history.at(-1)?.state.workItems ?? [];
      states.push({ id: randomUUID(), synthesisId: id, snapshotId: id, groupId: group.id,
        kind: target ? "group-synthesis" : "bulk-synthesis", weekOf: input.weekOf, state, beforeState: before,
        evidence: extracted.statusEvidence, matchMethod: method, matchConfidence: confidence, statusReason: derived.reason });
      snapshotGroups.push({ ...group, ...groupUpdate(state), workItems: extracted.workItems,
        matchMethod: method, matchConfidence: confidence, statusReason: derived.reason });
    }
    const [snapshot] = await tx.insert(snapshotsTable).values({ id, weekOf: input.weekOf, fileName: input.fileName,
      source: target ? "group-synthesis" : "synthesis", imageHash: input.imageHash, groups: snapshotGroups,
      targetGroupId: target?.id ?? null,
      unmatchedGroups: unmatched, summary: board.summary, wins: board.wins, attentionItems: board.attentionItems }).returning();
    for (const state of states) {
      await tx.insert(groupStatesTable).values(state);
      await tx.update(labGroupsTable).set(groupUpdate(state.state)).where(eq(labGroupsTable.id, state.groupId));
    }
    await assertRoster(tx, roster);
    return snapshot;
  });
}

export async function removeSynthesis(snapshotId: string, database: Database = db) {
  return database.transaction(async (tx) => {
    const roster = await lockRoster(tx);
    const [snapshot] = await tx.select().from(snapshotsTable).where(eq(snapshotsTable.id, snapshotId));
    if (!snapshot) throw new SynthesisError(404, "Synthesis not found.");
    if (!["synthesis", "group-synthesis"].includes(snapshot.source)) throw new SynthesisError(409, "Seeded baseline snapshots cannot be removed as syntheses.");
    const removed = await tx.select().from(groupStatesTable).where(eq(groupStatesTable.snapshotId, snapshotId));
    const preservedEdits: Array<{ groupId: string; fields: string[] }> = [];
    for (const entry of removed) {
      const current = roster.find((group) => group.id === entry.groupId)!;
      const later = (await tx.select().from(groupStatesTable).where(eq(groupStatesTable.groupId, entry.groupId))
        .orderBy(asc(groupStatesTable.weekOf))).filter((row) => row.weekOf > entry.weekOf);
      if (later.length) {
        // Splice this state out of the undo chain without erasing an intervening manual edit.
        const next = later[0];
        const rebased = restoreOwnedFields(next.beforeState, entry.state, entry.beforeState);
        await tx.update(groupStatesTable).set({ beforeState: rebased.state }).where(eq(groupStatesTable.id, next.id));
      } else {
        const restored = restoreOwnedFields(stateOf(current), entry.state, entry.beforeState);
        await tx.update(labGroupsTable).set(groupUpdate(restored.state)).where(eq(labGroupsTable.id, current.id));
        if (restored.preserved.length) preservedEdits.push({ groupId: current.id, fields: restored.preserved });
      }
    }
    await tx.delete(snapshotsTable).where(eq(snapshotsTable.id, snapshotId));
    // Re-derive later continuity-based statuses after removing a historical week. Never overwrite a manual status.
    for (const entry of removed) {
      const history = await tx.select().from(groupStatesTable).where(eq(groupStatesTable.groupId, entry.groupId))
        .orderBy(asc(groupStatesTable.weekOf));
      for (let index = 0; index < history.length; index += 1) {
        const row = history[index];
        if (row.weekOf <= entry.weekOf) continue;
        const derived = deriveStatus(row.evidence, stagnantFor(row.weekOf, row.state.workItems, history.slice(0, index)));
        const oldStatus = row.state.status;
        if (oldStatus === derived.status) continue;
        row.state = { ...row.state, status: derived.status };
        await tx.update(groupStatesTable).set({ state: row.state, statusReason: derived.reason }).where(eq(groupStatesTable.id, row.id));
        const next = history[index + 1];
        if (next && next.beforeState.status === oldStatus) {
          next.beforeState = { ...next.beforeState, status: derived.status };
          await tx.update(groupStatesTable).set({ beforeState: next.beforeState }).where(eq(groupStatesTable.id, next.id));
        }
        if (!next) await tx.update(labGroupsTable).set({ status: derived.status })
          .where(and(eq(labGroupsTable.id, row.groupId), eq(labGroupsTable.status, oldStatus)));
        if (row.snapshotId) {
          const [parent] = await tx.select().from(snapshotsTable).where(eq(snapshotsTable.id, row.snapshotId));
          const groups = (parent.groups as Array<Record<string, unknown>>).map((group) => group.id === row.groupId ? { ...group, status: derived.status, statusReason: derived.reason } : group);
          await tx.update(snapshotsTable).set({ groups }).where(eq(snapshotsTable.id, row.snapshotId));
        }
      }
    }
    await assertRoster(tx, roster);
    return { removedSnapshotId: snapshotId, restoredGroupIds: removed.map((row) => row.groupId), preservedEdits };
  });
}
