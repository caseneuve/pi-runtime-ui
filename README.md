# pi-runtime-ui

Runtime UI extensions for [Pi](https://pi.dev/), the
[`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

## Resources

The package explicitly exposes these extensions:

- `extensions/branch-status.ts` — shows session-tree divergence and labels in
  the status area.
- `extensions/editor-status.ts` — is the sole owner of the editor component;
  it renders agent/comms status and compact Git worktree stats in the editor
  border.
- `extensions/runtime-footer.ts` — is the sole owner of the custom footer;
  it renders a configurable runtime footer and can show branch status on a
  second line.

The extensions retain their existing event and status contracts. In particular,
`branch-status` writes the `branch-status` status and emits
`branch-status:changed`; `runtime-footer` listens for that event and for the
existing agent-channel events. This package deliberately adds no provider,
plugin, or cross-package integration API.

## Runtime footer configuration

`runtime-footer` looks for configuration in this order:

1. `.pi/runtime-footer.jsonc`
2. `.pi/runtime-footer.json` (legacy)
3. `~/.pi/agent/runtime-footer.jsonc`
4. `~/.pi/agent/runtime-footer.json` (legacy)

Use `/runtime-footer-config` to create/edit the global JSONC file, or
`/runtime-footer-config local` for the project file. The command requires
`$VISUAL` or `$EDITOR`; `project` remains a compatibility alias for `local`.

The default layout is left `cwd`, `git-branch`, `session-notes` and right
`provider`, `model`, `thinking`, `cost`, `context`. Available block IDs are
`cwd`, `project`, `git-branch`, `git-diff`, `git`, `session-notes`, `comms`,
`provider`, `model`, `thinking`, `cost`, and `context`. `git` is the legacy
alias that expands to `git-branch` and `git-diff`.

`status:<key>` renders any non-empty value another extension publishes with
`ctx.ui.setStatus(<key>, value)`. Values are normalized to one display line;
producer styling is preserved, including through ANSI-safe truncation. For
example, `status:kilo-usage-day` reads the `kilo-usage-day` extension status.
Missing or currently empty statuses render nothing. Empty `status:` tokens and
duplicate placement of the same status key are configuration errors.
`session-notes` and `status:session-notes` count as the same placement, and
`status:branch-status` requires `branchStatusLine: false` to avoid duplicating
the legacy second line.

`sep` and `S` are explicit separator pseudo-blocks. When either side contains
one, both sides use explicit separator placement; otherwise the configured
separator (default ` · `) is inserted implicitly between rendered blocks.
`text:<payload>` and `T:<payload>` render inline literals. In
explicit-separator mode, `T:` is spacing-managed and receives no implicit
baseline spaces, while `text:` receives the baseline spacing used for ordinary
blocks; ordinary blocks retain that baseline spacing in explicit mode.
For example, `"left": ["cwd", "sep", "T:(local)", "project"]` places the
literal tightly after the configured separator. Prefix a literal with `?` to
render it only after a non-empty previous non-separator block, or with `!` to
render it only before a non-empty next block. Empty literal payloads and
unknown block IDs are ignored.

`truncate` sets a minimum-one visible-width limit (or `null` to disable it),
and optional `truncateBlocks` limits that behavior to named blocks. `git` in
`truncateBlocks` also matches `git-branch` and `git-diff`. `thinking.mode` is
`literal` (default) or `blocks` with the level-to-glyph `thinking.mapping`;
`context.mode` is `percent` (default), `bar`, or `blocks`, and
`context.barWidth` controls bar width. `branchStatusLine` defaults to `true`.

```jsonc
{
  "left": ["cwd", "git-branch", "session-notes"],
  "right": ["provider", "model", "thinking", "cost", "context"],
  "separator": " · ",
  "truncate": null,
  "truncateBlocks": [],
  "thinking": {
    "mode": "literal",
    "mapping": {
      "off": "▁",
      "minimal": "▂",
      "low": "▃",
      "medium": "▄",
      "high": "▅",
      "xhigh": "▆",
      "max": "█"
    }
  },
  "context": { "mode": "percent", "barWidth": 8 },
  "branchStatusLine": true
}
```

## Install

Install a local checkout while developing:

```bash
pi install ~/git/pi/pi-runtime-ui
```

Install a reviewed immutable release in normal use:

```bash
pi install git:github.com/caseneuve/pi-runtime-ui@<reviewed-tag-or-commit-sha>
```

Use an annotated release tag such as `v2026.7.10`, or a reviewed commit SHA.
Do not use a moving branch name for a reproducible installation.

Pi filters package resources through an object entry in `packages` settings.
Omit a resource key to load everything of that type, use an empty array to
disable it, and use glob or `!` patterns to select or exclude entries:

```json
{
  "packages": [{
    "source": "git:github.com/caseneuve/pi-runtime-ui@<reviewed-tag-or-commit-sha>",
    "extensions": ["extensions/runtime-footer.ts", "extensions/editor-status.ts"]
  }]
}
```

Use `pi config` (or `pi config -l` for project settings) to enable or disable
individual resources. The extensions require a Pi TUI; they gracefully skip
UI installation in non-interactive modes. Git details are available only when
Git is installed and the working directory is a repository.

## Development

This checkout was generated from the private
[`template-pi-package`](https://github.com/caseneuve/template-pi-package)
Copier template. For a clean checkout:

```bash
npm ci
npm run verify
npm run test:coverage
npm run pack:check
```

`npm install` runs `prepare`, which installs the [Prek](https://github.com/j178/prek)
hook when the development dependency is present. Production-only Pi Git
installs skip hook installation safely. Run all hooks explicitly with:

```bash
npx prek run --all-files
```

`npm run check` applies Biome formatting/lint fixes. `npm run check:ci` is the
non-mutating CI equivalent.

## Releases

This project uses npm-compatible CalVer: `YYYY.M.D[.PATCH]` (for example,
`2026.7.10` or `2026.7.10.1`). Before a release:

1. Run `npm run verify`, `npm run test:coverage`, and `npm run pack:check`.
2. Update `CHANGELOG.md` and `package.json` with the release version.
3. Merge approved work to `master`.
4. Create an annotated tag named `v<version>`.
5. Verify `pi install git:github.com/caseneuve/pi-runtime-ui@v<version>` in an
   isolated Pi configuration.

## License

[MIT](LICENSE), Copyright (c) 2026 Caseneuve.
