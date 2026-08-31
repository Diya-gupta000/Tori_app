import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { clearProtectedCache, accountCacheKey } from '../src/lib/session-cache';

test('account, session, organization and role changes each replace the protected cache key', () => {
  const initial = accountCacheKey('user', 'session', 'org', 'org:admin');
  for (const next of [accountCacheKey('other', 'session', 'org', 'org:admin'),
    accountCacheKey('user', 'other', 'org', 'org:admin'), accountCacheKey('user', 'session', 'other', 'org:admin'),
    accountCacheKey('user', 'session', 'org', 'org:member')]) assert.notEqual(next, initial);
});
test('logout clears protected data and aborts requests without repopulating the cache', async () => {
  const client = new QueryClient();
  client.setQueryData(['groups'], [{ private: true }]);
  let signal!: AbortSignal;
  let resolve!: (value: string) => void;
  const pending = client.fetchQuery({ queryKey: ['snapshots'], queryFn: (context) => {
    signal = context.signal;
    return new Promise<string>((done) => { resolve = done; });
  } });
  const settled = pending.catch(() => undefined);
  clearProtectedCache(client);
  assert.equal(signal.aborted, true);
  assert.equal(client.getQueryCache().getAll().length, 0);
  resolve('late private data'); await settled;
  assert.equal(client.getQueryCache().getAll().length, 0);
});
