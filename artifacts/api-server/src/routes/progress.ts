import { Router, type IRouter, type Request, type Response } from "express";
import { asc, count, desc, eq } from "drizzle-orm";
import { phases, readBoard } from "../lib/board-reader";
import { safeSynthesisError } from "../lib/synthesis-log";
import { normalizeWeek } from "../lib/synthesis";
import { findExistingSynthesis, SynthesisError } from "../lib/synthesis-store";
import { adminAccess } from "../lib/access";
import { validateImage } from '../lib/image';
import { claimImport, completeImport, abandonImport, removeCoordinatedSynthesis } from '../lib/import-coordinator';
import { activeRequest, withAbort } from '../lib/in-flight';
import type { AppConfig } from '../lib/config';
import {
  CreateGroupBody,
  SynthesizeSnapshotBody,
} from "@workspace/api-zod";
import { db, labGroupsTable, snapshotsTable } from "@workspace/db";

const router: IRouter = Router();

type GroupPayload = {
  id: string;
  name: string;
  project: string;
  students: string[];
  color: string;
  status: "On track" | "Needs attention" | "Blocked" | "Complete";
  progress: number;
  currentFocus: string;
  blocker: string | null;
  phase: Phase | null;
  summary: string | null;
  lastUpdated: string;
};

type Phase = typeof phases[number];

type SnapshotPayload = {
  id: string;
  weekOf: string;
  fileName: string;
  createdAt: string;
  groups: GroupPayload[];
  summary: string;
  wins: string[];
  attentionItems: string[];
};

const seedGroups: GroupPayload[] = [
  {
    id: "eliana-maria",
    name: "Eliana & Maria",
    project: "",
    students: ["Eliana", "Maria"],
    color: "teal",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "aria-noa-arna",
    name: "Aria, Noa, & Arna",
    project: "",
    students: ["Aria", "Noa", "Arna"],
    color: "violet",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "jason-k",
    name: "Jason K.",
    project: "",
    students: ["Jason K."],
    color: "amber",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "jason-erin",
    name: "Jason & Erin",
    project: "",
    students: ["Jason", "Erin"],
    color: "rose",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "phoebe-diya",
    name: "Phoebe & Diya",
    project: "",
    students: ["Phoebe", "Diya"],
    color: "teal",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "tessa-nisma",
    name: "Tessa & Nisma",
    project: "",
    students: ["Tessa", "Nisma"],
    color: "violet",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "alyssa-chintan",
    name: "Alyssa & Chintan",
    project: "",
    students: ["Alyssa", "Chintan"],
    color: "amber",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "katelyn-audrey",
    name: "Katelyn & Audrey",
    project: "",
    students: ["Katelyn", "Audrey"],
    color: "rose",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "amanda-david",
    name: "Amanda & David",
    project: "",
    students: ["Amanda", "David"],
    color: "teal",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "sarp-ricky",
    name: "Sarp & Ricky",
    project: "",
    students: ["Sarp", "Ricky"],
    color: "violet",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "jack-andy-roya",
    name: "Jack, Andy, & Roya",
    project: "",
    students: ["Jack", "Andy", "Roya"],
    color: "amber",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "pranav-isaac",
    name: "Pranav & Isaac",
    project: "",
    students: ["Pranav", "Isaac"],
    color: "rose",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "kyla-zahra-milena",
    name: "Kyla, Zahra, & Milena",
    project: "",
    students: ["Kyla", "Zahra", "Milena"],
    color: "teal",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "maya-yaretzi",
    name: "Maya & Yaretzi",
    project: "",
    students: ["Maya", "Yaretzi"],
    color: "violet",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
];

const weekOffset = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() - offset * 7);
  return date.toISOString().slice(0, 10);
};

function snapshotForWeek(weekOf: string): SnapshotPayload {
  const groups = seedGroups.map((group, index) => ({
    ...group,
    progress: group.progress,
    lastUpdated: weekOf,
  }));

  return {
    id: `snapshot-${weekOf}`,
    weekOf,
    fileName: `lab-board-${weekOf}.jpg`,
    createdAt: `${weekOf}T15:30:00.000Z`,
    groups,
    summary: "",
    wins: [],
    attentionItems: [],
  };
}

let seedDataPromise: Promise<void> | null = null;

async function seedDataOnce() {
  if (process.env.NODE_ENV === 'production') return;
  const existingGroups = await db.select({ id: labGroupsTable.id }).from(labGroupsTable);
  // Initialization must never reset a real roster (including manually added groups).
  if (existingGroups.length > 0) return;
  const existingSnapshots = await db.select({ id: snapshotsTable.id }).from(snapshotsTable).limit(1);
  if (existingSnapshots.length) throw new Error("Existing snapshot data requires explicit roster recovery; automatic reseeding was refused.");

  await db.insert(labGroupsTable).values(
    seedGroups.map((group) => ({
      id: group.id,
      name: group.name,
      project: group.project,
      students: group.students,
      color: group.color,
      status: group.status,
      progress: group.progress,
      currentFocus: group.currentFocus,
      blocker: group.blocker,
      phase: group.phase,
      summary: group.summary,
      lastUpdated: group.lastUpdated,
    })),
  ).onConflictDoNothing();

  const [{ value: snapshotCount }] = await db
    .select({ value: count() })
    .from(snapshotsTable);
  if (Number(snapshotCount) > 0) return;

  const snapshots = [0, 7, 14, 21].map((_shift, index) =>
    snapshotForWeek(weekOffset(index)),
  );
  await db.insert(snapshotsTable).values(
    snapshots.map((snapshot) => ({
      id: snapshot.id,
      weekOf: snapshot.weekOf,
      fileName: snapshot.fileName,
      createdAt: new Date(snapshot.createdAt),
      groups: snapshot.groups,
      summary: snapshot.summary,
      wins: snapshot.wins,
      attentionItems: snapshot.attentionItems,
    })),
  );
}

async function ensureSeedData() {
  if (!seedDataPromise) {
    seedDataPromise = seedDataOnce().catch((error) => {
      seedDataPromise = null;
      throw error;
    });
  }
  return seedDataPromise;
}

function toGroupPayload(group: typeof labGroupsTable.$inferSelect): GroupPayload {
  return {
    id: group.id,
    name: group.name,
    project: group.project,
    students: group.students,
    color: group.color,
    status: group.status as GroupPayload["status"],
    progress: group.progress,
    currentFocus: group.currentFocus,
    blocker: group.blocker,
    phase: group.phase as Phase | null,
    summary: group.summary,
    lastUpdated: group.lastUpdated,
  };
}

function toSnapshotPayload(
  snapshot: typeof snapshotsTable.$inferSelect,
) {
  return {
    id: snapshot.id,
    weekOf: snapshot.weekOf,
    fileName: snapshot.fileName,
    createdAt: snapshot.createdAt.toISOString(),
    source: snapshot.source,
    removable: snapshot.source !== "seed",
    unmatchedGroups: snapshot.unmatchedGroups,
    groups: (snapshot.groups as Partial<GroupPayload>[]).map((group) => ({
      id: group.id || "unknown-group",
      name: group.name || "Unnamed group",
      project: group.project || "",
      students: group.students || [],
      color: group.color || "teal",
      status: group.status || "On track",
      progress: group.progress || 0,
      currentFocus: group.currentFocus || "",
      blocker: group.blocker ?? null,
      phase: group.phase ?? null,
      summary: group.summary ?? null,
      lastUpdated: group.lastUpdated || snapshot.weekOf,
      workItems: (group as GroupPayload & { workItems?: unknown[] }).workItems ?? [],
      matchMethod: (group as GroupPayload & { matchMethod?: string }).matchMethod ?? null,
    })),
    summary: snapshot.summary,
    wins: snapshot.wins,
    attentionItems: snapshot.attentionItems,
  };
}

router.get("/dashboard", async (req: Request, res: Response) => {
  await ensureSeedData();
  const groups = (await db.select().from(labGroupsTable)).map(toGroupPayload);
  const snapshots = await db
    .select()
    .from(snapshotsTable)
    .orderBy(desc(snapshotsTable.weekOf), desc(snapshotsTable.createdAt));
  const latest = snapshots[0];
  const averageProgress = Math.round(
    groups.reduce((sum, group) => sum + group.progress, 0) / groups.length,
  );
  const previousAverage = latest
    ? Math.round(
        (latest.groups as GroupPayload[]).reduce(
          (sum, group) => sum + group.progress,
          0,
        ) / groups.length,
      )
    : averageProgress;

  res.json({
    weekOf: latest?.weekOf ?? weekOffset(0),
    totalGroups: groups.length,
    onTrack: groups.filter((group) => group.status === "On track").length,
    needsAttention: groups.filter(
      (group) => group.status === "Needs attention",
    ).length,
    averageProgress,
    progressDelta: averageProgress - previousAverage,
    summary:
      latest?.summary ??
      "Upload your first board photo to turn this week’s work into a shared progress picture.",
    groups,
    trend: snapshots
      // Unmatched-only imports are review records, not percentage observations.
      .filter((snapshot) => (snapshot.groups as unknown[]).length > 0)
      .slice(0, 5)
      .reverse()
      .map((snapshot) => {
        const snapshotGroups = snapshot.groups as GroupPayload[];
        const hasCapturedWork = snapshotGroups.some(
          (group) =>
            group.progress > 0 ||
            Boolean(group.currentFocus) ||
            Boolean(group.summary) ||
            Boolean(group.phase) ||
            Boolean(group.blocker),
        );
        return {
          week: snapshot.weekOf,
          progress: Math.round(
            snapshotGroups.reduce((sum, group) => sum + group.progress, 0) /
              snapshotGroups.length,
          ),
          todo: hasCapturedWork ? snapshotGroups.length * 2 : 0,
          doing: hasCapturedWork ? snapshotGroups.length * 2 + 1 : 0,
          done: hasCapturedWork
            ? snapshotGroups.reduce(
                (sum, group) => sum + Math.round(group.progress / 25),
                0,
              )
            : 0,
        };
      }),
    attentionItems: latest?.attentionItems ?? [],
  });
});

router.get("/groups", async (_req, res) => {
  await ensureSeedData();
  const groups = await db.select().from(labGroupsTable).orderBy(asc(labGroupsTable.name));
  res.json(groups.map(toGroupPayload));
});

router.post("/groups", adminAccess, async (req, res) => {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Group name, project, and students are required." });
    return;
  }
  const group = {
    id: `group-${Date.now()}`,
    name: parsed.data.name,
    project: parsed.data.project,
    students: parsed.data.students,
    color: parsed.data.color ?? "teal",
    status: "On track",
    progress: 0,
    currentFocus: "",
    blocker: null,
    phase: null,
    summary: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  } as const;
  await db.insert(labGroupsTable).values(group);
  res.status(201).json(group);
});

router.post("/groups/:id/synthesize", async (req, res) => {
  await handleSynthesis(req, res, String(req.params.id));
});

router.get("/groups/:id/history", async (req, res) => {
  await ensureSeedData();
  const group = await db
    .select()
    .from(labGroupsTable)
    .where(eq(labGroupsTable.id, req.params.id));
  if (!group[0]) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  const snapshots = await db
    .select()
    .from(snapshotsTable)
    .orderBy(asc(snapshotsTable.weekOf));
  const points = snapshots.map((snapshot) => {
    const snapshotGroup = (snapshot.groups as GroupPayload[]).find(
      (item) => item.id === req.params.id,
    );
    const progress = snapshotGroup?.progress ?? 0;
    const hasCapturedWork = Boolean(
      snapshotGroup &&
        (snapshotGroup.progress > 0 ||
          snapshotGroup.currentFocus ||
          snapshotGroup.summary ||
          snapshotGroup.phase ||
          snapshotGroup.blocker),
    );
    return {
      week: snapshot.weekOf,
      progress,
      todo: hasCapturedWork ? Math.max(0, 8 - Math.round(progress / 15)) : 0,
      doing: hasCapturedWork ? Math.max(1, Math.round(progress / 18)) : 0,
      done: hasCapturedWork ? Math.round(progress / 25) : 0,
    };
  });
  const currentGroup = group[0];
  const latestPoint = points.at(-1);
  if (latestPoint && currentGroup.lastUpdated >= latestPoint.week) {
    const hasCapturedWork = Boolean(
      currentGroup.progress > 0 ||
        currentGroup.currentFocus ||
        currentGroup.summary ||
        currentGroup.phase ||
        currentGroup.blocker,
    );
    points[points.length - 1] = {
      ...latestPoint,
      progress: currentGroup.progress,
      todo: hasCapturedWork ? Math.max(0, 8 - Math.round(currentGroup.progress / 15)) : 0,
      doing: hasCapturedWork ? Math.max(1, Math.round(currentGroup.progress / 18)) : 0,
      done: hasCapturedWork ? Math.round(currentGroup.progress / 25) : 0,
    };
  }
  res.json(points);
});

router.get("/snapshots", async (_req, res) => {
  await ensureSeedData();
  const snapshots = await db
    .select()
    .from(snapshotsTable)
    .orderBy(desc(snapshotsTable.weekOf), desc(snapshotsTable.createdAt));
  res.json(snapshots.map(toSnapshotPayload));
});

async function handleSynthesis(req: Request, res: Response, targetGroupId?: string) {
  const parsed = SynthesizeSnapshotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A board photo, file name, and week are required." });
    return;
  }
  let claimId: string | null = null;
  const active = activeRequest();
  const onClose = () => { if (!res.writableFinished) active.controller.abort(); };
  res.on('close', onClose);
  try {
    const { fileName, imageDataUrl } = parsed.data;
    const weekOf = normalizeWeek(parsed.data.weekOf.toISOString().slice(0, 10));
    active.week(weekOf);
    const { imageHash } = await validateImage(imageDataUrl);
    const existing = await findExistingSynthesis(weekOf, imageHash, targetGroupId);
    if (existing) {
      res.json(toSnapshotPayload(existing));
      return;
    }
    let groupName: string | undefined;
    if (targetGroupId) {
      const [group] = await db.select().from(labGroupsTable).where(eq(labGroupsTable.id, targetGroupId));
      if (!group) throw new SynthesisError(404, "Group not found.");
      groupName = group.name;
    }
    if (!process.env.OPENAI_API_KEY) throw new SynthesisError(503, "Photo synthesis is not configured yet. Set OPENAI_API_KEY on the backend.");
    const config = req.app.locals.config as AppConfig;
    if (active.controller.signal.aborted) throw new SynthesisError(409, 'This upload was cancelled. Explicitly upload again if still wanted.');
    const claim = await claimImport({ weekOf, imageHash, targetGroupId, userId: res.locals.identity.userId }, config);
    if (claim.snapshot) { res.json(toSnapshotPayload(claim.snapshot)); return; }
    claimId = claim.claimId;
    active.claim(claimId);
    const signal = AbortSignal.any([active.controller.signal, AbortSignal.timeout(config.synthesisTimeoutMs)]);
    if (signal.aborted) throw new SynthesisError(409, 'This upload was cancelled before analysis.');
    const reader = req.app.locals.boardReader as typeof readBoard;
    const board = await withAbort(reader(imageDataUrl, weekOf, groupName, signal), signal);
    const snapshot = await completeImport(claimId, { weekOf, fileName, imageHash, board, targetGroupId }, signal);
    if (process.env.NODE_ENV !== "production") {
      req.log.info({ synthesisId: snapshot.id, extracted: board.groups.length,
        groupsUpdated: (snapshot.groups as unknown[]).length, groupsCreated: 0,
        unmatched: snapshot.unmatchedGroups.map((group) => group.label),
        matches: (snapshot.groups as Array<Record<string, unknown>>).map((group) => ({
          id: group.id, method: group.matchMethod, confidence: group.matchConfidence,
          status: group.status, statusReason: group.statusReason, stage: group.phase,
        })),
      }, "Board synthesis saved");
    }
    res.status(201).json(toSnapshotPayload(snapshot));
  } catch (error) {
    if (claimId) await abandonImport(claimId).catch((failure) => req.log.error(safeSynthesisError(failure), 'Could not release import claim; lease will expire'));
    if (error instanceof SynthesisError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    // Do not serialize SDK errors: they may contain request headers or image data.
    req.log.error(safeSynthesisError(error), "Board synthesis failed");
    res.status(500).json({ error: "The board could not be saved. No partial changes were kept. Please retry or use a clearer photo." });
  } finally {
    res.off('close', onClose);
    active.release();
  }
}

router.post("/snapshots/synthesize", async (req, res) => {
  await handleSynthesis(req, res);
});

router.delete("/snapshots/:id", adminAccess, async (req, res) => {
  try {
    const result = await removeCoordinatedSynthesis(String(req.params.id), res.locals.identity.userId);
    req.log.info({ synthesisId: result.removedSnapshotId, groupsRestored: result.restoredGroupIds.length,
      preservedEdits: result.preservedEdits }, "Synthesis removed");
    res.json(result);
  } catch (error) {
    if (error instanceof SynthesisError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error(safeSynthesisError(error), "Synthesis removal failed");
    res.status(500).json({ error: "Could not remove the synthesis. No partial changes were kept." });
  }
});

export default router;
