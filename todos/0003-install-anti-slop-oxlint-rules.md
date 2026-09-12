---
title: install anti slop oxlint rules
status: done
priority: medium
type: chore
labels: []
created: 2026-09-12
parent: null
blocked-by: []
blocks: []
---

## Context

Install the vendored generic anti-slop Oxlint policy plugin so the project can
assess its TypeScript against the policy after the planned runtime-footer
refactors in items #0001 and #0002.

## Acceptance Criteria

- [x] `tools/oxlint/anti-slop/` contains the upstream generic vendored plugin.
- [x] Matching current `oxlint` and `@oxlint/plugins` development dependencies
      are locked with npm.
- [x] `oxlint.config.ts` registers the generic plugin, excludes agent assets and
      the vendored source, and enables all 15 generic rules at error severity.
- [x] An explicit npm script runs the anti-slop policy without changing Biome's
      existing formatter/base-linter role.
- [x] Baseline anti-slop diagnostics are captured, but no existing source is
      changed to resolve them in this item.
- [x] Existing repository checks and typecheck pass; policy findings are
      reported separately for later cleanup.

## Affected Files

- `tools/oxlint/anti-slop/` — vendored generic anti-slop plugin.
- `oxlint.config.ts` — plugin registration and rule policy.
- `package.json` and `package-lock.json` — Oxlint dependencies and script.

## Notes

- Do not enable the optional Effect rule group: Effect is not a direct project
dependency.
- Decision: do not add the new policy script to `verify` yet. This item installs
  the policy without changing existing source. Baseline findings remain deferred
  except where `#0001` or `#0002` newly adds or materially modifies the reported
  construct; unrelated cleanup remains later work.
- Biome remains the repository formatter and base linter; Oxlint is limited to
the supplemental custom policy rules. `-A all` disables Oxlint's built-in rules
so the policy command reports only anti-slop diagnostics.
- Baseline (2026-09-12): 50 errors across 7 files: 24
  `require-safety-comment-for-type-assertion`, 14 `no-runtime-typeof`, 8
  `no-unknown-parameters`, 3 `no-known-value-widening`, and 1
  `no-unknown-returns`. During #0001 and #0002, only diagnostics in newly added
  or materially modified constructs enter scope; the remaining baseline stays
  deferred.
