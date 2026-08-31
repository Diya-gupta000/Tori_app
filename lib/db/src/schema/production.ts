import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
// Durable fencing tokens: no image bytes, no credentials. Completed/cancelled rows survive undo.
export const synthesisRequestsTable = pgTable('lab_synthesis_requests', {
  id: varchar('id', { length: 64 }).primaryKey(),
  scope: text('scope').notNull(),
  weekOf: varchar('week_of', { length: 10 }).notNull(),
  imageHash: varchar('image_hash', { length: 64 }).notNull(),
  userId: text('user_id').notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }).notNull(),
  snapshotId: varchar('snapshot_id', { length: 64 }),
}, (table) => [
  uniqueIndex('lab_synthesis_requests_running_scope_week').on(table.scope, table.weekOf)
    .where(sql`${table.status} = 'running'`),
]);

export const synthesisAuditTable = pgTable('lab_synthesis_audit', {
  id: varchar('id', { length: 64 }).primaryKey(),
  snapshotId: varchar('snapshot_id', { length: 64 }).notNull(),
  userId: text('user_id').notNull(),
  action: varchar('action', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
