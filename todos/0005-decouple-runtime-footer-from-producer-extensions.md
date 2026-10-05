---
title: decouple runtime footer from producer extensions
status: done
priority: high
type: refactor
labels: []
created: 2026-09-13
parent: null
blocked-by: []
blocks: []
---

## Context

`runtime-footer` currently treats agent-channel comms and the separate
`branch-status` extension as built-in footer blocks. It subscribes to their
producer-specific events, decodes the comms payload, owns a `commsActive` state,
and gives `branch-status` a second-line rendering path. That couples the footer
to extensions which own neither its configuration nor its rendering policy.

The footer must instead be a consumer of Pi's public extension-status data.
Each producer owns its state, events, persistence, and status text, and exposes
that text through `ctx.ui.setStatus(key, text)`; a user opts into it with
`status:<key>` in footer configuration.

## Acceptance Criteria

- [x] Before consumer-side removal begins, verify that the peer agent-channel
      repository/revision independently owns comms presentation: it publishes
      the active state with `ctx.ui.setStatus("comms", text)` and clears that
      status when inactive, without requiring runtime-footer events or payload
      decoding. Record the repository, immutable revision, and focused
      verification evidence here.
- [x] If that peer producer contract is absent, incompatible, or unverified,
      this item is blocked. Do not retain or add a runtime-footer compatibility
      shim, fallback event subscription, payload decoder, or locally inferred
      comms state.
- [x] Runtime-footer consumes extension-owned values solely through
      `footerData.getExtensionStatuses()` and configured `status:<key>` tokens.
      It has no named `comms` block, `agent-channel:*` event subscription,
      agent-channel payload schema/decoder, or producer-specific comms state.
- [x] Runtime-footer has no `branch-status` special rendering, event
      subscription, duplicate-placement exception, or `branchStatusLine`
      configuration. `branch-status` remains an ordinary producer status,
      selected only with `status:branch-status`.
- [x] The generic status-token behavior remains: arbitrary non-empty status
      keys render their producer text; absent/empty values render nothing;
      ANSI-safe normalization and configured truncation continue to work; and
      duplicate configured `status:<key>` placements remain diagnostics.
- [x] Default configuration, generated configuration text, README, CHANGELOG,
      command/config documentation, and tests list only footer-owned built-in
      blocks plus generic `status:<key>` usage. They do not name agent-channel
      or another producer as a footer block.
- [x] Tests prove runtime-footer registers no agent-channel or branch-status
      event listener, does not decode producer payloads, and renders/clears
      `status:comms` and `status:branch-status` from the status map only.
- [x] Verify the pinned Pi API contract supports status-producer-driven refresh
      for the custom footer. Run focused producer/consumer integration or
      manual TUI validation showing status changes appear and clear without a
      producer-specific footer event.
- [x] `npm run verify`, `npm run test:coverage`, `npm run pack:check`, and
      `npx prek run --all-files` pass. Run focused isolated local installation;
      record any peer-repository integration validation separately.
- [x] Independent review approves the change against this todo and `AGENTS.md`.

## Affected Files

- `extensions/runtime-footer.ts` — remove producer-specific comms and
  branch-status integration; retain generic status rendering only.
- `extensions/shared/runtime-footer-config.ts` — remove `comms` and
  `branchStatusLine` configuration semantics while retaining generic status
  tokens.
- `extensions/branch-status.ts` — remove its runtime-footer-only render event
  if no longer needed; retain its producer-owned status publication.
- `test/runtime-footer*.test.ts` — replace producer-event coverage with generic
  status-map behavior and no-subscription regressions.
- `test/branch-status.test.ts` — adjust only if its producer event contract is
  removed.
- `README.md` and `CHANGELOG.md` — document generic status consumption and
  remove producer-specific footer blocks.
- Peer agent-channel repository — publish and clear the `comms` status; its
  concrete repository and immutable revision must be recorded before this
  repository removes its consumer coupling.

## E2E Spec

GIVEN the peer agent-channel extension publishes `comms` with `ctx.ui.setStatus`
WHEN a footer layout contains `status:comms`
THEN the footer renders that status text and clears it when the producer clears
its status
AND runtime-footer has no agent-channel event listener or comms payload logic.

GIVEN branch-status publishes its existing status
WHEN a footer layout contains `status:branch-status`
THEN the footer renders it as an ordinary generic status
AND no special second line or producer-specific footer event is used.

## Implementation Plan and Coordination

1. Preserve the inherited uncommitted removal of the `session-notes` named
   block/alias and default placement; keep `status:session-notes` generic.
   Add explicit removal regressions and release documentation in this item.
2. Upgrade development Pi pins in 0006 before consumer changes.
3. External producer work is delegated to Herdr `comms-producer` in
   `/home/piotr/git/pi/pi-agent-channel`, GPT 6.1 Sol / medium. Require active
   `comms` publication and inactive clearing at initialization and toggles,
   preserving events/persistence for other consumers, focused tests, and an
   immutable reviewed commit. Do not remove consumer coupling until verified.
4. Delete footer comms state/events/decoder/block and branch-status second-line
   config/rendering/duplicate exception. Preserve generic statuses and all
   footer-owned blocks/DSL. Remove redundant branch producer render events only
   after checking other consumers; preserve bookmark-driven refresh.
5. Prove status-only rendering/clearing and absent producer subscriptions;
   run full validation, isolated installation and TUI/screenshot review,
   independent review, then request approval before merge.

Work branch: `refactor/decouple-runtime-footer`. Editor-status producer coupling
is explicitly out of scope; no automatic config migration or compatibility shim.

### Producer prerequisite investigation

- Repository: `git@github.com:caseneuve/pi-agent-channel.git`.
- Inspected clean revision: `cb2db3d602bb711b3374ab5c848677c6840d6f93`.
- `extensions/agent-channel/index.ts` emits/persists comms state but does not
  publish a `comms` status. Existing `agent-comms` is an inactive/off message
  updated in the toggle path. This revision does not meet the prerequisite.
- Candidate producer branch: `0004-producer-owned-comms-status`, immutable
  revision `ca451167b0a022477400b1d29d7b7ec2d9ab2456`. Lead inspected its diff
  and tests and independently ran `bun test
  extensions/agent-channel/comms-status.test.ts`: 8 passed, 48 assertions.
  It publishes `comms` as `📡` when active, clears with `undefined` when
  inactive, reasserts before asynchronous session initialization and clears
  on shutdown. Command/shortcut/idempotent/session lifecycle coverage exists.
  Existing events/persistence and `agent-comms` behavior remain untouched.
- Final reviewed handoff verified before consumer removal:
  `b382cd1f3c666236671b1e8eb6940421e326daa9`, tracked tree clean. Lead reran
  the focused command above at this exact HEAD: 8 pass / 48 assertions.
  Reviewed `.reviews/0004-producer-owned-comms-status-2026-10-05-204747.md`
  in the producer repository: independent code approval, no findings; final
  revision changes only todo evidence after the inspected implementation.
  This satisfies the producer prerequisite. Consumer/producer TUI refresh and
  screenshot validation remain pending, not implied by code approval.
  Neither repository is authorized to merge/push.

## Final Consumer Evidence

- Immutable implementation: `93b99ad24e49e1b0f4238e8ae63c40f0066f84a6`.
  RED `115cd2a` recorded five expected config/adapter failures before removal;
  GREEN `b34bcdf` passed 90 tests. Branch-status RED `94e033e` expected the
  redundant event regression to fail; GREEN `39f874a` also repaired the test
  fixture typing and passed 92 tests. Documentation checkpoint `93b99ad`.
- `npm run verify` passes: 92 tests / 9 files, types, Biome and zero anti-slop
  diagnostics. A subsequent clean `npm ci` followed by verify also passes
  using this checkout's existing ignored anti-slop tooling (see 0006 caveat).
- `npm run test:coverage` passes: 79.04% statements, 73.33% branches; branch
  producer coverage is 98% statements / 100% functions. Generic ANSI/OSC
  normalization/truncation coverage is retained.
- `npm run pack:check`: 11 expected files, explicit resource manifest unchanged.
  `npx prek run --all-files` passes. Local isolated install/list passes.
- Immutable Git install validation served a temporary bare repository over
  loopback HTTP and installed full implementation SHA `93b99ad...` in an
  isolated agent directory. Verified exact checkout SHA, manifest resource
  paths, absence of development tools, and installed-extension RPC
  `get_commands` discovery of `runtime-footer-config`. Temporary server,
  repository, agent directory and RPC process were cleaned up. Initial URL
  with a one-segment repository path was rejected by Pi; rerun used the
  supported two-segment `owner/repo.git` URL. No public push was required.
- Independent GPT 6.1 Sol / medium review approved code and screenshot/UI
  integration with no findings in
  `.reviews/refactor-decouple-runtime-footer-2026-10-05-205605.md`. Dependency
  checkpoint approval is separately recorded in 0006. No merge authorized.

### Shared actual TUI / screenshot validation

Pi 1.0.3 loaded consumer `93b99ad...`, real branch-status and reviewed peer
producer `b382cd1...` in an actual Alacritty window. Fresh HOME and
PI_CODING_AGENT_DIR, absent relay socket, no HTTP configuration, file-channel
fallback under temporary HOME; normal settings, credentials and channel files
were not used. Configured left tokens were `text:status consumer`,
`status:comms`, `status:branch-status`, `status:probe`; right was empty.

- Startup: literal only; `/comms on`: satellite appears; Alt+M: clears.
- An isolated probe command calls only public `setStatus("probe", ANSI text)`
  or `undefined`, with no event emission. Green generic text appears/clears.
- A probe command uses public `ctx.newSession` setup and real SessionManager
  branching/labels. Actual branch-status publishes `[⋔ Integration]` on the
  configured ordinary line; an unbranched new session clears it.
- New-session setup recreates extension runtime (existing producer semantics);
  comms was explicitly reenabled afterward for the combined-state check.
- Combined screenshot: satellite + branch label + styled generic text on one
  footer line; generic clear preserves comms/branch; Alt+M clear preserves
  branch; branch/final clear leave only the literal, without stale separators
  or leaked styling. Pi's public status setter drives refresh; footer has no
  producer listener, as proven by adapter tests and source review.
- Actual window captures: `.reviews/footer-status-*.png`; cropped contact
  sheet: `.reviews/footer-status-contact-sheet.png`. Full all-on/all-off and
  intermediate frames independently inspected and approved by footer-review.
  No synthetic rendering or human screenshot waiver is claimed. Terminal
  exited cleanly. Probe/config/log artifacts are retained under
  `.reviews/footer-status-integration/`; temporary home/channel files removed.
- Producer's independent comms-review also approved the shared screenshots.
  Final peer tracking SHA: `2230dac6e0ddd28dee7b99e576a7acbf0227b999` on
  `0004-producer-owned-comms-status`. Lead verified the only delta from tested
  `b382cd1...` is producer todo evidence, with clean tracked tree, and read its
  independent code+visible-UI approval addendum. Implementation/tests are
  identical to the revision used for shared integration. Both repositories
  remain unmerged/unpushed pending authorized shipment.

All scoped implementation/validation criteria are satisfied. The human approved
squash merge to master and closure of 0005–0007 on 2026-10-05. This item is
marked done in that shipment. Earlier no-merge statements record historical
review boundaries, not the final authorization. No version bump or push was
requested. Producer implementation is already squash-merged to its master as
`61a71827088bda9fc6caf1bd71244632f2b8cfb8`, with implementation/tests unchanged
from the reviewed handoff.

## Notes

- The peer agent-channel implementation is an external dependency, not work to
  emulate in this repository. Until it is identified and verified, the first
  acceptance criterion is a hard blocker for consumer-side removal.
- `ctx.ui.setStatus()` and `footerData.getExtensionStatuses()` are the pinned
  Pi 1.0.3 public producer/consumer boundary (upgrade tracked in 0006). Do not depend on private footer
  provider APIs.
- Footer-owned data derived directly from Pi or the project (for example cwd,
  Git, model, cost, context, and thinking) is out of scope unless it is shown
  to be owned by another extension. This item is about producer-extension
  coupling, not deleting the footer DSL.
- Do not replace producer-specific subscriptions with a new generic event bus
  merely to preserve the old architecture; establish refresh behavior through
  the supported Pi status contract and test it.
