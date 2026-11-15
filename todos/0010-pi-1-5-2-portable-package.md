---
id: 0010
title: Retain runtime UI on Pi 1.5.2 with portable package tooling
status: done
---

## Scope and decisions

User-authorized compatibility/package tranche from master `38fb58e`, on dedicated
branch/worktree `task/pi-1.5.2-runtime-ui` outside the user's loaded checkout.
No main-checkout/config edits, pruning, subagents, merge, push, tag or cutover.
Preserve generic status consumption, sole native CustomEditor owner and sole
footer owner, all commands/config paths/layout semantics/platform limits.

Manually adopt relevant portable baseline from template master
`08350707812e7036ab9477e879c1b029febd552b` (local, unpushed). Preserve historical
Copier generation revision; record manual adoption separately, not as a completed
Copier update. No template/private dependency or vendored/local plugin required.
Supersede todo 0008's package-local optional Oxlint command/dependencies with the
existing separate central local-check runner. Ignored main-checkout tools remain
untouched. Pi coding-agent/TUI host APIs use exact 1.5.2 dev pins and `*` peers;
unused AI direct dependency/peer removed. TypeBox is used only by metadata tests:
retain exact host-matched 1.3.27 dev pin, no runtime peer. Node >=22.19.0.
No release/version bump; no same-day version-policy invention.

## Acceptance criteria

- [x] Portable Biome, TS, Vitest/V8, guarded Prek, explicit manifest/files; remove
  per-package anti-slop coupling; structural package tests, no script-string lock.
- [x] Truthful provenance, native personal/local install and update docs, `.pi/*`
  ignore with shared `.pi/docs/` exception; preserve resource/config identities.
- [x] Clean npm ci, check/check:ci, typecheck, tests, coverage, pack dry-run;
  production-only lifecycle + immutable local Git install validation.
- [x] Separate central-runner evidence for enumerated owned TS/helper files.
- [x] Actual Pi 1.5.2 native personal/local installs in isolated HOME/config/session
  sandbox; project trust deny/allow, filtering, reload and failure paths.
- [x] Every entry live: branch-status divergence/path changes/clear (optional
  bookmark event); native editor activity and hidden-input indicators plus Git
  changes; footer canonical precedence/trust/status tokens/errors/recovery,
  narrow/wide, light/dark, regular/fullscreen.
- [x] Actual conversation-tools session-notes producer update/clear against its
  coordinated near-final/reviewed SHA and this implementation.
- [x] Actual native screenshots opened/inspected; sanitized commands, versions,
  exact commits, fixture limitations and scenario matrix under
  `~/.cache/pi-migration/evidence/runtime-ui/`.
- [x] Independent review requested through lead t16; remain available for fixes.

## Verification notes

Read baseline-review, live-verification-contract, status and isolated screenshot
helper/report. Read installed Pi 1.5.2 extension/package/settings/configuration/TUI,
theme/security/environment/CLI/session/custom-provider docs and native editor,
footer and bookmark examples/source before changing code. Live fixture providers
or seeded sessions are explicitly labeled; no real network-provider claim.

## Results and review evidence

- Portable verification: 10 test files / 132 tests; V8 statements 83.47%,
  branches 78.18%, functions 81.6%, lines 84.36%. No coverage baseline reduction
  or invented threshold. Clean independent Git clone repeats checks and pack.
- Separate central runner: 17 explicit extension/test/helper files; 302 baseline
  diagnostics at `38fb58e`, 302 unchanged final diagnostics, zero introduced or
  removed by rule/source/message fingerprint. No new TS files. Existing debt is
  not a pass and is deliberately not a broad cleanup requirement in this tranche.
- Lead/reviewer ignore correction: root-anchored `!/.pi/` precedes `.pi/*` and
  `!.pi/docs/`. Real Git regression has empty/synthetic global excludes cases;
  root docs stage successfully, root settings/MCP/state remain ignored, globally
  ignored nested settings stay ignored. Red evidence covers both missing-parent
  and unanchored-parent bugs, followed by green tests.
- Native personal/local path installs, trust deny/allow, all three entries alone
  in regular mode and together in fullscreen, branch path/bookmark/clear,
  actual native Working/hidden input at 120 and 37 columns, Git changes,
  JSONC precedence/invalid authoritative source, duplicate-status error, external
  editor recovery/missing/failing editor, generic status normalization/clear,
  light/dark palette switch, reload and actual process restart all exercised.
- Conversation-tools immutable `f0618d7c531151773ce08f4c0a423f8876999ddd` native
  integration: notes create `[0/1]`, resolve `[1/1]`, reload persists, delete
  clears; subsequent note also survives process restart. Fixture source bytes
  independently compared to that SHA by reviewer t3y.
- Installation proof includes production-only `npm ci --omit=dev
  --legacy-peer-deps` with no Prek/hook, and native Pi immutable Git install via
  an environment-only URL rewrite to a test-owned local bare mirror. No published
  remote install/availability claim. Recheck final SHA after this closeout commit.
- Original screenshots opened and inspected; reviewer t3y independently inspected
  source, portable checks and original live PNGs. Independent review approved
  `8205ffa7d5299275f0d7b8344b7bb0cd9123b398`; this status-only closeout follows the
  lead's request before final freeze. Review/installation recheck is recorded in
  external `runtime-ui/review.md` and `handoff.md`; no merge authorized.
- Complete scenario/command/artifact index: external evidence `runtime-ui/handoff.md`
  and `live-commands.jsonl`. Seeded sessions and controlled local HTTP SSE fixture
  drive real host activity without real external-provider/auth/network proof.
  App/sandbox has a light terminal background; Pi dark/light palettes are verified
  by actual theme reports and contrasting transcript/border/footer screenshots.
- npm audit reports five host/dev transitive advisories (3 moderate, 2 high).
  No runtime dependencies; no unrelated forced host dependency upgrades attempted.

Main checkout remains on clean `38fb58e`; no user settings/auth/display edits,
missing-worktree pruning, push, tag, merge or live cutover. Review fixes will be
new commits on this dedicated branch.
