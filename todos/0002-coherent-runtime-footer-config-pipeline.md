---
title: coherent runtime footer config pipeline
status: open
priority: high
type: refactor
labels: []
created: 2026-09-12
parent: null
blocked-by: [0001]
blocks: []
---

## Context

Runtime-footer configuration grew incrementally. Raw token strings are
reinterpreted in several helpers, `git` normalization leaves unreachable
combined-Git rendering, and config parsing is mixed into filesystem/cache code.
The compact separator and literal DSL is intentional and must remain.

Apply FCIS narrowly to configuration: the shell reads the selected file, one
pure function parses and compiles it into the configuration consumed by the
footer, and the shell caches the result or reports the diagnostic. Prefer less
code over extra architectural layers.

## Acceptance Criteria

- [ ] The primary pure boundary is one behavior-level contract equivalent to
      `compileConfig(source, format): Result<CompiledConfig, Diagnostic>`.
- [ ] Filesystem reads, stat/mtime checks, clock access, cache mutation, and UI
      notifications remain outside that pure function.
- [ ] Do not introduce separately exposed AST and render-plan layers. Small
      private helpers or a discriminated token type are allowed only where they
      remove duplicated interpretation or branches.
- [ ] `.json` uses strict JSON parsing and `.jsonc` alone accepts comments and
      trailing commas.
- [ ] The sanctioned untrusted-data boundary is small and explicit: JSON parsing
      returns a named recursive `JsonValue` domain; the unavoidable assertion at
      `JSON.parse` is immediately justified by a `SAFETY:` comment that the
      parser only returns JSON-grammar values; decoder helpers accept
      `JsonValue`, not `unknown`.
- [ ] Put the small pure decoder/compiler in
      `extensions/shared/runtime-footer-config.ts`. Configure an Oxlint override
      for that file alone with `anti-slop/no-runtime-typeof` set to
      `["error", { "allowInTypeGuards": true }]`; the repository-wide rule
      remains unchanged. Representation checks are confined to small typed
      predicates that establish `JsonValue` domain variants. Do not add a schema
      dependency or scatter lint suppressions to satisfy this boundary.
- [ ] Each layout token is classified once for downstream use. Unknown tokens
      retain their position as ignored/non-renderable tokens so conditional
      literal adjacency behaves exactly as it does now.
- [ ] Preserve the complete intentional DSL: `sep`, `S`, `text:`, `T:`,
      `?text:`, `!text:`, `?T:`, `!T:`, and `status:<key>`.
- [ ] Model `text:` and `T:` according to their actual different spacing
      behavior rather than describing them as equivalent aliases.
- [ ] Preserve both implicit- and explicit-separator behavior. Simplify their
      implementation only if doing so reduces code without changing output;
      do not add a normalization subsystem solely to force one renderer path.
- [ ] Remove the legacy `git` expansion and unreachable combined-Git renderer.
      A layout token `git` then follows the normal unknown-token policy and is
      safely ignored; `git` in `truncateBlocks` has no special effect.
- [ ] Preserve `git-branch` and `git-diff` as ordinary supported blocks.
- [ ] Preserve the following field behavior explicitly:
      - non-object root: diagnostic;
      - absent or non-array `left`/`right`: use that side's default;
      - non-string side entries: omit while retaining the position semantics of
        string tokens that compile as ignored;
      - string `separator`: normalize tabs; otherwise use the default;
      - finite numeric `truncate >= 1`: floor it; otherwise disable/default it;
      - array `truncateBlocks`: keep trimmed non-empty strings; an absent,
        non-array, or effectively empty value means all blocks are eligible;
      - `thinking.mode`: accept `blocks`, otherwise use `literal`;
      - `thinking.mapping`: apply entries with non-empty normalized keys and
        supported glyph values; ignore invalid entries;
      - `context.mode`: accept `bar` or `blocks`, otherwise use `percent`;
      - finite numeric `context.barWidth >= 1`: floor it; otherwise use `8`;
      - boolean `branchStatusLine`: use it; otherwise use `true`;
      - unknown object properties: ignore them;
      - empty `status:` and duplicate logical status placements: diagnostic.
- [ ] Config errors use the valid default configuration and notify once per
      unchanged error episode; a successful read clears the episode so a later
      recurrence can notify again.
- [ ] Do not refactor process/environment access, Git execution, Pi context, or
      theme/styling dependencies unless a concrete simplification is required
      by the config boundary.
- [ ] Newly added or materially modified parser/compiler helpers and statements
      satisfy the anti-slop rules; eliminate `unknown` propagation, widening,
      unjustified assertions, and ad hoc representation branching in those
      constructs. Calling the existing large file or extension factory does not
      pull unrelated baseline findings into scope.
- [ ] Prefer deletion and inferred/named types over wrappers, casts, or
      abstractions added only to silence lint. Apart from the justified
      `JSON.parse` boundary, do not improve an old helper first if the coherent
      pipeline deletes it.
- [ ] Newly added or materially modified test cases satisfy the anti-slop rules
      without requiring cleanup of unrelated cases in the shared test file and
      without weakening assertions or adding broad mock/type escape hatches.
- [ ] Favor behavior-focused tests of `compileConfig` and footer output. Do not
      require tests for private decomposition stages.
- [ ] Regression tests cover unknown-token conditional adjacency, retained DSL
      forms, strict JSON versus JSONC, field behavior above, `git` becoming an
      ignored token, `truncateBlocks: ["git"]` losing special semantics, and
      notification recovery.
- [ ] README documents the retained DSL accurately and notes removal of the
      legacy `git` shorthand.
- [ ] The anti-slop run introduces no new diagnostic identity, compared by
      rule, file, message, and source construct rather than raw count or line
      number. It leaves no diagnostics in newly added or materially modified
      parser/compiler constructs or test cases; untouched baseline findings are
      reported separately.
- [ ] Repository verification, anti-slop lint, coverage, package dry run,
      focused installation checks, and screenshot review are run; scoped
      acceptance does not require unrelated baseline diagnostics to be fixed.

## Affected Files

- `extensions/shared/runtime-footer-config.ts` — small pure JSON/JSONC decoder
  and config compiler with named domain types.
- `extensions/runtime-footer.ts` — thin I/O/cache consumer, token rendering
  cleanup, and deletion of combined-Git residue.
- `test/runtime-footer.test.ts` — behavior-level compile and render regressions.
- `README.md` — accurate DSL semantics and `git` shorthand removal.
- `CHANGELOG.md` — parser cleanup and user-visible `git` removal.
- `oxlint.config.ts` — file-scoped permission for representation checks inside
  typed guards in the dedicated config decoder/compiler only.

## E2E Spec

GIVEN equivalent JSONC configs using long and compact separator/literal forms
WHEN runtime-footer compiles and renders them
THEN the existing DSL behavior and visible output are preserved
AND each token is classified once rather than reparsed by multiple helpers.

GIVEN `['cwd', 'unknown', '?text:x']`
WHEN it is compiled and rendered
THEN the unknown token retains its non-renderable position
AND the conditional literal remains hidden as before.

GIVEN a config containing the removed `git` token
WHEN it is compiled
THEN `git` is treated like any other unknown block and renders nothing
AND no compatibility expansion or combined-Git branch executes.

## Notes

- `S` and the `T:` family are intentional DSL, not legacy migration support.
- FCIS applies to config input and transformation here, not as a mandate to
  redesign the entire footer around ports and adapters.
- Choose the smallest implementation that establishes the pure compile boundary
  and deletes more duplicated/obsolete code than it adds.
- Scoped quality rule: fix anti-slop patterns in code this item touches. Do not
  polish code that the same refactor will delete, and do not broaden cleanup to
  unrelated footer, extension, or test code.
- The recorded baseline before these items is 50 diagnostics across seven files.
  The decoder rule option is scoped to a new file, so it does not alter that
  baseline before source changes; use the baseline for construct-identity
  comparison rather than treating unrelated cleanup as hidden scope.
- Ordered rows and other schema expansion remain out of scope.
