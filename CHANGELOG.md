# Changelog

## [Unreleased]

### Added

- `branch-status`, `editor-status`, and `runtime-footer` extensions with their
  shared Git-status and external-editor helpers.
- Migrated runtime-footer behavior, external-editor, and runtime UI ownership tests.
- Generic `status:<key>` runtime-footer blocks for values published by other extensions.

### Changed

- **Breaking:** Editor-status no longer renders fallback or persisted agent names
  or comms icons. It preserves Pi’s native working, retry, compaction,
  branch-summary and hidden-input indicators, with right-hand Git stats when
  space permits. Agent identity/comms belong to their producer; published values
  can be displayed through configured footer `status:<key>` tokens.

- **Breaking:** Removed named `comms` and `session-notes` footer blocks and the
  automatic branch-status second line / `branchStatusLine` setting. Configure
  `status:comms`, `status:session-notes`, or `status:branch-status` explicitly;
  their producers own the status text and clearing. Removed footer subscriptions
  to producer events and the redundant `branch-status:changed` producer event.
- Updated pinned development Pi APIs to 1.0.3; wildcard host peers are unchanged.

- **Breaking:** Moved runtime-footer configuration from root-level Pi config
  paths to the canonical project and global extension-resource directories.
  Both JSONC and JSON remain supported; automatic project loading is
  trust-filtered, and old paths have no runtime fallback or automatic
  migration.
- **Breaking:** `/runtime-footer-config project` is no longer accepted; use
  `/runtime-footer-config local`.
- Normalize extension statuses to one ANSI-safe line and reject malformed or duplicate status placements.
- Runtime-footer configuration now has one pure strict JSON/JSONC compiler
  before rendering and I/O. `.json` remains strict; `.jsonc` alone accepts
  comments and trailing commas.
- **Breaking:** Removed the runtime-footer `git` shorthand and its combined-Git
  rendering. Configure `git-branch` and `git-diff` explicitly; `git` is
  ignored, including in `truncateBlocks` where it no longer matches either
  block.
