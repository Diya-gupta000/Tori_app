/** Never serialize SDK/database error objects: request bodies, SQL parameters, or headers may contain secrets. */
export function safeSynthesisError(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : {};
  const safeToken = (token: unknown) => typeof token === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(token) && !token.startsWith("sk-") ? token : undefined;
  return {
    errorType: safeToken(value.name),
    status: typeof value.status === "number" ? value.status : undefined,
    code: safeToken(value.code ?? cause.code),
    requestId: safeToken(value.request_id),
    validationIssues: Array.isArray(value.issues) ? value.issues.map((issue: Record<string, unknown>) => ({ code: safeToken(issue.code) })) : undefined,
  };
}
