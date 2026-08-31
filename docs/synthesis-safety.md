# Synthesis safety and local verification

## Data model

- `lab_groups` remains the canonical roster and current mutable state. Synthesis never inserts into it and never changes ID, name, students, or color.
- `lab_snapshots` gains `source`, `image_hash`, `target_group_id`, and `unmatched_groups`. Existing snapshots default to `seed` and cannot be removed through synthesis undo.
- `lab_group_states` records each matched group's synthesis ID, Snapshot ID, week, before/after mutable values, extracted work items, status evidence, match method/confidence, and status reason.
- Unique indexes enforce one bulk Snapshot per week, one individual Snapshot per target/week, and one matched group-state per group/week. All writes and removals are transactional.
- The old automatic roster-reset code was removed. Initialization no longer deletes a non-seed or manually extended roster.

## Matching and status

Member sets are order-independent. Exact normalized members/names precede one-edit OCR correction. OCR correction requires equal member counts, all but one exact member, a sufficiently long one-edit name, and exactly one candidate. Partial labels are preserved for review, never inserted or silently assigned.

Status is derived in application code: Blocked > Needs attention > Complete > On track. AI returns current-board evidence, not the final status. The six research phases remain unchanged and independent of progress.

Continuity requires current work and stored work from exactly 7 and 14 days earlier. Task comparison normalizes punctuation, capitalization, E-mentor spelling, stop words, and basic verb forms. It requires at least two shared content tokens and either Jaccard overlap >= 0.6 or >= 0.8 coverage of the smaller token set. Different recognized actions and negation differences are rejected. Empty seeded history does not establish stagnation. No AI historical judgment or progress percentage is used.

## Undo and later edits

There is currently no manual editor for existing group work fields in this product. Nevertheless, undo compares each current field to the removed synthesis's recorded output. It restores the recorded prior value only when the current value still equals that output. Different values are preserved as later edits.

When removing an older synthesis, later synthesis output stays current. Its immediate successor's before-state is rebased field-by-field, also preserving intervening manual edits. This prevents a later undo from resurrecting a synthesis that was already removed. Continuity-derived statuses are recomputed for later weeks; a different current/manual status is preserved.

Future manual editors should participate in the same locking/history protocol. Value comparison detects changed values, not a user's intent to claim an identical value; an editor that needs that distinction must record an explicit ownership/version event.

Only mutable fields are restored: project, status, progress, currentFocus, blocker, phase, summary, lastUpdated. No group, membership, canonical identity, or unrelated snapshot is deleted.

## Retry and chronology

Dates normalize to Monday. Identical image bytes for the same scope/week return the existing Snapshot. A different image, overlapping group-week, or backdated import behind a newer group synthesis returns a 409 conflict rather than overwriting history. Review/remove the conflicting synthesis first.

Individual synthesis now creates a removable Snapshot too. This ensures it is not an invisible mutation that could be lost when undoing a bulk synthesis.

## Progress is deliberately unchanged

The existing AI estimate, rounding/clamping, average/delta arithmetic, chart scales, and synthetic to-do/doing/done formulas are unchanged. The hardcoded sidebar card was removed. Unmatched-only Snapshots are excluded from progress observations to avoid dividing by an empty group list; no new progress rubric was introduced.

## Local commands

The API builds only on startup, not on every source edit. Stop the old API in its existing terminal and restart it with its existing server-only `OPENAI_API_KEY` environment:

```sh
PORT=3001 DATABASE_URL=postgresql://localhost/tori pnpm --filter @workspace/api-server dev
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/lab-progress-board dev
```

Do not put the OpenAI key in a Vite/browser variable. The new reader retains the existing model/client and uses strict schema output plus independent runtime validation, following the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

```sh
DATABASE_URL=postgresql://localhost/tori pnpm --filter @workspace/db push
pnpm --filter @workspace/api-server test
DATABASE_URL=postgresql://localhost/tori_synthesis_test_20260830 pnpm --filter @workspace/api-server test:integration
pnpm --filter @workspace/lab-progress-board test
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm run build
```

Integration tests refuse an application database URL. Their fixture is the same 14 canonical group IDs, asserted before and after every save/remove operation and integration test. Most cases roll back their entire test transaction; the concurrency/HTTP cases clean up their own test Snapshot. No real OpenAI requests are made by tests.

## Manual browser checklist

1. Restart the API, refresh the frontend, and confirm `/api/healthz` returns JSON. Confirm the sidebar card is absent and the four seeded snapshots have no Remove action.
2. Confirm the directory still has the original 14 IDs and Phoebe & Diya is On track at 0%.
3. Upload a board with reordered names, an OCR typo, a partial label, and an unknown group. Verify matched canonical names, readable work items, and unmatched review data; the directory count must stay 14.
4. Retry the identical image/week: only one synthesis should exist. Try another image for that week: expect a clear conflict, not replacement.
5. Open Remove synthesis. Check the date-specific warning and Cancel behavior. Confirm removal, then verify Snapshot disappearance, group restoration, and refreshed Overview/history.
6. Verify a later synthesis is preserved when removing an older one. A subsequent undo must not resurrect the deleted synthesis.
7. Manual-edit preservation is covered by PostgreSQL integration tests (there is no manual field editor yet). Any ad hoc SQL visual test should be done in the isolated test database.
8. Verify invalid files and missing server configuration show controlled errors and preserve the selected valid photo for retry.

No actual board photo was sent to OpenAI during automated verification. Image readability/model behavior still needs a user visual test with a configured backend key. HEIC conversion is not added in this change; use JPEG, PNG, or WebP.
