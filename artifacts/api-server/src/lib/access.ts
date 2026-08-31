import type { RequestHandler } from 'express';

export type TeamIdentity = { userId: string; orgId: string | null; role: string | null };

export const isAdmin = (identity: TeamIdentity) => identity.role === 'org:admin' || identity.role === 'org:owner';

export function teamAccess(orgId: string): RequestHandler {
  return (_req, res, next) => {
    const identity = res.locals.identity as TeamIdentity | null;
    if (!identity?.userId) { res.status(401).json({ error: 'Sign in to access Tori.' }); return; }
    if (!orgId || identity.orgId !== orgId) { res.status(403).json({ error: 'Membership in the Tori organization is required.' }); return; }
    next();
  };
}

export const adminAccess: RequestHandler = (_req, res, next) => {
  if (!res.locals.identity || !isAdmin(res.locals.identity)) {
    res.status(403).json({ error: 'An organization admin is required for this action.' }); return;
  }
  next();
};

export function mutationOrigin(origin: string): RequestHandler {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    // Authenticated cookies are not sufficient CSRF protection. Fetch mutations must carry
    // the exact application Origin; a missing/null/foreign origin fails closed.
    if (!origin || req.get('origin') !== origin) {
      res.status(403).json({ error: 'This request must originate from the Tori application.' }); return;
    }
    next();
  };
}
