export type CanonicalGroup = {
  id: string;
  name: string;
  students: string[];
};

export type WorkItem = {
  title: string;
  details: string | null;
};

export type ExtractedGroup = {
  name?: string;
  students?: string[];
  workItems?: WorkItem[];
};

export type MatchResult =
  | { matched: true; group: CanonicalGroup; method: "member-set" | "group-name" | "ocr-correction"; confidence: number }
  | { matched: false; reason: string; suggestedGroupId: string | null };

export function normalizeWeek(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("A valid week date is required.");
  }
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

const normalizeText = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\band\b/g, "&")
  .replace(/[^a-z0-9&]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

export const normalizePerson = (value: string) => normalizeText(value).replaceAll("&", "").trim();

export const normalizedMemberKey = (members: string[]) => [...new Set(
  members.map(normalizePerson).filter(Boolean),
)].sort().join("|");

export const normalizeGroupName = (value: string) => normalizeText(value)
  .replace(/\s*&\s*/g, " & ")
  .trim();

function extractedMembers(group: ExtractedGroup): string[] {
  const supplied = group.students?.map((student) => student.trim()).filter(Boolean) ?? [];
  if (supplied.length) return supplied;
  if (!group.name) return [];
  return group.name.split(/\s*(?:,|&|\band\b)\s*/i).map((part) => part.trim()).filter(Boolean);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function isSingleHighConfidenceOcrDifference(extracted: string[], canonical: string[]): boolean {
  if (extracted.length !== canonical.length || extracted.length === 0) return false;
  const remaining = [...canonical.map(normalizePerson)];
  const differences: Array<[string, string]> = [];
  for (const member of extracted.map(normalizePerson)) {
    const exactIndex = remaining.indexOf(member);
    if (exactIndex >= 0) {
      remaining.splice(exactIndex, 1);
      continue;
    }
    const candidateIndex = remaining.findIndex((candidate) =>
      Math.min(member.length, candidate.length) >= 5 && editDistance(member, candidate) === 1,
    );
    if (candidateIndex < 0) return false;
    differences.push([member, remaining[candidateIndex]]);
    remaining.splice(candidateIndex, 1);
  }
  return remaining.length === 0 && differences.length === 1;
}

export function matchExtractedGroup(extracted: ExtractedGroup, existing: CanonicalGroup[]): MatchResult {
  const members = extractedMembers(extracted);
  const memberKey = normalizedMemberKey(members);
  if (memberKey) {
    const exactMembers = existing.filter((group) => normalizedMemberKey(group.students) === memberKey);
    if (exactMembers.length === 1) {
      return { matched: true, group: exactMembers[0], method: "member-set", confidence: 100 };
    }
  }

  const normalizedName = normalizeGroupName(extracted.name ?? "");
  if (normalizedName) {
    const exactNames = existing.filter((group) => normalizeGroupName(group.name) === normalizedName);
    if (exactNames.length === 1 && (!extracted.students?.length || normalizedMemberKey(exactNames[0].students) === memberKey)) {
      return { matched: true, group: exactNames[0], method: "group-name", confidence: 100 };
    }
  }

  if (members.length) {
    const ocrCandidates = existing.filter((group) =>
      isSingleHighConfidenceOcrDifference(members, group.students),
    );
    if (ocrCandidates.length === 1) {
      return { matched: true, group: ocrCandidates[0], method: "ocr-correction", confidence: 96 };
    }

    const normalizedMembers = new Set(members.map(normalizePerson));
    const relationshipCandidates = existing.filter((group) => {
      const canonicalMembers = new Set(group.students.map(normalizePerson));
      return normalizedMembers.size > 0 && [...normalizedMembers].every((member) => canonicalMembers.has(member));
    });
    if (relationshipCandidates.length === 1) {
      return {
        matched: false,
        reason: "The board label contains only part of an existing group's member list.",
        suggestedGroupId: relationshipCandidates[0].id,
      };
    }
  }

  return {
    matched: false,
    reason: "No existing group matched with high confidence.",
    suggestedGroupId: null,
  };
}

const stopWords = new Set(["a", "an", "and", "for", "of", "on", "our", "the", "to", "we", "will"]);

function stemTaskToken(token: string): string {
  const explicit: Record<string, string> = {
    emailed: "email",
    emailing: "email",
    emails: "email",
    scheduled: "schedule",
    schedules: "schedule",
    scheduling: "schedule",
    mentors: "mentor",
    interviews: "interview",
    writing: "write",
    written: "write",
    wrote: "write",
    sent: "send",
    sending: "send",
  };
  if (explicit[token]) return explicit[token];
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function normalizedTaskTokens(value: string): string[] {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/e\s*[- ]?\s*mentors?/g, "ementor")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = normalized.split(/\s+/).filter(Boolean).map(stemTaskToken)
    .filter((token) => !stopWords.has(token));
  if (tokens.includes("ementor") && (tokens.includes("send") || tokens.includes("email"))) {
    return [...new Set(tokens.map((token) => token === "send" ? "email" : token))].sort();
  }
  return [...new Set(tokens)].sort();
}

export function tasksContinue(left: string, right: string): boolean {
  const leftTokens = new Set(normalizedTaskTokens(left));
  const rightTokens = new Set(normalizedTaskTokens(right));
  if (leftTokens.size < 2 || rightTokens.size < 2) return false;
  const negated = (tokens: Set<string>) => ["not", "never", "stop", "cancel"].some((token) => tokens.has(token));
  if (negated(leftTokens) !== negated(rightTokens)) return false;
  const actions = ["email", "collect", "write", "review", "schedule", "interview", "design", "build", "read", "test", "measure", "implement"];
  const leftActions = actions.filter((token) => leftTokens.has(token));
  const rightActions = actions.filter((token) => rightTokens.has(token));
  if (leftActions.length && rightActions.length && !leftActions.some((token) => rightActions.includes(token))) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = overlap / union;
  const smallerCoverage = overlap / Math.min(leftTokens.size, rightTokens.size);
  return overlap >= 2 && (jaccard >= 0.6 || smallerCoverage >= 0.8);
}

export function hasThreeWeekTaskContinuity(
  current: WorkItem[],
  previous: WorkItem[],
  twoWeeksAgo: WorkItem[],
): boolean {
  if (!current.length || !previous.length || !twoWeeksAgo.length) return false;
  return current.some((task) =>
    previous.some((candidate) => tasksContinue(task.title, candidate.title)) &&
    twoWeeksAgo.some((candidate) => tasksContinue(task.title, candidate.title)),
  );
}

export type StatusEvidence = {
  blocked: boolean;
  needsAttention: boolean;
  complete: boolean;
  reason: string | null;
};

export function deriveStatus(evidence: StatusEvidence, stagnant: boolean) {
  if (evidence.blocked) return { status: "Blocked" as const, reason: evidence.reason || "Explicit blocker on the current board." };
  if (evidence.needsAttention) return { status: "Needs attention" as const, reason: evidence.reason || "Explicit request for help on the current board." };
  if (stagnant) return { status: "Needs attention" as const, reason: "The same meaningful task has continued for three consecutive weeks." };
  if (evidence.complete) return { status: "Complete" as const, reason: evidence.reason || "Completion is explicit on the current board." };
  return { status: "On track" as const, reason: "No blocking, attention, or completion signal was explicit." };
}
