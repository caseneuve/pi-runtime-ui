---
title: update pinned pi api
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

Upgrade the exact development Pi API pins from 0.85.1 to npm's current latest
1.0.3 before validating footer decoupling. User approved this scope; work is on
`refactor/decouple-runtime-footer`. Preserve wildcard peers and public behavior.

## Acceptance Criteria

- [x] All three development Pi packages are exactly 1.0.3, with a matching committed lockfile; wildcard peers remain unchanged.
- [x] Read the selected API documentation/declarations and resolve compatibility changes without unrelated redesign.
- [x] `npm run verify`, coverage, package validation, hooks and isolated local installation pass.
- [x] Record the public status-map/refresh contract and update todo 0005's selected version.
- [x] Independent review approves the dependency checkpoint before merge.

## Affected Files

- `package.json` and `package-lock.json` — exact Pi development pins.
- `todos/0005-decouple-runtime-footer-from-producer-extensions.md` — selected API contract.
- Extension/tests only if the selected API requires compatibility fixes.

## Shipment

The human approved squash merge of the reviewed stacked branch to master and
closure of todos 0005–0007 on 2026-10-05. This dependency task is marked done
in that shipment. No version bump or push was requested; historical review
statements do not override this explicit final merge authorization.

## Notes

Initial baseline: `npm run verify` passes (85 tests). Installed Pi 1.0.3
`dist/modes/interactive/interactive-mode.js` implements `setStatus` by updating
its footer data provider and calling `ui.requestRender()`. The public custom
footer factory receives `getExtensionStatuses()`; no new event bus or private
provider imports are needed. npm latest was checked for all three Pi packages.

Validation after upgrade: verify passes with 85 tests; coverage passes (74.83%
statements, 71.62% branches); pack dry run contains 11 expected files; all Prek
hooks pass; isolated local `pi install` and `pi list` succeed with a temporary
`PI_CODING_AGENT_DIR` and cwd, then cleaned up. No compatibility code changes
were required. npm reports three moderate audit entries in the existing Vitest
4.1.9 toolchain (GHSA-82fw-gwwq-j7x9), not Pi runtime dependencies; upgrading
unrelated tooling is not included in this task. npm also blocked install scripts
for genai/esbuild/protobufjs under the environment allowScripts policy; checks
passed without approving additional scripts.

Independent checkpoint review approved `1ae0cff965d5c5f3fe61144412619a45e250b1ca`
in `.reviews/refactor-decouple-runtime-footer-2026-10-05-204657.md`, with no
introduced findings. Review separately validated the committed snapshot (86
tests; 71.26% statement coverage), distinguishing it from the inherited working
changes above. It noted pre-existing ignored anti-slop plugin tooling means a
plain clean archive cannot run that lint without the local tooling; this is a
separate reproducibility risk, not silently resolved here. No merge authorized.

Complete this checkpoint before consumer-side removal. Producer work is delegated
separately to Herdr agent `comms-producer` in `~/git/pi/pi-agent-channel` using
GPT 6.1 Sol / medium. That external prerequisite remains a hard blocker for 0005.
