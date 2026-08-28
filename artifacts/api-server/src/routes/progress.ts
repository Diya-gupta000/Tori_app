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
  lastUpdated: string;
};

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
    id: "moss",
    name: "Moss Group",
    project: "Soil microbiome mapping",
    students: ["Ari", "Noah", "Priya"],
    color: "teal",
    status: "On track",
    progress: 72,
    currentFocus: "Running the final soil sample batch",
    blocker: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "orbit",
    name: "Orbit Group",
    project: "Low-cost satellite imaging",
    students: ["Maya", "Lucas", "Eli"],
    color: "violet",
    status: "Needs attention",
    progress: 48,
    currentFocus: "Calibrating the image sensor",
    blocker: "Waiting on a replacement lens",
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "current",
    name: "Current Group",
    project: "Water quality sensor",
    students: ["Sam", "Zoe", "Theo"],
    color: "amber",
    status: "On track",
    progress: 64,
    currentFocus: "Comparing sensor drift across trials",
    blocker: null,
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  {
    id: "nightjar",
    name: "Nightjar Group",
    project: "Urban soundscape classifier",
    students: ["June", "Kai", "Nia"],
    color: "rose",
    status: "Blocked",
    progress: 31,
    currentFocus: "Cleaning the first annotated dataset",
    blocker: "Need more labeled recordings from the field",
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
];

const weekOffset = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() - offset * 7);
  return date.toISOString().slice(0, 10);
};

function snapshotForWeek(weekOf: string, progressShift: number): SnapshotPayload {
  const groups = seedGroups.map((group, index) => ({
    ...group,
    progress: Math.max(12, Math.min(96, group.progress - progressShift + index * 2)),
    lastUpdated: weekOf,
  }));

  return {
    id: `snapshot-${weekOf}`,
    weekOf,
    fileName: `lab-board-${weekOf}.jpg`,
    createdAt: `${weekOf}T15:30:00.000Z`,
    groups,
    summary:
      progressShift === 0
        ? "The lab is moving from exploration into validation. Most groups are building steadily, with one dependency worth clearing before the next work session."
        : "This week showed steady movement across the lab as groups narrowed their questions and turned observations into testable next steps.",
    wins:
      progressShift === 0
        ? ["Three groups moved at least one card into Done", "Moss Group has a clean path to final sampling"]
        : ["All groups added new work to Doing", "Two groups clarified their next experiment"],
    attentionItems:
      progressShift === 0
        ? ["Orbit Group is waiting on a replacement lens", "Nightjar Group needs more labeled field recordings"]
        : ["Check that each group has a testable next step"],
  };
}

async function ensureSeedData() {
  const [{ value: groupCount }] = await db
    .select({ value: count() })
    .from(labGroupsTable);
  if (Number(groupCount) > 0) return;

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
      lastUpdated: group.lastUpdated,
    })),
  );

  const snapshots = [0, 7, 14, 21].map((shift, index) =>
    snapshotForWeek(weekOffset(index), shift),
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
    groups: snapshot.groups as GroupPayload[],
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
        return {
          week: snapshot.weekOf,
          progress: Math.round(
            snapshotGroups.reduce((sum, group) => sum + group.progress, 0) /
              snapshotGroups.length,
          ),
          todo: snapshotGroups.length * 2,
          doing: snapshotGroups.length * 2 + 1,
          done: snapshotGroups.reduce(
            (sum, group) => sum + Math.round(group.progress / 25),
            0,
          ),
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
    currentFocus: "Add the first work item",
    blocker: null,
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
    return {
      week: snapshot.weekOf,
      progress,
      todo: Math.max(0, 8 - Math.round(progress / 15)),
      doing: Math.max(1, Math.round(progress / 18)),
      done: Math.round(progress / 25),
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
            "You are a research lab mentor assistant. Read the Kanban board photo carefully. Return only valid JSON with keys summary (string), wins (array of strings), attentionItems (array of strings), and groups (array). Each group must have id (short kebab-case), name, project, students (array), color (teal, violet, amber, or rose), status (On track, Needs attention, Blocked, or Complete), progress (number 0-100), currentFocus, blocker (string or null), and lastUpdated. Infer group names from the board; if unclear, use Group 1, Group 2. Keep summaries specific and grounded in visible cards. Mention uncertainty in attentionItems rather than inventing facts.",
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
        project: group.project || "Research project",
        students: group.students ?? [],
        color: group.color ?? "teal",
        status: group.status ?? "Needs attention",
        progress: Math.round(Math.max(0, Math.min(100, group.progress ?? 0))),
        currentFocus: group.currentFocus || "Review the next card on the board",
        blocker: group.blocker ?? null,
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