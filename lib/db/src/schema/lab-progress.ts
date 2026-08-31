import { sql } from "drizzle-orm";
import { jsonb, integer, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pgTable } from "drizzle-orm/pg-core";

export type StoredWorkItem = {
  title: string;
  details: string | null;
};

export type StoredGroupState = {
  project: string;
  status: string;
  progress: number;
  currentFocus: string;
  blocker: string | null;
  phase: string | null;
  summary: string | null;
  lastUpdated: string;
  workItems: StoredWorkItem[];
};

export type StoredUnmatchedGroup = {
  label: string;
  students: string[];
  workItems: StoredWorkItem[];
  reason: string;
  suggestedGroupId: string | null;
};

export const labGroupsTable = pgTable("lab_groups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  project: text("project").notNull(),
  students: text("students").array().notNull(),
  color: varchar("color", { length: 32 }).notNull().default("teal"),
  status: varchar("status", { length: 32 }).notNull().default("On track"),
  progress: integer("progress").notNull().default(0),
  currentFocus: text("current_focus").notNull().default(""),
  blocker: text("blocker"),
  phase: varchar("phase", { length: 64 }),
  summary: text("summary"),
  lastUpdated: varchar("last_updated", { length: 10 }).notNull(),
});

export const snapshotsTable = pgTable("lab_snapshots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  weekOf: varchar("week_of", { length: 10 }).notNull(),
  fileName: text("file_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  source: varchar("source", { length: 32 }).notNull().default("seed"),
  imageHash: varchar("image_hash", { length: 64 }),
  targetGroupId: varchar("target_group_id", { length: 64 }).references(() => labGroupsTable.id),
  groups: jsonb("groups").notNull(),
  unmatchedGroups: jsonb("unmatched_groups").$type<StoredUnmatchedGroup[]>().notNull().default([]),
  summary: text("summary").notNull(),
  wins: text("wins").array().notNull(),
  attentionItems: text("attention_items").array().notNull(),
}, (table) => [
  uniqueIndex("lab_snapshots_one_synthesis_per_week")
    .on(table.weekOf)
    .where(sql`${table.source} = 'synthesis'`),
  uniqueIndex("lab_snapshots_one_group_synthesis_per_week")
    .on(table.weekOf, table.targetGroupId)
    .where(sql`${table.source} = 'group-synthesis'`),
]);

export const groupStatesTable = pgTable("lab_group_states", {
  id: varchar("id", { length: 96 }).primaryKey(),
  synthesisId: varchar("synthesis_id", { length: 64 }).notNull(),
  snapshotId: varchar("snapshot_id", { length: 64 }).references(() => snapshotsTable.id, {
    onDelete: "cascade",
  }),
  groupId: varchar("group_id", { length: 64 }).notNull().references(() => labGroupsTable.id, {
    onDelete: "cascade",
  }),
  kind: varchar("kind", { length: 32 }).notNull(),
  weekOf: varchar("week_of", { length: 10 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  state: jsonb("state").$type<StoredGroupState>().notNull(),
  beforeState: jsonb("before_state").$type<StoredGroupState>().notNull(),
  evidence: jsonb("evidence").$type<{ blocked: boolean; needsAttention: boolean; complete: boolean; reason: string | null }>().notNull(),
  matchMethod: varchar("match_method", { length: 64 }),
  matchConfidence: integer("match_confidence"),
  statusReason: text("status_reason"),
}, (table) => [
  uniqueIndex("lab_group_states_synthesis_group_unique")
    .on(table.synthesisId, table.groupId),
  uniqueIndex("lab_group_states_group_week_unique").on(table.groupId, table.weekOf),
]);

export const insertLabGroupSchema = createInsertSchema(labGroupsTable).omit({
  id: true,
});
export const insertSnapshotSchema = createInsertSchema(snapshotsTable).omit({
  id: true,
  createdAt: true,
});

export type LabGroup = typeof labGroupsTable.$inferSelect;
export type InsertLabGroup = z.infer<typeof insertLabGroupSchema>;
export type Snapshot = typeof snapshotsTable.$inferSelect;
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type GroupState = typeof groupStatesTable.$inferSelect;
