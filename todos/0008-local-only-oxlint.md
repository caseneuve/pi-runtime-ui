---
title: Keep oxlint as a local-only development tool
status: done
priority: high
type: chore
labels: []
created: 2026-10-05
parent: null
blocked-by: []
blocks: []
---

## Context

CI fails loading the untracked anti-slop plugin. The user explicitly chose
local-only oxlint rather than restoring the plugin to version control.

## Acceptance Criteria

- [x] `oxlint.config.ts` is ignored and untracked but preserved locally.
- [x] `npm run verify` does not invoke oxlint; metadata tests enforce this.
- [x] README distinguishes portable verification from optional local lint.
- [x] Verification, coverage, and package dry-run pass without local oxlint files.

## Affected Files

- `.gitignore`, `oxlint.config.ts` — local-only configuration.
- `package.json`, `test/package.test.ts` — portable quality gates.
- `README.md` — optional local lint documentation.

## Notes

- Supersedes #0004.4's requirement that CI run anti-slop lint, per user decision.
- Keep the explicit `lint:anti-slop` command and existing dev dependencies for
  locally provisioned tooling. No runtime, manifest, or UI changes.
- Work on `chore/local-only-oxlint`; merge only after approval.
- RED: package test failed on the old verify command; GREEN: 101 tests pass.
- Checkpoint `8770f80` validated both in the working tree and a fresh Git archive
  at `/tmp/pi-runtime-ui-ci-sjerF4` without local oxlint config/plugin files.
  Fresh `npm ci`, `npm run verify`, `npm run test:coverage`, and
  `npm run pack:check` passed (81.28% statement coverage in the snapshot).
- No package resources, dependencies, or installation behavior changed.
  Full Pi installation checks were not repeated for this tooling-only change.
- User approved squash merge to `master`; merged accordingly. Independent peer
  review was not performed. No screenshot review needed.
