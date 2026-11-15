# pi-runtime-ui

Runtime UI extensions for [Pi](https://pi.dev/), the
[`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

## Resources

The package explicitly exposes these extensions:

- `extensions/branch-status.ts` — shows session-tree divergence and labels in
  the status area.
- `extensions/editor-status.ts` — is the sole owner of the editor component;
  it preserves Pi’s native activity and hidden-input indicators and adds compact
  Git worktree stats on the right of the editor border. Git decoration is dropped
  when it would crowd native information. It does not render agent identity or
  comms state.
- `extensions/runtime-footer.ts` — is the sole owner of the custom footer;
  it renders footer-owned runtime data and configured extension statuses.

`branch-status` publishes the `branch-status` status through Pi. Runtime-footer
reads producer-owned text only through Pi’s public status map and configured
`status:<key>` tokens; it does not subscribe to producer-specific events or
interpret their state. Editor-status likewise has no agent-channel event or
persistence dependency: agent identity belongs to its producer, and published
name/comms text can be placed in configured footer status tokens. This package
adds no provider, plugin, or cross-package integration API.

## Runtime footer configuration

`runtime-footer` stores its configuration alongside Pi extension resources, not at
the root of a Pi configuration directory. Its canonical candidates are:

| Scope | Canonical candidates, in order |
| --- | --- |
| Project | `<cwd>/<CONFIG_DIR_NAME>/extensions/runtime-footer/config.jsonc`, then `config.json` in that directory |
| Global | `<getAgentDir()>/extensions/runtime-footer/config.jsonc`, then `config.json` in that directory (normally `~/.pi/agent/extensions/runtime-footer/`) |

`CONFIG_DIR_NAME` is Pi's project configuration directory name (normally
`.pi`); `getAgentDir()` is Pi's resolved global agent directory. `.json` is
strict JSON. `.jsonc` additionally accepts comments and trailing commas. JSONC
has precedence over JSON within each scope, and a trusted project source has
precedence over a global source. The first existing candidate is authoritative:
if it is malformed, runtime-footer reports the error and uses defaults instead
of falling through to another file.

Automatic loading honors Pi project trust. When the current project is trusted,
runtime-footer checks project candidates before global candidates. When it is
untrusted, it neither probes nor reads project candidates; global configuration
remains available.

Use `/runtime-footer-config` to create or edit the global configuration, or
`/runtime-footer-config local` for the project configuration. The command
prefers an existing canonical JSONC file, then canonical JSON, and otherwise
creates canonical JSONC. It requires `$VISUAL` or `$EDITOR`. Its only accepted
modes are `global` and `local`; the former `project` alias is no longer
accepted.

An explicit `/runtime-footer-config local` may inspect and create canonical
project files even for an untrusted project. It reports the resolved project
path, but that configuration is not consumed in the current untrusted session;
trust the project and restart Pi, then it loads automatically on the next
startup.

### Manual migration from the removed root-level paths

Runtime support for the removed root-level project paths
`<cwd>/<CONFIG_DIR_NAME>/runtime-footer.jsonc` and `runtime-footer.json`, and
the corresponding global paths `<getAgentDir()>/runtime-footer.jsonc` and
`runtime-footer.json`, has been removed: they are not read, probed, or
automatically migrated. Move an existing file yourself. For example, in a
standard Pi project, migrate JSONC with:

```bash
mkdir -p .pi/extensions/runtime-footer
mv .pi/runtime-footer.jsonc .pi/extensions/runtime-footer/config.jsonc
```

For JSON, use `config.json` as the destination instead. To migrate the
standard global JSONC file, run:

```bash
mkdir -p ~/.pi/agent/extensions/runtime-footer
mv ~/.pi/agent/runtime-footer.jsonc ~/.pi/agent/extensions/runtime-footer/config.jsonc
```

For a rebranded Pi distribution, substitute its `CONFIG_DIR_NAME` and resolved
`getAgentDir()` location for `.pi` and `~/.pi/agent`.

The default layout is left `cwd`, `git-branch` and right `provider`, `model`,
`thinking`, `cost`, `context`. Available block IDs are `cwd`, `project`,
`git-branch`, `git-diff`, `provider`, `model`, `thinking`, `cost`,
and `context`.

**Breaking:** the legacy `git` shorthand has been removed. Use explicit
`git-branch` and `git-diff` blocks instead. `git` is now an unknown token and
renders nothing.

`status:<key>` renders any non-empty value another extension publishes with
`ctx.ui.setStatus(<key>, value)`. Values are normalized to one display line;
producer styling is preserved, including through ANSI-safe truncation. For
example, `status:kilo-usage-day` reads the `kilo-usage-day` extension status.
Missing or currently empty statuses render nothing. Empty `status:` tokens and
duplicate placement of the same status key are configuration errors.

**Breaking:** named `comms` and `session-notes` blocks and the automatic branch
status second line have been removed. Replace them with `status:comms`,
`status:session-notes`, and `status:branch-status` wherever you want those
producer statuses in your layout. The producer must publish the corresponding
key; the footer does not infer it. Remove `branchStatusLine` from existing
configuration—it is now ignored. No automatic migration or fallback is provided.

`sep` and `S` are explicit separator pseudo-blocks. When either side contains
one, both sides use explicit separator placement; otherwise the configured
separator (default ` · `) is inserted implicitly between rendered blocks.

Inline literals deliberately have two spacing forms:

- `text:<payload>` has ordinary block spacing.
- `T:<payload>` manages its adjacent spacing, so it can join text tightly in
  explicit-separator layouts.

All literal forms are retained: `text:`, `T:`, `?text:`, `!text:`, `?T:`, and
`!T:`. `?` requires a non-empty previous non-separator token; `!` requires a
non-empty next non-separator token. Unknown tokens retain their position for
these conditional checks but render nothing. For example,
`"left": ["cwd", "sep", "T:(local)", "project"]` places the literal tightly
after the configured separator. Empty literal payloads render nothing.

`truncate` sets a minimum-one visible-width limit (or `null` to disable it),
and optional `truncateBlocks` limits that behavior to exact block or DSL
selectors. `git` in `truncateBlocks` has no special meaning and does not match
`git-branch` or `git-diff`. `thinking.mode` is
`literal` (default) or `blocks` with the level-to-glyph `thinking.mapping`;
`context.mode` is `percent` (default), `bar`, or `blocks`, and
`context.barWidth` controls bar width.

```jsonc
{
  "left": ["cwd", "git-branch"],
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
  "context": { "mode": "percent", "barWidth": 8 }
}
```

## Install

Requires Node >=22.19.0; compatibility is checked against Pi 1.5.2 with exact
development pins for the imported host APIs and `"*"` host peers. TypeBox is a
test-only dependency, not a runtime requirement.

Install a reviewed local checkout natively:

```bash
pi install /absolute/path/to/pi-runtime-ui     # personal
pi install -l /absolute/path/to/pi-runtime-ui  # current project
```

Local directories load in place; Pi does not install or modify their dependency
trees. Run `npm ci` in the checkout separately for development/tests. Project-local
packages load only after project trust is granted. If the local install command
refuses an untrusted project, review its configuration, then use
`pi install -l --approve /absolute/path/to/pi-runtime-ui` for that operation.
Avoid retaining broad extension loaders or another checkout of the same package:
local paths and Git sources are distinct identities and can double-load owners.

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
Copier template. The portable baseline was manually adopted from template master
`08350707812e7036ab9477e879c1b029febd552b` (local, unpushed at adoption), not by a
Copier update. `.copier-answers.yml` retains historical generation revision
`2842902` and records the current API answer; it does not claim that baseline SHA
is remotely available. The template is not a runtime or public CI dependency.
For a clean checkout:

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
non-mutating CI equivalent. `npm run verify` runs Biome, typechecking, and tests
without requiring local-only tooling.

Extra local anti-slop review uses the author's existing central runner separately,
on an explicit file set. Do not provision a package-local plugin, vendor rules,
or add private tooling paths to package scripts/CI.

## Ownership and updates

Resources, tests, metadata/lockfile, README, changelog and `AGENTS.md` belong to
this repository. Shared template tooling updates are opt-in reviewed diffs;
preserve package-specific coverage and behavior. Apply metadata/pin/instruction
changes manually; resource answers are not an update-time resource manager.

`pi update` updates Pi itself; `pi update --extensions` reconciles installed
packages, not Copier tooling or local checkout dependencies. Git tags/commit
sources remain pinned. `.pi/*` settings/state are ignored; intentionally shared
`.pi/docs/` notes may be tracked. Git ignores and npm's explicit `files` allowlist
are separate: only extensions, the lifecycle helper and package documentation
ship; tests, todos and local configuration do not.

## Releases

Use three-component unpadded CalVer `YYYY.M.D` (for example, `2026.7.10`).
Agree on valid npm SemVer before a second same-day release; never append a fourth
numeric component. Before a release:

1. Run `npm run verify`, `npm run test:coverage`, and `npm run pack:check`.
2. Update `CHANGELOG.md` and `package.json` with the release version.
3. Merge approved work to `master`.
4. Create an annotated tag named `v<version>`.
5. Verify `pi install git:github.com/caseneuve/pi-runtime-ui@v<version>` in an
   isolated Pi configuration.

## License

[MIT](LICENSE), Copyright (c) 2026 Caseneuve.
