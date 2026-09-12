---
title: canonical runtime footer config locations
status: done
priority: high
type: refactor
labels: []
created: 2026-09-12
parent: null
blocked-by: []
blocks: [0002]
---

## Context

The package port retained runtime-footer configuration directly under `.pi/`
and the global Pi agent directory, hardcodes `.pi`, and reads project-local
configuration without consulting Pi project trust. Pi exposes `CONFIG_DIR_NAME`,
`getAgentDir()`, and `ctx.isProjectTrusted()` for these boundaries.

Adopt one namespaced location per scope. Both JSONC and JSON are current,
first-class formats; old root-level locations are removed rather than retained
as migration fallbacks.

## Acceptance Criteria

- [x] Slice 0 updates the pinned development Pi API packages
      (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and
      `@earendil-works/pi-tui`) together from 0.84.2 to the latest stable
      release, 0.85.1, updates the lockfile, reviews the intervening upstream
      API/documentation changes, and establishes that version as the
      compatibility contract before runtime-footer changes begin.
- [x] Project configuration candidates are, in order,
      `<cwd>/<CONFIG_DIR_NAME>/extensions/runtime-footer/config.jsonc` and
      `config.json` in the same directory.
- [x] Global configuration candidates are, in order,
      `<getAgentDir()>/extensions/runtime-footer/config.jsonc` and `config.json`
      in the same directory.
- [x] Trusted project configuration overrides global configuration; JSONC
      precedes JSON within each scope.
- [x] The first existing candidate is authoritative. If it is malformed,
      runtime-footer reports that error and uses defaults; it does not try a
      lower-precedence project or global file.
- [x] For automatic config loading, trust filtering happens before filesystem
      inspection: pure planning omits project candidates when
      `ctx.isProjectTrusted()` is false, the shell probes only eligible
      candidates, and pure selection chooses from those facts. Automatic loading
      neither probes nor reads untrusted project config paths; global
      configuration remains available.
- [x] `/runtime-footer-config [global|local]` edits an existing canonical JSONC
      file first, then an existing canonical JSON file, and otherwise creates
      `config.jsonc`.
- [x] The compatibility command argument `project` is removed; accepted modes
      are only `global` and `local`. This deliberate cleanup is included because
      the same command handler is already changing and deletion is simpler than
      preserving a legacy normalization branch.
- [x] An explicit user invocation of `/runtime-footer-config local` may probe
      only the canonical project JSONC/JSON edit candidates and may create the
      project JSONC file even when the project is untrusted; it never probes
      legacy paths. If untrusted, the command reports the resolved project
      resource path and explains that it will require project trust on the next
      startup and is not consumed now; user-facing text does not hardcode `.pi`.
- [x] `.pi/runtime-footer.json[c]` and
      `<getAgentDir()>/runtime-footer.json[c]` are not read, probed, warned
      about, or automatically migrated.
- [x] Old path constants, fallback branches, helpers, tests, and stale path
      documentation are deleted rather than deprecated.
- [x] Path planning and source selection are pure and table-tested with injected
      path roots, trust state, and file-existence facts; filesystem probes and
      reads remain in the imperative shell.
- [x] Adapter-level tests prove both boundaries: automatic untrusted source
      resolution invokes no project existence/stat probes, while an explicit
      untrusted local edit probes only canonical edit candidates and never
      legacy paths.
- [x] Existing config schema, rendering, cache TTL, mtime refresh, and
      config-error fallback behavior are unchanged in this item.
- [x] Newly added or materially modified helpers, statements, and test cases use
      precise domain types and satisfy the anti-slop Oxlint rules. Merely adding
      a case to the shared extension factory or test file does not pull the
      entire existing function/file baseline into scope.
- [x] Do not clean parser/config-compilation code that `#0002` will replace;
      deleting it in the blocked refactor is preferred to polishing it here.
- [x] The anti-slop run introduces no new diagnostic identity, compared by
      rule, file, message, and source construct rather than raw count or line
      number. The implementation report distinguishes untouched baseline
      findings from findings removed in materially changed constructs.
- [x] README and command text document canonical paths, precedence, trust, both
      formats, and a manual migration example without runtime old-path support.
- [x] Repository verification, anti-slop lint, coverage, package dry run, and
      focused local/Git installation checks are run; scoped acceptance does not
      require unrelated baseline diagnostics to be fixed.

## Affected Files

- `package.json` and `package-lock.json` — Slice 0 Pi API compatibility-contract update.
- `extensions/runtime-footer.ts` — canonical path planning, trusted source
  selection, command targets, and deletion of old path support.
- `test/runtime-footer.test.ts` — path, precedence, trust, format, malformed
  authoritative-source, and old-path rejection coverage.
- `README.md` — canonical locations and manual migration.
- `CHANGELOG.md` — user-visible config-location and command-argument breaks.

## Notes

- Approved implementation order begins with Slice 0: update all three pinned
  Pi development packages in lockstep to stable 0.85.1, run the existing
  verification suite, and review the 0.84.2-to-0.85.1 API delta before writing
  new tests against the updated contract.
- Keep JSONC support; Pi does not provide a public JSONC parser, so parsing
  remains extension-owned.
- Use `CONFIG_DIR_NAME` instead of hardcoding `.pi` and `getAgentDir()` instead
  of assuming the default global directory.
- Do not add old-path detection warnings, fallback reads, copies, renames, or
  one-time automatic migration.
- Removing the one-line `project` argument alias is an explicitly approved
  exception to the otherwise path-focused scope: it reduces compatibility
  surface in code already touched by this item, matching the requirement not
  to maintain legacy behavior.
- Replace stale path documentation with a migration note; deleting runtime
  support does not mean hiding the release-breaking move.
- Parser/schema cleanup is deliberately split into blocked item `#0002`.
- Scoped quality rule: fix anti-slop patterns in code this item touches, but do
  not spend effort improving code scheduled for deletion by `#0002`. Prefer
  deleting duplication and improving types over adding assertions, wrappers, or
  suppression comments.

## Implementation Report

- Slice 0 pinned all three Pi development API packages to `0.85.1`; upstream
  review found no incompatible change to the required APIs.
- Automatic loading now follows trust, pure planning, eligible probes, pure
  selection, then selected-file stat/read. Trust is part of cache identity.
- Explicit editing uses a separate canonical edit plan, preserving the approved
  untrusted-local exception without global or legacy fallback.
- Peer review requested actual registered-adapter coverage; a typed effects seam
  and focused footer/command tests were added in `69c7c6b`.
- Verification passed: `npm run verify`, `npm run test:coverage` (55 tests),
  `npm run pack:check`, and `npx prek run --all-files`.
- Anti-slop remains at the untouched baseline: 50 raw diagnostics and 17
  normalized identities, with no added or removed identity.
- Isolated local installation passed. Immutable Git installation of `69c7c6b`
  passed through a temporary local HTTP Git remote and checked out that exact
  detached commit.
- Peer review approved the implementation in
  `.reviews/refactor-canonical-runtime-footer-config-locations-2026-09-12-181001.md`.
- Human waived the pending screenshot review when authorizing the squash merge.
