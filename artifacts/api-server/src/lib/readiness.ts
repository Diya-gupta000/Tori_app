import { pool } from '@workspace/db';

export async function databaseReady() {
  await pool.query(`SELECT 1 FROM lab_groups LIMIT 1`);
  await pool.query(`SELECT 1 FROM lab_snapshots LIMIT 1`);
  await pool.query(`SELECT 1 FROM lab_group_states LIMIT 1`);
  await pool.query(`SELECT 1 FROM lab_synthesis_requests LIMIT 1`);
  await pool.query(`SELECT 1 FROM lab_synthesis_audit LIMIT 1`);
}
