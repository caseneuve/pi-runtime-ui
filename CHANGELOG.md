# Changelog

## [Unreleased]

### Added

- `branch-status`, `editor-status`, and `runtime-footer` extensions with their
  shared Git-status and external-editor helpers.
- Migrated runtime-footer behavior, external-editor, and runtime UI ownership tests.
- Generic `status:<key>` runtime-footer blocks for values published by other extensions.

### Changed

- Normalize extension statuses to one ANSI-safe line and reject malformed or duplicate status placements.
