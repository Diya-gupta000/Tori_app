import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, desc, eq } from "drizzle-orm";
import OpenAI from "openai";
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

type Phase =
  | "background research"
  | "project design"
  | "materials and approval"
  | "Research set up"
  | "data collection"
  | "data analysis";

const phaseValues: Phase[] = [
  "background research",
  "project design",
  "materials and approval",
  "Research set up",
  "data collection",
  "data analysis",
];

function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && phaseValues.includes(value as Phase);
}

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
  const existingGroups = await db.select({ id: labGroupsTable.id }).from(labGroupsTable);
  const desiredIds = new Set(seedGroups.map((group) => group.id));
  const hasDesiredRoster =
    existingGroups.length === seedGroups.length &&
    existingGroups.every((group) => desiredIds.has(group.id));

  if (!hasDesiredRoster) {
    await db.delete(snapshotsTable);
    await db.delete(labGroupsTable);
  }

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
): SnapshotPayload {
  return {
    id: snapshot.id,
    weekOf: snapshot.weekOf,
    fileName: snapshot.fileName,
    createdAt: snapshot.createdAt.toISOString(),
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
    .orderBy(desc(snapshotsTable.weekOf));
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
      (group) => group.status !== "On track" && group.status !== "Complete",
    ).length,
    averageProgress,
    progressDelta: averageProgress - previousAverage,
    summary:
      latest?.summary ??
      "Upload your first board photo to turn this week’s work into a shared progress picture.",
    groups,
    trend: snapshots
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

router.post("/groups", async (req, res) => {
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
  res.json(points);
});

router.get("/snapshots", async (_req, res) => {
  await ensureSeedData();
  const snapshots = await db
    .select()
    .from(snapshotsTable)
    .orderBy(desc(snapshotsTable.weekOf));
  res.json(snapshots.map(toSnapshotPayload));
});

router.post("/snapshots/synthesize", async (req, res) => {
  const parsed = SynthesizeSnapshotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A board photo, file name, and week are required." });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "Photo synthesis is not configured yet." });
    return;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a research lab mentor assistant. Read the Kanban board photo carefully. Return only valid JSON with keys summary (string), wins (array of strings), attentionItems (array of strings), and groups (array). Each group must have id (short kebab-case), name, project, students (array), color (teal, violet, amber, or rose), status (On track, Needs attention, Blocked, or Complete), progress (number 0-100), currentFocus, blocker (string or null), phase (one of background research, project design, materials and approval, Research set up, data collection, or data analysis; use null when unclear), summary (a concise sentence or two covering the visible Kanban work), and lastUpdated. Infer group names from the board; if unclear, use Group 1, Group 2. Keep summaries specific and grounded in visible cards. Mention uncertainty in attentionItems rather than inventing facts.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Synthesize this weekly board photo for the week of ${parsed.data.weekOf}. The uploaded file is ${parsed.data.fileName}.`,
            },
            {
              type: "image_url",
              image_url: { url: parsed.data.imageDataUrl },
            },
          ],
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("The model returned no synthesis.");
    const synthesis = JSON.parse(content) as Omit<SnapshotPayload, "id" | "createdAt" | "weekOf" | "fileName">;
    if (
      typeof synthesis.summary !== "string" ||
      !Array.isArray(synthesis.groups) ||
      synthesis.groups.length === 0
    ) {
      throw new Error("The synthesis response was incomplete.");
    }

    const snapshot: SnapshotPayload = {
      id: `snapshot-${Date.now()}`,
      weekOf: parsed.data.weekOf.toISOString().slice(0, 10),
      fileName: parsed.data.fileName,
      createdAt: new Date().toISOString(),
      summary: synthesis.summary,
      wins: synthesis.wins ?? [],
      attentionItems: synthesis.attentionItems ?? [],
      groups: synthesis.groups.map((group, index) => ({
        id: group.id || `group-${index + 1}`,
        name: group.name || `Group ${index + 1}`,
        project: group.project || "",
        students: group.students ?? [],
        color: group.color ?? "teal",
        status: group.status ?? "Needs attention",
        progress: Math.round(Math.max(0, Math.min(100, group.progress ?? 0))),
        currentFocus: group.currentFocus || "",
        blocker: group.blocker ?? null,
        phase: isPhase(group.phase) ? group.phase : null,
        summary: group.summary || null,
        lastUpdated: parsed.data.weekOf.toISOString().slice(0, 10),
      })),
    };

    await db.transaction(async (tx) => {
      await tx.insert(snapshotsTable).values({
        id: snapshot.id,
        weekOf: snapshot.weekOf,
        fileName: snapshot.fileName,
        createdAt: new Date(snapshot.createdAt),
        groups: snapshot.groups,
        summary: snapshot.summary,
        wins: snapshot.wins,
        attentionItems: snapshot.attentionItems,
      });
      for (const group of snapshot.groups) {
        await tx
          .insert(labGroupsTable)
          .values(group)
          .onConflictDoUpdate({
            target: labGroupsTable.id,
            set: {
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
            },
          });
      }
    });
    res.status(201).json(snapshot);
  } catch (error) {
    req.log.error({ err: error }, "Kanban photo synthesis failed");
    res.status(500).json({ error: "We couldn't synthesize that photo. Try a clearer board image." });
  }
});

export default router;