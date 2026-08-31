export type AppConfig = {
  production: boolean;
  origin: string;
  orgId: string;
  authConfigured: boolean;
  synthesisTimeoutMs: number;
  maxConcurrent: number;
  userLimit: number;
  teamLimit: number;
};

function positive(env: NodeJS.ProcessEnv, key: string, fallback: number, max: number) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN || (production ? '' : 'http://localhost:5173');
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password ||
      (production ? parsed.protocol !== 'https:' : !['http:', 'https:'].includes(parsed.protocol))) {
      throw new Error('APP_ORIGIN must be an exact origin (HTTPS in production), without a path');
    }
  }
  return {
    production, origin, orgId: env.CLERK_ORG_ID || '',
    authConfigured: Boolean(env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY && env.CLERK_ORG_ID),
    synthesisTimeoutMs: positive(env, 'SYNTHESIS_TIMEOUT_MS', 90_000, 180_000),
    maxConcurrent: positive(env, 'SYNTHESIS_MAX_CONCURRENT', 2, 8),
    userLimit: positive(env, 'SYNTHESIS_USER_LIMIT', 5, 100),
    teamLimit: positive(env, 'SYNTHESIS_TEAM_LIMIT', 20, 500),
  };
}

export function validateStartup(env: NodeJS.ProcessEnv = process.env) {
  const config = readConfig(env);
  positive(env, 'PORT', 0, 65535);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (config.production) {
    const required = ['APP_ORIGIN', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_ORG_ID', 'OPENAI_API_KEY'];
    const missing = required.filter((key) => !env[key]);
    if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
  }
  return config;
}
