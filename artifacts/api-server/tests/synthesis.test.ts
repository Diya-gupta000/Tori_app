import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStatus, hasThreeWeekTaskContinuity, matchExtractedGroup, normalizedMemberKey, normalizeWeek, tasksContinue } from "../src/lib/synthesis";
import { validateBoard, phases } from "../src/lib/board-reader";
import { board, extracted, noEvidence, roster } from "./fixtures";
import { safeSynthesisError } from "../src/lib/synthesis-log";

test("member ordering, punctuation, capitalization, and and/& do not change identity", () => {
  for (const [name, students, id] of [
    ["Erin and Jason", [" ERIN ", "Jason"], "jason-erin"],
    ["Kyla, Milena & Zahra", ["Kyla", "Milena", "Zahra"], "kyla-zahra-milena"],
    ["Nisma & Tessa", ["Nisma", "Tessa"], "tessa-nisma"],
  ] as const) {
    const result = matchExtractedGroup({ name, students: [...students] }, roster);
    assert.equal(result.matched && result.group.id, id);
  }
  assert.equal(normalizedMemberKey(["Jason K."]), normalizedMemberKey(["jason k"]));
});
test("one unique, high-confidence OCR typo is corrected", () => {
  const result = matchExtractedGroup({ name: "Alyssa & Chinthan", students: ["Alyssa", "Chinthan"] }, roster);
  assert.equal(result.matched && result.group.id, "alyssa-chintan");
  assert.equal(result.matched && result.method, "ocr-correction");
});
test("partial and unknown groups need review; no invented identity", () => {
  const partial = matchExtractedGroup({ name: "Andy & Roya", students: ["Andy", "Roya"] }, roster);
  assert.equal(partial.matched, false);
  assert.equal(!partial.matched && partial.suggestedGroupId, "jack-andy-roya");
  assert.equal(matchExtractedGroup({ name: "Unknown", students: ["Unknown"] }, roster).matched, false);
  assert.equal(matchExtractedGroup({ name: "Phoebe & Diya", students: ["Wrong", "People"] }, roster).matched, false);
});
test("ambiguous OCR candidate is not automatically routed", () => {
  const candidates = [...roster, { id: "other", name: "Alyssa & Chintan", students: ["Alyssa", "Chintan"] }];
  assert.equal(matchExtractedGroup({ students: ["Alyssa", "Chinthan"] }, candidates).matched, false);
});
test("three-week continuity tolerates harmless wording variation", () => {
  const a = [{ title: "Email E-mentors", details: null }];
  const b = [{ title: "Send emails to E mentors", details: null }];
  assert.equal(tasksContinue(a[0].title, b[0].title), true);
  assert.equal(deriveStatus(noEvidence, hasThreeWeekTaskContinuity(a, b, a)).status, "Needs attention");
});
test("different work and only two weeks are not stagnant", () => {
  const a = [{ title: "Email E-mentors", details: null }];
  const b = [{ title: "Collect fruit fly samples", details: null }];
  assert.equal(hasThreeWeekTaskContinuity(a, b, a), false);
  assert.equal(hasThreeWeekTaskContinuity(a, a, []), false);
  assert.equal(tasksContinue("Email mentors", "Interview mentors"), false);
});
test("status precedence is deterministic and has no progress dependency", () => {
  assert.equal(deriveStatus({ blocked: true, needsAttention: true, complete: true, reason: "Cannot access data" }, true).status, "Blocked");
  assert.equal(deriveStatus({ ...noEvidence, needsAttention: true }, false).status, "Needs attention");
  assert.equal(deriveStatus({ ...noEvidence, complete: true }, false).status, "Complete");
  assert.equal(deriveStatus(noEvidence, false).status, "On track");
});
test("model output is validated, including six stages and evidence support", () => {
  for (const phase of phases) assert.equal(validateBoard(board([{ ...extracted(), phase }])).groups[0].phase, phase);
  assert.throws(() => validateBoard(board([{ ...extracted(), phase: "invented" as never }])));
  assert.throws(() => validateBoard(board([{ ...extracted(), progress: NaN }])));
  assert.throws(() => validateBoard(board([{ ...extracted(), statusEvidence: { ...noEvidence, blocked: true } }])));
  assert.throws(() => validateBoard({ groups: [] }));
});
test("continuity does not merge negated or differently actioned work", () => {
  assert.equal(tasksContinue("Email E-mentors", "Do not email E-mentors"), false);
  assert.equal(tasksContinue("Write fruit fly protocol", "Review fruit fly protocol"), false);
});
test("error diagnostics never include headers, raw messages, image data, or API keys", () => {
  const safe = safeSynthesisError({ name: "APIError", status: 401, code: "invalid_api_key", request_id: "req_123",
    message: "bad key sk-secret", headers: { authorization: "Bearer sk-secret" }, body: "raw-image", cause: { query: "private" } });
  const serialized = JSON.stringify(safe);
  assert.match(serialized, /invalid_api_key/);
  assert.doesNotMatch(serialized, /sk-secret|Bearer|raw-image|private/);
});
test("dates in the same week use one Monday identity", () => {
  assert.equal(normalizeWeek("2026-08-24"), "2026-08-24");
  assert.equal(normalizeWeek("2026-08-30"), "2026-08-24");
  assert.throws(() => normalizeWeek("2026-02-30"));
});
