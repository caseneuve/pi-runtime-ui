# Changelog

## [Unreleased]

### Added

- `branch-status`, `editor-status`, and `runtime-footer` extensions with their
  shared Git-status and external-editor helpers.
- Migrated runtime-footer behavior, external-editor, and runtime UI ownership tests.
- Generic `status:<key>` runtime-footer blocks for values published by other extensions.

### Changed

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
