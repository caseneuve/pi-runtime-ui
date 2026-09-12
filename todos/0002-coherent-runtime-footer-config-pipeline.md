---
title: coherent runtime footer config pipeline
status: done
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

- [x] The primary pure boundary is one behavior-level contract equivalent to
      `compileConfig(source, format): Result<CompiledConfig, Diagnostic>`.
- [x] Filesystem reads, stat/mtime checks, clock access, cache mutation, and UI
      notifications remain outside that pure function.
- [x] Do not introduce separately exposed AST and render-plan layers. Small
      private helpers or a discriminated token type are allowed only where they
      remove duplicated interpretation or branches.
- [x] `.json` uses strict JSON parsing and `.jsonc` alone accepts comments and
      trailing commas.
- [x] The sanctioned untrusted-data boundary is small and explicit: JSON parsing
      returns a named recursive `JsonValue` domain; the unavoidable assertion at
      `JSON.parse` is immediately justified by a `SAFETY:` comment that the
      parser only returns JSON-grammar values; decoder helpers accept
      `JsonValue`, not `unknown`.
- [x] Put the small pure decoder/compiler in
      `extensions/shared/runtime-footer-config.ts`. Configure an Oxlint override
      for that file alone with `anti-slop/no-runtime-typeof` set to
      `["error", { "allowInTypeGuards": true }]`; the repository-wide rule
      remains unchanged. Representation checks are confined to small typed
      predicates that establish `JsonValue` domain variants. Do not add a schema
      dependency or scatter lint suppressions to satisfy this boundary.
- [x] Each layout token is classified once for downstream use. Unknown tokens
      retain their position as ignored/non-renderable tokens so conditional
      literal adjacency behaves exactly as it does now.
- [x] Preserve the complete intentional DSL: `sep`, `S`, `text:`, `T:`,
      `?text:`, `!text:`, `?T:`, `!T:`, and `status:<key>`.
- [x] Model `text:` and `T:` according to their actual different spacing
      behavior rather than describing them as equivalent aliases.
- [x] Preserve both implicit- and explicit-separator behavior. Simplify their
      implementation only if doing so reduces code without changing output;
      do not add a normalization subsystem solely to force one renderer path.
- [x] Remove the legacy `git` expansion and unreachable combined-Git renderer.
      A layout token `git` then follows the normal unknown-token policy and is
      safely ignored; `git` in `truncateBlocks` has no special effect.
- [x] Preserve `git-branch` and `git-diff` as ordinary supported blocks.
- [x] Preserve the following field behavior explicitly:
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
- [x] Config errors use the valid default configuration and notify once per
      unchanged error episode; a successful read clears the episode so a later
      recurrence can notify again.
- [x] Do not refactor process/environment access, Git execution, Pi context, or
      theme/styling dependencies unless a concrete simplification is required
      by the config boundary.
- [x] Newly added or materially modified parser/compiler helpers and statements
      satisfy the anti-slop rules; eliminate `unknown` propagation, widening,
      unjustified assertions, and ad hoc representation branching in those
      constructs. Calling the existing large file or extension factory does not
      pull unrelated baseline findings into scope.
- [x] Prefer deletion and inferred/named types over wrappers, casts, or
      abstractions added only to silence lint. Apart from the justified
      `JSON.parse` boundary, do not improve an old helper first if the coherent
      pipeline deletes it.
- [x] Newly added or materially modified test cases satisfy the anti-slop rules
      without requiring cleanup of unrelated cases in the shared test file and
      without weakening assertions or adding broad mock/type escape hatches.
- [x] Favor behavior-focused tests of `compileConfig` and footer output. Do not
      require tests for private decomposition stages.
- [x] Regression tests cover unknown-token conditional adjacency, retained DSL
      forms, strict JSON versus JSONC, field behavior above, `git` becoming an
      ignored token, `truncateBlocks: ["git"]` losing special semantics, and
      notification recovery.
- [x] README documents the retained DSL accurately and notes removal of the
      legacy `git` shorthand.
- [x] The anti-slop run introduces no new diagnostic identity, compared by
      rule, file, message, and source construct rather than raw count or line
      number. It leaves no diagnostics in newly added or materially modified
      parser/compiler constructs or test cases; untouched baseline findings are
      reported separately.
- [x] Repository verification, anti-slop lint, coverage, package dry run,
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

## Implementation Plan

Work proceeds on `refactor/coherent-runtime-footer-config-pipeline` in reviewed
TDD checkpoints. Each implementation slice uses separate RED, GREEN, and
REFACTOR commits; the lead reviews repository state and acceptance coverage
before authorizing the next slice.

1. **Pure compiler contract:** add behavior tests for strict JSON/JSONC parsing,
   all field defaults/normalization/diagnostics, retained DSL forms, one-time
   token classification, unknown-token positions, and removed `git` semantics;
   implement `compileConfig(source, format)` and its named JSON domain in
   `extensions/shared/runtime-footer-config.ts`; then simplify the private
   decoder/compiler without adding public intermediate layers.
2. **Compiled rendering pipeline:** add footer-output regressions for implicit
   and explicit separators, the distinct `text:`/`T:` spacing rules,
   conditional adjacency through unknown tokens, ordinary `git-branch` and
   `git-diff`, ignored `git`, and `truncateBlocks: ["git"]`; switch rendering
   to compiled tokens and delete repeated token parsing, legacy expansion,
   combined-Git rendering, and special Git truncation matching.
3. **I/O/cache integration:** add adapter-level tests proving selected format is
   passed to the compiler, errors use defaults, unchanged error episodes notify
   once, success clears an episode, and recurrence notifies again; keep reads,
   stat/mtime, clock, cache mutation, and notifications in the shell while
   deleting the old parsing path.
4. **User contract and hardening:** update generated config text, README,
   CHANGELOG, and the single-file Oxlint override; add any missing
   behavior-focused regressions, run scoped anti-slop identity comparison and
   full repository/package/install verification, then perform screenshot
   review.
5. Spawn an independent reviewer to evaluate the completed branch against this
   todo and `AGENTS.md`; address findings in new commits and request approval
   before merge.

Baseline recorded before implementation: `npm run verify` passes with 55 tests;
anti-slop reports the known 50 diagnostics across seven files. Findings in the
old parser/token helpers are scheduled for deletion rather than preliminary
cleanup.

## Acceptance-Criteria Matrix (post-`d6d9071`)

| Requirement group | Evidence | Status |
| --- | --- | --- |
| Pure compiler, named JSON boundary, strict JSON/JSONC, field defaults and diagnostics | `extensions/shared/runtime-footer-config.ts`; `test/runtime-footer-config.test.ts` | covered |
| One-time token classification, retained DSL, ignored positions, removed `git` semantics | compiler token domain; `test/runtime-footer-config.test.ts` | covered |
| Implicit/explicit separators, distinct `text:`/`T:` spacing, conditional adjacency, ordinary Git blocks and exact truncation selectors | `extensions/runtime-footer.ts`; `test/runtime-footer-compiled-rendering.test.ts` | covered |
| Shell-only filesystem/cache/notification behavior, selected format, fallback and error-episode recovery | `readFooterConfig`/footer adapter; `test/runtime-footer.test.ts`, `test/runtime-footer-adapter.test.ts` | covered |
| File-only Oxlint typed-guard override | `oxlint.config.ts` | covered; verify scope unchanged |
| Generated config text and public/release documentation | `defaultConfigText`, `README.md`, `CHANGELOG.md` | updated in final hardening |
| Package, installation, anti-slop identity, coverage, and visible TUI review | final hardening commands/manual review | covered; human approved both formats and waived screenshot capture |

No additional behavior test is needed before documentation: the approved compiler, rendering, and adapter suites cover the recorded behavior-level contract. This final slice corrects user-facing text and records hardening evidence.

## Final Hardening Evidence

- `npm run verify` passed after review follow-up: 7 files, 67 tests.
- `npm run test:coverage` passed. The new compiler is 97.51% statements,
  95.97% branches, and 100% functions; repository totals are recorded by the
  command without introducing coverage thresholds.
- `npm run pack:check` passed and includes the manifest-listed extensions and
  `extensions/shared/runtime-footer-config.ts` (11 packed files).
- `npx prek run --all-files` passed.
- The Oxlint override remains exactly one `files` entry for
  `extensions/shared/runtime-footer-config.ts`, enabling typed-guard `typeof`
  checks only; the repository-wide rule remains `error`.
- A normalized anti-slop comparison against a detached `31c0d81` worktree used
  rule, file, message, and trimmed reported source construct as identity. It
  found 45 baseline identities and 18 current identities: zero added and 27
  removed. The todo's recorded raw baseline remains 50 diagnostics; duplicate
  raw reports collapse under identity normalization.
- Isolated local `pi install /home/piotr/git/pi/pi-runtime-ui` passed. An
  isolated temporary bare repository served over local HTTP installed immutable
  commit `e054a63` by its full SHA successfully. The installed checkout was at
  that exact SHA, exposed the manifest's `runtime-footer.ts` resource and its
  shared compiler, and had no production dependencies or development-only
  `@biomejs` installation. The HTTP server, bare repository, and isolated Pi
  home were removed after the check.
- The automated pseudo-terminal attempt confirmed Pi 0.85.1 and extension
  loading but could not capture the configured footer. Final human TUI review
  instead used the dedicated project described below; screenshot capture was
  explicitly waived.
- README and CHANGELOG received an author self-cold-read. The independent
  reviewer then completed the fresh-reader pass with no UX findings.
- Independent code review approved the implementation in
  `.reviews/refactor-coherent-runtime-footer-config-pipeline-2026-09-12-191016.md`.
  Its only Minor finding, retained status-rendering test depth, was resolved in
  `b5605f0` and approved in follow-up review
  `.reviews/refactor-coherent-runtime-footer-config-pipeline-2026-09-12-191246.md`.
- Human TUI validation used `/tmp/pi-runtime-ui-visual-review`, with this local
  checkout installed project-locally and the current runtime-footer config
  copied to the canonical project path. Both JSONC and JSON configurations were
  checked successfully. The human explicitly waived screenshot capture and
  approved the visual result.

## Slice 2–3 Approved Departure

- The planned compiled-renderer and I/O/cache slices are implemented together as one vertical slice. `CompiledConfig` now changes layout tokens from strings to discriminated tokens, so a temporary raw-token adapter would duplicate parsing and violate the intended one-time classification boundary. This approved scope retains separate RED, GREEN, and REFACTOR checkpoints.

## Lead Review Follow-up

- Restore global explicit-separator mode by passing the already-classified cross-side mode into rendering; do not inspect or reparse raw tokens.
- Retain each classified text/status token's raw selector metadata so exact `truncateBlocks` matching remains possible without a second DSL parser. `git` receives no special selector behavior.
- Keep `readText` failure handling in the I/O shell: convert it to the same fallback diagnostic path as compiler failures.

## Slice 1 Decisions

- The public pure boundary returns a discriminated `Result` with either a compiled value or one diagnostic; `CompiledConfig` owns classified layout tokens, so later rendering can consume them without reparsing raw DSL strings.
- This slice is intentionally isolated from `runtime-footer.ts`: no filesystem/cache/rendering integration, generated-config text, README, or changelog changes occur here.
- `git` is classified as an ignored token, not expanded; its retained position is part of the compiler contract.
- JSONC comment stripping replaces each comment with a lexical boundary and reports unterminated block comments, preventing comments from joining otherwise separate JSON tokens.

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
