import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  SessionShutdownEvent,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { type EditorStatusExtensionApi, registerEditorStatusExtension } from "../extensions/editor-status";

type AgentChannelTestPayload =
  | string
  | boolean
  | number
  | null
  | Record<string, string | boolean | number | null | undefined>;

type CapturedEditor = {
  sessionStart: ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
  sessionShutdown: ((event: SessionShutdownEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
  emit: ExtensionAPI["events"]["emit"];
  listenerCount(channel: string): number;
};

type EditorFactory = Exclude<Parameters<ExtensionUIContext["setEditorComponent"]>[0], undefined>;
type SessionEntries = ReturnType<ExtensionContext["sessionManager"]["getEntries"]>;

type EditorContext = ExtensionContext & {
  getEditorFactory(): EditorFactory;
};

function createAdapter(): CapturedEditor {
  const handlers = new Map<string, Set<() => void>>();
  let payload: Parameters<ExtensionAPI["events"]["emit"]>[1] = false;
  const captured: CapturedEditor = {
    sessionStart: undefined,
    sessionShutdown: undefined,
    emit(channel, data): void {
      payload = data;
      for (const handler of handlers.get(channel) ?? []) handler();
    },
    listenerCount(channel): number {
      return handlers.get(channel)?.size ?? 0;
    },
  };
  const api: EditorStatusExtensionApi = {
    events: {
      emit(): void {},
      on(channel, handler): () => void {
        const channelHandlers = handlers.get(channel) ?? new Set<() => void>();
        const notify = () => handler(payload);
        channelHandlers.add(notify);
        handlers.set(channel, channelHandlers);
        return () => channelHandlers.delete(notify);
      },
    },
    on(registration): void {
      if (registration.event === "session_start") captured.sessionStart = registration.handler;
      else captured.sessionShutdown = registration.handler;
    },
  };

  registerEditorStatusExtension(api);
  return captured;
}

function createContext(entries: SessionEntries): EditorContext {
  let editorFactory: EditorFactory | undefined;
  const ui = {
    theme: { fg: (_tone: string, text: string) => text },
    setEditorComponent(factory: EditorFactory): void {
      editorFactory = factory;
    },
  };

  // SAFETY: this adapter invokes only hasUI, sessionManager.getEntries, ui.theme,
  // and ui.setEditorComponent; the remaining Pi context fields are not reached.
  const context = {
    hasUI: true,
    sessionManager: { getEntries: () => entries },
    ui,
  } as ExtensionContext;

  return Object.assign(context, {
    getEditorFactory: () => {
      if (!editorFactory) throw new Error("expected an editor factory");
      return editorFactory;
    },
  });
}

function renderCapturedEditor(context: EditorContext, onRender: () => void): () => string {
  const factory = context.getEditorFactory();

  // SAFETY: this factory path only uses requestRender, terminal.rows, theme.fg,
  // and theme.borderColor; these fixture members satisfy its render requirements.
  const editor = factory(
    { requestRender: onRender, terminal: { rows: 24 } } as Parameters<EditorFactory>[0],
    // SAFETY: the editor calls only the supplied borderColor and fg methods
    // while rendering this fixture; the remaining theme API is not reached.
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
    {} as Parameters<EditorFactory>[2],
  );
  return () => editor.render(80)[0] ?? "";
}

function startEditor(adapter: CapturedEditor, context: EditorContext): void {
  if (!adapter.sessionStart) throw new Error("expected session_start handler");
  adapter.sessionStart({ type: "session_start", reason: "startup" }, context);
}

function customEntry(customType: string, data?: AgentChannelTestPayload): SessionEntries[number] {
  const entry: SessionEntries[number] = {
    type: "custom",
    id: customType,
    parentId: null,
    timestamp: "2026-09-12T00:00:00.000Z",
    customType,
  };
  if (data !== undefined) entry.data = data;
  return entry;
}

describe("editor-status extension", () => {
  it.each([
    ["uses a persisted label", { label: "Coordinator" }, " Coordinator "],
    ["falls back to a persisted id", { id: "Operator" }, " Operator "],
    ["ignores null identity data", null, " agent "],
    ["ignores missing identity data", undefined, " agent "],
    ["ignores primitive identity data", 1, " agent "],
    ["ignores malformed identity properties", { label: 1, id: false }, " agent "],
    ["ignores empty identity data", { label: "", id: "" }, " agent "],
  ])("%s", (_description, data, expected) => {
    const adapter = createAdapter();
    const context = createContext([customEntry("agent-channel-identity", data)]);

    startEditor(adapter, context);

    expect(renderCapturedEditor(context, () => {})()).toContain(expected);
  });

  it.each([
    ["restores active comms", { active: true }, true],
    ["restores inactive comms", { active: false }, false],
    ["ignores malformed comms", { active: "yes" }, false],
    ["ignores missing comms data", undefined, false],
    ["ignores primitive comms data", true, false],
  ])("%s", (_description, data, active) => {
    const adapter = createAdapter();
    const context = createContext([customEntry("agent-channel-comms", data)]);

    startEditor(adapter, context);

    expect(renderCapturedEditor(context, () => {})()).toContain(active ? " 📡 " : " agent ");
  });

  it("renders live true comms and resets false or invalid values", () => {
    const adapter = createAdapter();
    const context = createContext([]);
    startEditor(adapter, context);
    let nameRenders = 0;
    const render = renderCapturedEditor(context, () => {
      nameRenders += 1;
    });

    expect(render()).toContain(" agent ");
    adapter.emit("agent-channel:name", " Reviewer ");
    expect(render()).toContain(" Reviewer ");
    expect(nameRenders).toBe(1);
    for (const payload of ["", null, 1, { label: "not a name" }, undefined]) {
      adapter.emit("agent-channel:name", payload);
      expect(render()).toContain(" Reviewer ");
      expect(nameRenders).toBe(1);
    }
    adapter.emit("agent-channel:comms", true);
    expect(render()).toContain(" Reviewer 📡 ");
    adapter.emit("agent-channel:comms", false);
    expect(render()).toContain(" Reviewer ");
    expect(render()).not.toContain("📡");
    adapter.emit("agent-channel:comms", { active: true });
    expect(render()).not.toContain("📡");
  });

  it("disposes old subscriptions on shutdown before a session restart", () => {
    const adapter = createAdapter();
    const context = createContext([]);
    startEditor(adapter, context);
    let firstRenders = 0;
    renderCapturedEditor(context, () => {
      firstRenders += 1;
    });

    adapter.emit("agent-channel:name", "First");
    adapter.emit("agent-channel:comms", true);
    expect(firstRenders).toBe(2);
    expect(adapter.listenerCount("agent-channel:name")).toBe(1);
    expect(adapter.listenerCount("agent-channel:comms")).toBe(1);
    if (!adapter.sessionShutdown) throw new Error("expected session_shutdown handler");

    adapter.sessionShutdown({ type: "session_shutdown", reason: "quit" }, context);
    expect(adapter.listenerCount("agent-channel:name")).toBe(0);
    expect(adapter.listenerCount("agent-channel:comms")).toBe(0);
    adapter.emit("agent-channel:name", "Stale");
    adapter.emit("agent-channel:comms", false);
    expect(firstRenders).toBe(2);

    startEditor(adapter, context);
    let secondRenders = 0;
    renderCapturedEditor(context, () => {
      secondRenders += 1;
    });
    expect(adapter.listenerCount("agent-channel:name")).toBe(1);
    expect(adapter.listenerCount("agent-channel:comms")).toBe(1);
    adapter.emit("agent-channel:name", "Restarted");
    adapter.emit("agent-channel:comms", true);
    expect(firstRenders).toBe(2);
    expect(secondRenders).toBe(2);
  });
});
