import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, pool, groupStatesTable, labGroupsTable, snapshotsTable } from "@workspace/db";
import { findExistingSynthesis, removeSynthesis, saveSynthesis } from "../src/lib/synthesis-store";
import { board, extracted, roster } from "./fixtures";
import app from "../src/app";

if (!process.env.DATABASE_URL?.includes("tori_synthesis_test_")) throw new Error("Integration tests require a dedicated tori_synthesis_test_ database, never the application database.");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("TEST_ROLLBACK");
const canonicalIds = roster.map((g) => g.id).sort();
async function invariant(tx: Tx) {
  const groups = await tx.select().from(labGroupsTable).orderBy(asc(labGroupsTable.id));
  assert.equal(groups.length, 14);
  assert.deepEqual(groups.map((g) => g.id), canonicalIds);
  for (const group of groups) {
    const canonical = roster.find((g) => g.id === group.id)!;
    assert.equal(group.name, canonical.name);
    assert.deepEqual(group.students, canonical.students);
    assert.equal(group.color, "teal");
  }
}
async function fixture(run: (tx: Tx, save: (input?: Partial<Parameters<typeof saveSynthesis>[0]>) => ReturnType<typeof saveSynthesis>, remove: (id: string) => ReturnType<typeof removeSynthesis>) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await invariant(tx);
      const save = async (input: Partial<Parameters<typeof saveSynthesis>[0]> = {}) => {
        await invariant(tx);
        try { return await saveSynthesis({ weekOf: "2026-08-24", fileName: "test.jpg", imageHash: "a", board: board(), ...input }, tx as unknown as typeof db); }
        finally { await invariant(tx); }
      };
      const remove = async (id: string) => {
        await invariant(tx);
        try { return await removeSynthesis(id, tx as unknown as typeof db); }
        finally { await invariant(tx); }
      };
      await run(tx, save, remove);
      await invariant(tx);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  await invariant(db as unknown as Tx);
}
before(async () => {
  const existing = await db.select().from(labGroupsTable);
  if (!existing.length) await db.insert(labGroupsTable).values(roster.map((group) => ({ ...group, project: "", color: "teal", status: "On track", progress: 0, currentFocus: "", blocker: null, phase: null, summary: null, lastUpdated: "2026-08-24" })));
  await invariant(db as unknown as Tx);
});
after(() => pool.end());

test("bulk routes only canonical matches and persists unmatched tasks", () => fixture(async (tx, save) => {
  const snapshot = await save({ board: board([
    extracted("Erin & Jason", ["Erin", "Jason"]),
    extracted("Kyla, Milena & Zahra", ["Kyla", "Milena", "Zahra"]),
    extracted("Alyssa & Chinthan", ["Alyssa", "Chinthan"]),
    extracted("Andy & Roya", ["Andy", "Roya"]),
    extracted("Unknown", ["Nobody"]),
  ]) });
  assert.equal((snapshot.groups as unknown[]).length, 3);
  assert.equal(snapshot.unmatchedGroups.length, 2);
  assert.equal(snapshot.unmatchedGroups[0].workItems.length, 1);
  assert.equal((await tx.select().from(groupStatesTable)).length, 3);
}));
test("same-image retry is idempotent; different same-week image conflicts", () => fixture(async (tx, save) => {
  const first = await save();
  const retry = await save();
  assert.equal(first.id, retry.id);
  assert.equal((await tx.select().from(snapshotsTable)).length, 1);
  assert.equal((await tx.select().from(groupStatesTable)).length, 1);
  await assert.rejects(() => save({ imageHash: "different" }), /already exists/);
}));
test("unknown-only import creates no groups or state rows", () => fixture(async (tx, save) => {
  const result = await save({ board: board([extracted("Unknown", ["Nobody"])]) });
  assert.equal((result.groups as unknown[]).length, 0);
  assert.equal(result.unmatchedGroups.length, 1);
  assert.equal((await tx.select().from(groupStatesTable)).length, 0);
}));
test("unmatched individual import is also idempotent", () => fixture(async (tx, save) => {
  const input = { targetGroupId: "phoebe-diya", board: board([extracted("Unknown", ["Nobody"])]) };
  const first = await save(input);
  const second = await save(input);
  assert.equal(first.id, second.id);
  assert.equal((await tx.select().from(snapshotsTable)).length, 1);
}));
test("invalid AI response creates no partial records", () => fixture(async (tx, save) => {
  await assert.rejects(() => save({ board: {} as never }));
  assert.equal((await tx.select().from(snapshotsTable)).length, 0);
  assert.equal((await tx.select().from(groupStatesTable)).length, 0);
}));
test("database failure rolls back snapshot and all group updates", () => fixture(async (tx, save) => {
  await tx.execute(sql`CREATE FUNCTION fail_test_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`);
  await tx.execute(sql`CREATE TRIGGER fail_update BEFORE UPDATE ON lab_groups FOR EACH ROW WHEN (NEW.id = 'jason-erin') EXECUTE FUNCTION fail_test_update()`);
  await assert.rejects(() => save({ board: board([extracted(), extracted("Erin & Jason", ["Erin", "Jason"])]) }));
  assert.equal((await tx.select().from(snapshotsTable)).length, 0);
  assert.equal((await tx.select().from(groupStatesTable)).length, 0);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].progress, 0);
}));
test("undo restores every owned field and removes only its history", () => fixture(async (tx, save, remove) => {
  const before = (await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0];
  const snapshot = await save();
  await remove(snapshot.id);
  assert.deepEqual((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0], before);
  assert.equal((await tx.select().from(snapshotsTable)).length, 0);
  assert.equal((await tx.select().from(groupStatesTable)).length, 0);
}));
test("undo preserves a later manual focus edit", () => fixture(async (tx, save, remove) => {
  const snapshot = await save();
  await tx.update(labGroupsTable).set({ currentFocus: "Email mentors and schedule interviews" }).where(eq(labGroupsTable.id, "phoebe-diya"));
  const result = await remove(snapshot.id);
  const [group] = await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya"));
  assert.equal(group.currentFocus, "Email mentors and schedule interviews");
  assert.equal(group.progress, 0);
  assert.equal(group.status, "On track");
  assert.ok(result.preservedEdits[0].fields.includes("currentFocus"));
}));
test("removing older synthesis preserves later synthesis and safely rebases future undo", () => fixture(async (tx, save, remove) => {
  const first = await save();
  const second = await save({ weekOf: "2026-08-31", imageHash: "b", board: board([extracted("Phoebe & Diya", ["Phoebe", "Diya"], "Collect research data")]) });
  await remove(first.id);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].currentFocus, "Collect research data");
  assert.equal((await tx.select().from(snapshotsTable))[0].id, second.id);
  await remove(second.id);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].currentFocus, "");
}));
test("manual edits between two syntheses survive removal of both", () => fixture(async (tx, save, remove) => {
  const first = await save();
  await tx.update(labGroupsTable).set({ currentFocus: "Teacher's plan" }).where(eq(labGroupsTable.id, "phoebe-diya"));
  const second = await save({ weekOf: "2026-08-31", imageHash: "b" });
  await remove(first.id); await remove(second.id);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].currentFocus, "Teacher's plan");
}));
test("three consecutive weeks tolerate wording changes; removing one recalculates status", () => fixture(async (tx, save, remove) => {
  await save();
  const second = await save({ weekOf: "2026-08-31", imageHash: "b", board: board([extracted("Phoebe & Diya", ["Phoebe", "Diya"], "Send emails to E mentors")]) });
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].status, "On track");
  await save({ weekOf: "2026-09-07", imageHash: "c" });
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].status, "Needs attention");
  await remove(second.id);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].status, "On track");
}));
test("seeded snapshots cannot be removed", () => fixture(async (tx, _save, remove) => {
  await tx.insert(snapshotsTable).values({ id: "seed-test", weekOf: "2026-08-17", fileName: "seed.jpg", groups: [], summary: "", wins: [], attentionItems: [] });
  await assert.rejects(() => remove("seed-test"), /Seeded baseline/);
  assert.equal((await tx.select().from(snapshotsTable)).length, 1);
}));
test("undo failure rolls back deletion and restoration", () => fixture(async (tx, save, remove) => {
  const snapshot = await save();
  await tx.execute(sql`CREATE FUNCTION fail_test_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected deletion failure'; END $$`);
  await tx.execute(sql`CREATE TRIGGER fail_delete BEFORE DELETE ON lab_snapshots FOR EACH ROW EXECUTE FUNCTION fail_test_delete()`);
  await assert.rejects(() => remove(snapshot.id));
  assert.equal((await tx.select().from(snapshotsTable)).length, 1);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].progress, 45);
}));

test("individual synthesis uses the same history and cannot overwrite an occupied group-week", () => fixture(async (tx, save, remove) => {
  const snapshot = await save({ targetGroupId: "phoebe-diya" });
  assert.equal(snapshot.source, "group-synthesis");
  await assert.rejects(() => save({ imageHash: "different" }), /already has a synthesis/);
  await remove(snapshot.id);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].progress, 0);
}));
test("a week gap and changed work do not cause stagnation", () => fixture(async (tx, save) => {
  await save();
  await save({ weekOf: "2026-09-07", imageHash: "b" });
  await save({ weekOf: "2026-09-14", imageHash: "c", board: board([extracted("Phoebe & Diya", ["Phoebe", "Diya"], "Collect fruit fly samples")]) });
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].status, "On track");
}));
test("manual status survives continuity recalculation after older removal", () => fixture(async (tx, save, remove) => {
  await save();
  const second = await save({ weekOf: "2026-08-31", imageHash: "b" });
  await save({ weekOf: "2026-09-07", imageHash: "c" });
  await tx.update(labGroupsTable).set({ status: "Blocked" }).where(eq(labGroupsTable.id, "phoebe-diya"));
  await remove(second.id);
  assert.equal((await tx.select().from(labGroupsTable).where(eq(labGroupsTable.id, "phoebe-diya")))[0].status, "Blocked");
}));
test("concurrent identical requests return one snapshot with unchanged canonical IDs", async () => {
  const tx = db as unknown as Tx;
  const guarded = async <T>(operation: () => Promise<T>) => {
    await invariant(tx);
    try { return await operation(); } finally { await invariant(tx); }
  };
  const input = { weekOf: "2026-08-24", fileName: "race.jpg", imageHash: "race", board: board() };
  const results = await Promise.all([guarded(() => saveSynthesis(input)), guarded(() => saveSynthesis(input))]);
  try {
    assert.equal(results[0].id, results[1].id);
    assert.equal((await db.select().from(snapshotsTable)).length, 1);
  } finally { await guarded(() => removeSynthesis(results[0].id)); }
  await invariant(tx);
});
test("HTTP API returns controlled configuration/validation errors and current group metrics", async () => {
  await invariant(db as unknown as Tx);
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  try {
    const response = await fetch(`${base}/snapshots/synthesize`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekOf: "2026-08-24", fileName: "test.jpg", imageDataUrl: "data:image/jpeg;base64,aGVsbG8=" }) });
    assert.equal(response.status, 503);
    assert.match((await response.json() as { error: string }).error, /OPENAI_API_KEY/);
    const invalid = await fetch(`${base}/snapshots/synthesize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(invalid.status, 400);
    const metrics = await (await fetch(`${base}/dashboard`)).json() as { totalGroups: number; onTrack: number; needsAttention: number };
    assert.equal(metrics.totalGroups, 14); assert.equal(metrics.onTrack, 14); assert.equal(metrics.needsAttention, 0);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  } finally {
    if (key !== undefined) process.env.OPENAI_API_KEY = key;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await invariant(db as unknown as Tx);
  }
});

test("HTTP removal refreshes snapshots, groups, and dashboard without changing the roster", async () => {
  const database = db as unknown as Tx;
  const guarded = async <T>(operation: () => Promise<T>) => {
    await invariant(database);
    try { return await operation(); } finally { await invariant(database); }
  };
  const original = await db.select().from(labGroupsTable).orderBy(asc(labGroupsTable.id));
  const snapshot = await guarded(() => saveSynthesis({ weekOf: "2026-08-24", fileName: "http.jpg", imageHash: "http", board: board() }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  try {
    const before = await (await fetch(`${base}/snapshots`)).json() as Array<{ id: string; removable: boolean }>;
    assert.equal(before.find((item) => item.id === snapshot.id)?.removable, true);
    await guarded(async () => {
      const response = await fetch(`${base}/snapshots/${snapshot.id}`, { method: "DELETE" });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { removedSnapshotId: string }).removedSnapshotId, snapshot.id);
    });
    assert.deepEqual(await (await fetch(`${base}/snapshots`)).json(), []);
    const groups = await (await fetch(`${base}/groups`)).json() as Array<{ id: string; progress: number; currentFocus: string }>;
    assert.equal(groups.find((group) => group.id === "phoebe-diya")?.currentFocus, "");
    assert.equal(groups.find((group) => group.id === "phoebe-diya")?.progress, 0);
    const dashboard = await (await fetch(`${base}/dashboard`)).json() as { totalGroups: number; onTrack: number };
    assert.equal(dashboard.totalGroups, 14);
    assert.equal(dashboard.onTrack, 14);
    assert.deepEqual(await db.select().from(labGroupsTable).orderBy(asc(labGroupsTable.id)), original);
  } finally {
    if ((await db.select().from(snapshotsTable).where(eq(snapshotsTable.id, snapshot.id))).length) {
      await guarded(() => removeSynthesis(snapshot.id));
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await invariant(database);
  }
});
