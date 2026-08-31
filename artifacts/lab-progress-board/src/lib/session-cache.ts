import type { QueryClient } from '@tanstack/react-query';

export function accountCacheKey(userId: string, sessionId: string, orgId: string, role?: string | null) {
  return JSON.stringify([userId, sessionId, orgId, role]);
}
export function clearProtectedCache(client: QueryClient) {
  void client.cancelQueries();
  client.clear();
}
