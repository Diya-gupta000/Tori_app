import { existsSync } from 'node:fs';
import path from 'node:path';
import { validateStartup } from './lib/config';
import { logger } from './lib/logger';

const config = validateStartup();
if (config.production && !existsSync(path.join(import.meta.dirname, '../../lab-progress-board/dist/public/index.html'))) {
  throw new Error('Built frontend is missing. Build both applications before starting.');
}
const { default: app } = await import('./app');
const { pool } = await import('@workspace/db');
const { databaseReady } = await import('./lib/readiness');
const { abortActiveRequests } = await import('./lib/in-flight');
try { await databaseReady(); }
catch { logger.error('Database unavailable or migrations missing; refusing startup'); await pool.end(); process.exit(1); }
const port = Number(process.env.PORT);
const server = app.listen(port, '0.0.0.0', () => logger.info({ port }, 'Server listening'));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info('Shutting down');
  abortActiveRequests();
  const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 15_000);
  deadline.unref();
  server.close(async () => {
    try { await pool.end(); clearTimeout(deadline); process.exitCode = 0; }
    catch { logger.error('Database shutdown failed'); process.exitCode = 1; }
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
