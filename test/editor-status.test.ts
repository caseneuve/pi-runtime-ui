import {
  CustomEditor,
  type ExtensionContext,
  type ExtensionUIContext,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { getKeybindings, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type EditorStatusExtensionApi, registerEditorStatusExtension } from "../extensions/editor-status";
import * as git from "../extensions/shared/runtime-status-git";

type EditorFactory = Exclude<Parameters<ExtensionUIContext["setEditorComponent"]>[0], undefined>;
type SessionEntries = ReturnType<ExtensionContext["sessionManager"]["getEntries"]>;

// Expose only the inherited protected hook for width/overflow contract tests.
// The captured instance still uses the real extension subclass and native renderer.
class BorderProbe extends CustomEditor {
  static border(editor: BorderProbe, width: number, hiddenLines = 0): string {
    return editor.renderTopBorder(width, hiddenLines);
  }
}

function createEditor(entries: SessionEntries = [], hasUI = true) {
  let sessionStart: ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
  let factory: EditorFactory | undefined;
  const channels: string[] = [];
  const api = {
    events: {
      on(channel: string) {
        channels.push(channel);
        return () => {};
      },
      emit() {},
    },
    on(registration: Parameters<EditorStatusExtensionApi["on"]>[0]) {
      if (registration.event === "session_start") sessionStart = registration.handler;
    },
  };
  registerEditorStatusExtension(api);
  // SAFETY: installation reads only hasUI, ui.setEditorComponent and ui.theme;
  // entries are supplied to detect accidental reads of the old peer state.
  const ctx = {
    hasUI,
    sessionManager: { getEntries: () => entries },
    ui: {
      theme: { fg: (_tone: string, text: string) => text },
      setEditorComponent(value: EditorFactory) {
        factory = value;
      },
    },
  } as ExtensionContext;
  if (!sessionStart) throw new Error("missing session_start handler");
  sessionStart({ type: "session_start", reason: "startup" }, ctx);

  return {
    channels,
    get installed() {
      return factory !== undefined;
    },
    editor(): CustomEditor {
      if (!factory) throw new Error("missing editor factory");
      // SAFETY: CustomEditor render/input uses terminal.rows, requestRender and
      // the editor-theme/keybinding methods explicitly provided by these fixtures.
      const editor = factory(
        { requestRender() {}, terminal: { rows: 24 } } as Parameters<EditorFactory>[0],
        // SAFETY: these are the theme members reached by the real base editor.
        {
          borderColor: (text: string) => text,
          fg: (_tone: string, text: string) => text,
          selectList: {
            description: (text: string) => text,
            noMatch: (text: string) => text,
            scrollInfo: (text: string) => text,
            selectedPrefix: (text: string) => text,
            selectedText: (text: string) => text,
          },
        } as Parameters<EditorFactory>[1],
        // SAFETY: this input fixture only uses inherited matches from Pi's TUI keybindings.
        getKeybindings() as Parameters<EditorFactory>[2],
      );
      // SAFETY: editor-status installs a real CustomEditor subclass, not a wrapper.
      return editor as CustomEditor;
    },
  };
}

function injectIndicator(editor: CustomEditor, text: string): void {
  // SAFETY: the native border invokes only these two rendering methods;
  // this fixture represents an injected Pi indicator without starting timers.
  editor.setWorkingStatusIndicator({
    renderInBorder: (width: number) => truncateToWidth(text, width, ""),
    renderSpinnerInBorder: (width: number) => truncateToWidth("⠋", width, ""),
  } as Parameters<CustomEditor["setWorkingStatusIndicator"]>[0]);
}

function mockGit(stats: git.GitStats | null, inRepo = true): void {
  vi.spyOn(git, "getGitStats").mockReturnValue({ stats, cwd: "/workspace", checkedAt: Date.now() });
  vi.spyOn(git, "isGitRepo").mockReturnValue(inRepo);
}

const changedStats: git.GitStats = {
  addedLines: 2,
  removedLines: 1,
  changedFiles: 1,
  addedFiles: 0,
  untrackedFiles: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("editor-status native border and Git", () => {
  it("opts into native activity and shows Git without an invented agent name", () => {
    mockGit(changedStats);
    const h = createEditor();
    const editor = h.editor();
    const border = BorderProbe.border(editor, 80);
    expect(editor.embedWorkingStatus).toBe(true);
    expect(border).toContain("+2");
    expect(border).toContain("-1");
    expect(border).not.toContain("agent");
    expect(h.channels).toEqual([]);
    expect(visibleWidth(border)).toBe(80);
  });

  it("ignores persisted producer identity/comms and registers no peer listener", () => {
    mockGit(null, false);
    const h = createEditor([
      {
        type: "custom",
        id: "identity",
        parentId: null,
        timestamp: "2026-10-05T00:00:00Z",
        customType: "agent-channel-identity",
        data: { label: "Reviewer" },
      },
      {
        type: "custom",
        id: "comms",
        parentId: "identity",
        timestamp: "2026-10-05T00:00:00Z",
        customType: "agent-channel-comms",
        data: { active: true },
      },
    ]);
    const editor = h.editor();
    expect(BorderProbe.border(editor, 80)).toBe("─".repeat(80));
    expect(editor.render(80)[0]).toBe("─".repeat(80));
    expect(h.channels).toEqual([]);
  });

  it.each([
    "⠋ Working",
    "⠋ Retrying (1/3) in 5s... (esc to cancel)",
    "⠋ Compacting context... (esc to cancel)",
    "⠋ Auto-compacting... (esc to cancel)",
    "⠋ Context overflow detected, Auto-compacting... (esc to cancel)",
    "⠋ Summarizing branch... (esc to cancel)",
    "\x1b[32m⠋ Working\x1b[0m",
  ])("preserves native %s while appending Git when it fits", (label) => {
    mockGit(changedStats);
    const editor = createEditor().editor();
    injectIndicator(editor, label);
    const border = BorderProbe.border(editor, 120);
    expect(border).toContain(label);
    expect(border).toContain("+2");
    expect(visibleWidth(border)).toBe(120);
    editor.setWorkingStatusIndicator(undefined);
    expect(BorderProbe.border(editor, 120)).not.toContain(label);
  });

  it("preserves the full native activity label instead of crowding it with Git", () => {
    mockGit(changedStats);
    const editor = createEditor().editor();
    injectIndicator(editor, "⠋ Working");
    const border = BorderProbe.border(editor, 20);
    expect(border).toContain("⠋ Working");
    expect(border).not.toContain("+2");
    expect(visibleWidth(border)).toBe(20);
  });

  it("keeps hidden input and activity together before optional Git", () => {
    mockGit(changedStats);
    const editor = createEditor().editor();
    injectIndicator(editor, "⠋ Working");
    const wide = BorderProbe.border(editor, 120, 4);
    expect(wide).toContain("⠋ Working");
    expect(wide).toContain("↑ 4 more");
    expect(wide).toContain("+2");
    const narrow = BorderProbe.border(editor, 40, 4);
    expect(narrow).toContain("⠋ Working");
    expect(narrow).toContain("↑ 4 more");
    expect(narrow).not.toContain("+2");
    expect(visibleWidth(narrow)).toBe(40);
  });

  it("keeps current thinking-border styling and preserves native-only output outside a repository", () => {
    mockGit(null, false);
    const editor = createEditor().editor();
    editor.borderColor = (text: string) => `\x1b[35m${text}\x1b[0m`;
    injectIndicator(editor, "⠋ Working");
    const border = BorderProbe.border(editor, 80);
    expect(border).toContain("⠋ Working");
    expect(border).toContain("\x1b[35m");
    expect(border).not.toContain("✓");
    expect(visibleWidth(border)).toBe(80);
  });

  it("preserves idle hidden-line counts and clean-repo status", () => {
    mockGit(null);
    const editor = createEditor().editor();
    const border = BorderProbe.border(editor, 80, 3);
    expect(border).toContain("↑ 3 more");
    expect(border).toContain("✓");
    expect(visibleWidth(border)).toBe(80);
  });

  it.each([0, 1, 2, 3, 5, 10, 20, 40, 80])("never exceeds width %s with native overflow and Git", (width) => {
    mockGit(changedStats);
    const editor = createEditor().editor();
    injectIndicator(editor, "⠋ Working");
    expect(visibleWidth(BorderProbe.border(editor, width, 12))).toBeLessThanOrEqual(width);
  });

  it("keeps normal text editing and skips installation without UI", () => {
    mockGit(null, false);
    const h = createEditor();
    const editor = h.editor();
    editor.handleInput("hello");
    expect(editor.getText()).toBe("hello");
    expect(createEditor([], false).installed).toBe(false);
    expect(h.channels).toEqual([]);
  });
});
