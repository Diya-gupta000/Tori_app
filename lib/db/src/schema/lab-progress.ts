import { jsonb, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pgTable } from "drizzle-orm/pg-core";

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
  groups: jsonb("groups").notNull(),
  summary: text("summary").notNull(),
  wins: text("wins").array().notNull(),
  attentionItems: text("attention_items").array().notNull(),
});

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