---
title: eliminate remaining anti slop baseline
status: open
priority: medium
type: chore
labels: []
created: 2026-09-12
parent: null
blocked-by: []
blocks: []
---

## Context

The anti-slop policy was installed in #0003 with a deliberately deferred
baseline. Refactors #0001 and #0002 removed most of it, but the policy still
reports 19 diagnostics (18 normalized identities) across six files. With no
follow-up item, the repository could appear complete while
`npm run lint:anti-slop` still fails.

This parent coordinates bounded cleanup rather than combining unrelated event
boundaries, production typing, test fixtures, and CI wiring in one change.

## Acceptance Criteria

- [ ] Subtasks #0004.1 through #0004.3 eliminate every current diagnostic
      without disabling rules, broadening ignores, or adding unjustified
      assertions or suppressions.
- [ ] Extension commands, events, statuses, rendering, package resources, and
      documented platform behavior remain unchanged.
- [ ] Subtask #0004.4 makes a zero anti-slop baseline part of both local
      verification and GitHub Actions after the cleanup subtasks land.
- [ ] `npm run lint:anti-slop`, `npm run verify`, `npm run test:coverage`, and
      `npm run pack:check` pass with zero anti-slop diagnostics.
- [ ] Focused local and immutable-SHA installation checks pass for the completed
      aggregate change.
- [ ] Independent review approves the aggregate result against the child todos
      and `AGENTS.md`.

## Affected Files

- `todos/0004.1-type-event-and-session-payload-boundaries.md` — parse external
  event and persisted-session payloads coherently.
- `todos/0004.2-simplify-production-anti-slop-findings.md` — remove production
  assertion, known-union, and widening findings.
- `todos/0004.3-make-test-fixtures-type-safe.md` — replace test-fixture and
  parsed-manifest assertions.
- `todos/0004.4-enforce-zero-anti-slop-baseline.md` — wire the clean policy into
  npm verification and CI.

## Implementation Sequence

1. Implement and independently review #0004.1, #0004.2, and #0004.3. They are
   logically independent and may proceed separately.
2. Implement #0004.4 only after all three cleanup subtasks are done, so its RED
   checkpoint proves the repository gate against a known-clean baseline.
3. Run aggregate package/install checks and final independent review before
   marking this parent done.

## Notes

- Baseline at creation: 19 raw diagnostics / 18 normalized identities across
  six diagnostic-bearing files: 12
  `require-safety-comment-for-type-assertion`, 3 `no-runtime-typeof`, 3
  `no-unknown-parameters`, and 1 `no-known-value-widening`.
- `package.json` and `.github/workflows/test.yml` are additional affected files
  for enforcement, not current diagnostic-bearing files.
- Prefer deletion, inference, precise upstream types, and small boundary
  decoders over casts, wrappers, or abstractions added only to silence lint.
- Visible UI review is required only if a child changes rendered output; a
  behavior-neutral typing or CI-only child should record why it does not.
- `parent` records hierarchy. `blocked-by`/`blocks` record execution
  dependencies, not parent-child membership: the parent therefore does not
  claim to block its children, while #0004.1–#0004.3 each block #0004.4.
