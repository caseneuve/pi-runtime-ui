---
title: canonical runtime footer config locations
status: open
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

- [ ] Project configuration candidates are, in order,
      `<cwd>/<CONFIG_DIR_NAME>/extensions/runtime-footer/config.jsonc` and
      `config.json` in the same directory.
- [ ] Global configuration candidates are, in order,
      `<getAgentDir()>/extensions/runtime-footer/config.jsonc` and `config.json`
      in the same directory.
- [ ] Trusted project configuration overrides global configuration; JSONC
      precedes JSON within each scope.
- [ ] The first existing candidate is authoritative. If it is malformed,
      runtime-footer reports that error and uses defaults; it does not try a
      lower-precedence project or global file.
- [ ] For automatic config loading, trust filtering happens before filesystem
      inspection: pure planning omits project candidates when
      `ctx.isProjectTrusted()` is false, the shell probes only eligible
      candidates, and pure selection chooses from those facts. Automatic loading
      neither probes nor reads untrusted project config paths; global
      configuration remains available.
- [ ] `/runtime-footer-config [global|local]` edits an existing canonical JSONC
      file first, then an existing canonical JSON file, and otherwise creates
      `config.jsonc`.
- [ ] The compatibility command argument `project` is removed; accepted modes
      are only `global` and `local`. This deliberate cleanup is included because
      the same command handler is already changing and deletion is simpler than
      preserving a legacy normalization branch.
- [ ] An explicit user invocation of `/runtime-footer-config local` may probe
      only the canonical project JSONC/JSON edit candidates and may create the
      project JSONC file even when the project is untrusted; it never probes
      legacy paths. If untrusted, the command reports the resolved project
      resource path and explains that it will require project trust on the next
      startup and is not consumed now; user-facing text does not hardcode `.pi`.
- [ ] `.pi/runtime-footer.json[c]` and
      `<getAgentDir()>/runtime-footer.json[c]` are not read, probed, warned
      about, or automatically migrated.
- [ ] Old path constants, fallback branches, helpers, tests, and stale path
      documentation are deleted rather than deprecated.
- [ ] Path planning and source selection are pure and table-tested with injected
      path roots, trust state, and file-existence facts; filesystem probes and
      reads remain in the imperative shell.
- [ ] Adapter-level tests prove both boundaries: automatic untrusted source
      resolution invokes no project existence/stat probes, while an explicit
      untrusted local edit probes only canonical edit candidates and never
      legacy paths.
- [ ] Existing config schema, rendering, cache TTL, mtime refresh, and
      config-error fallback behavior are unchanged in this item.
- [ ] Newly added or materially modified helpers, statements, and test cases use
      precise domain types and satisfy the anti-slop Oxlint rules. Merely adding
      a case to the shared extension factory or test file does not pull the
      entire existing function/file baseline into scope.
- [ ] Do not clean parser/config-compilation code that `#0002` will replace;
      deleting it in the blocked refactor is preferred to polishing it here.
- [ ] The anti-slop run introduces no new diagnostic identity, compared by
      rule, file, message, and source construct rather than raw count or line
      number. The implementation report distinguishes untouched baseline
      findings from findings removed in materially changed constructs.
- [ ] README and command text document canonical paths, precedence, trust, both
      formats, and a manual migration example without runtime old-path support.
- [ ] Repository verification, anti-slop lint, coverage, package dry run, and
      focused local/Git installation checks are run; scoped acceptance does not
      require unrelated baseline diagnostics to be fixed.

## Affected Files

- `extensions/runtime-footer.ts` — canonical path planning, trusted source
  selection, command targets, and deletion of old path support.
- `test/runtime-footer.test.ts` — path, precedence, trust, format, malformed
  authoritative-source, and old-path rejection coverage.
- `README.md` — canonical locations and manual migration.
- `CHANGELOG.md` — user-visible config-location and command-argument breaks.

## Notes

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
