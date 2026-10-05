# Native thinking-bar colors

## Scope
Use native Pi thinking colors in blocks mode for all seven levels, in light,
dark and custom themes. Preserve glyph mappings, literal-mode styling, commands,
settings, package resources and platform limits.

## Decisions
- Pi 1.0.3 `Theme.getThinkingBorderColor` maps levels to dedicated `thinking*`
  tokens; unknown levels use `thinkingOff`. Theme handles optional `thinkingMax`
  fallback to `thinkingXhigh`.
- Use those same tokens with `theme.fg`, rather than the native callback, so
  the existing truncation pipeline also retains the native color. No hardcoded
  palette or new dependencies.

## Acceptance criteria
- [x] All seven levels match native border output in light and dark themes.
- [x] Unknown levels fall back to off; existing normalization is retained.
- [x] Glyphs and literal-mode styling remain unchanged.
- [x] Minimum truncation width preserves configured glyph colors.
- [x] Checks, typecheck, tests, coverage and package validation pass.
- [x] Installation validation and peer/UI review recorded before merge.

## Evidence
- Red: nine native-token tests failed against the original generic palette.
- Green: `npm run verify`, `npm run test:coverage`, `npm run pack:check` pass;
  129 tests, 84.69% line coverage. Manifest and packed resources unchanged.
- Real installed Pi light/dark palettes compare bar ANSI output with
  `getThinkingBorderColor` for all levels, including optional-max fallback.
- Config accepts only single-column block glyphs and minimum truncation width
  is one, so thinking bars cannot currently enter the truncation branch;
  test covers the minimum width instead. Tone propagation remains correct.
- Code review by Pi `openai-codex/gpt-6.1-sol` with high thinking approved
  the code with no blockers; all 129 tests, lint and types independently passed.
  Artifact: `.reviews/task-native-thinking-colors-2026-10-05-223746.md`.
  Optional custom/256-color fixtures are deferred (no new palette logic).
- Human confirmed dark-mode UI appearance and local-path installation.
  Light-mode colors are covered by native ANSI comparisons, not visual approval.
  Human requested code-only review, waiving reviewer screenshot review.
- Human explicitly waived immutable Git installation validation and approved
  squash merge. No immutable installation success is claimed.
