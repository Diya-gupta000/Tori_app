import { SynthesisError } from './synthesis-store';

const controllers = new Set<AbortController>();
const claims = new Map<string, AbortController>();
const weeks = new Map<AbortController, string>();
export function activeRequest() {
  const controller = new AbortController();
  controllers.add(controller);
  return { controller, week: (value: string) => weeks.set(controller, value), claim: (id: string) => claims.set(id, controller), release: () => {
    controllers.delete(controller);
    weeks.delete(controller);
    for (const [id, value] of claims) if (value === controller) claims.delete(id);
  } };
}
export function abortClaims(ids: string[]) { for (const id of ids) claims.get(id)?.abort(); }
export function abortWeek(weekOf: string) {
  // Also cancel local requests still validating their image, before they obtain a DB claim.
  for (const [controller, week] of weeks) if (week === weekOf) controller.abort();
}
export function abortActiveRequests() { for (const controller of controllers) controller.abort(); }

export async function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => {});
    throw new SynthesisError(504, 'Photo analysis timed out or was cancelled. No new synthesis was saved.');
  }
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new SynthesisError(504, 'Photo analysis timed out or was cancelled. No new synthesis was saved.'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
