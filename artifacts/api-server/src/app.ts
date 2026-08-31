import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import path from 'node:path';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { clerkClient } from '@clerk/express';
import router from './routes';
import { logger } from './lib/logger';
import { readConfig, type AppConfig } from './lib/config';
import { teamAccess, mutationOrigin, isAdmin } from './lib/access';
import { databaseReady } from './lib/readiness';
import { safeSynthesisError } from './lib/synthesis-log';
import { readBoard } from './lib/board-reader';

// In-process dependency injection for tests, never an HTTP/env authentication bypass.
export function createApp(options: {
  config?: AppConfig;
  authenticate?: RequestHandler;
  readiness?: () => Promise<void>;
  frontendDir?: string;
  boardReader?: typeof readBoard;
} = {}) {
  const config = options.config ?? readConfig();
  const app = express();
  app.disable('x-powered-by');
  app.locals.config = config;
  app.locals.boardReader = options.boardReader ?? readBoard;
  app.use(pinoHttp({ logger, serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  } }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.get('/api/healthz', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/readyz', async (req, res) => {
    try { await (options.readiness ?? databaseReady)(); res.json({ status: 'ready' }); }
    catch (error) { req.log.warn(safeSynthesisError(error), 'Database not ready'); res.status(503).json({ error: 'Database not ready.' }); }
  });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!config.production) app.use('/api', cors({ origin: config.origin, credentials: true }));
  if (options.authenticate) app.use('/api', options.authenticate);
  else if (config.authConfigured) {
    app.use('/api', async (req, res, next) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      // Verify with Clerk, but never forward Clerk's document-handshake redirects to an API caller.
      const state = await clerkClient.authenticateRequest(new Request(`${config.origin}${req.originalUrl}`, { headers }), {
        authorizedParties: [config.origin], acceptsToken: 'session_token',
      });
      const auth = state.toAuth();
      res.locals.identity = auth?.userId ? { userId: auth.userId, orgId: auth.orgId ?? null, role: auth.orgRole ?? null } : null;
      next();
    });
  } else app.use('/api', (_req, res) => { res.status(503).json({ error: 'Team authentication is not configured.' }); });
  app.use('/api', teamAccess(config.orgId), mutationOrigin(config.origin));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/session', (_req, res) => {
    const identity = res.locals.identity;
    res.json({ userId: identity.userId, orgId: identity.orgId, isAdmin: isAdmin(identity) });
  });
  app.use('/api', express.json({ limit: '24mb' }), router);
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.' }); });
  if (config.production || options.frontendDir) {
    const frontendDir = path.resolve(options.frontendDir ?? path.join(import.meta.dirname, '../../lab-progress-board/dist/public'));
    app.use(express.static(frontendDir, { index: false, dotfiles: 'deny', setHeaders: (res, file) => {
      res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    } }));
    app.get('/{*route}', (req, res, next) => {
      if (req.path.includes('.') || !req.accepts('html')) { next(); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }
  app.use((_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    const status = error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : error?.status === 401 ? 401 : 500;
    req.log.error(safeSynthesisError(error), 'Request failed');
    res.status(status).json({ error: status === 413 ? 'Request exceeds the 24 MB limit.' : status === 400 ? 'Malformed JSON request.' : status === 401 ? 'Sign in to access Tori.' : 'Request failed.' });
  };
  app.use(errors);
  return app;
}

export default createApp();
