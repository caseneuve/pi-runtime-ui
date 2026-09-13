import path from "node:path";
import type {
  ExtensionContext,
  ExtensionUIContext,
  SessionStartEvent,
  SessionTreeEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  type RuntimeFooterExtensionApi,
  type RuntimeFooterExtensionEffects,
  registerRuntimeFooterExtension,
} from "../extensions/runtime-footer";

type AgentChannelTestPayload = boolean | { active: boolean };

type CapturedAdapter = {
  command: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
  sessionStart: ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
  sessionTree: ((event: SessionTreeEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
  emit(channel: string, data: AgentChannelTestPayload): void;
  listenerCount(channel: string): number;
};

type AccessRecorder = {
  exists(pathname: string): boolean;
  stat(pathname: string): number;
  readText(pathname: string): string;
  ensure(pathname: string): void;
  existenceProbes: string[];
  statProbes: string[];
  readProbes: string[];
  ensuredPaths: string[];
};

const cwd = "/workspace/runtime-ui";
const agentDir = "/home/piotr/agent";
const configDirName = ".pi";

function configPath(scope: "project" | "global", filename: "config.jsonc" | "config.json"): string {
  const root = scope === "project" ? path.join(cwd, configDirName) : agentDir;
  return path.join(root, "extensions", "runtime-footer", filename);
}

function legacyPaths(): string[] {
  return [
    path.join(cwd, configDirName, "runtime-footer.jsonc"),
    path.join(cwd, configDirName, "runtime-footer.json"),
    path.join(agentDir, "runtime-footer.jsonc"),
    path.join(agentDir, "runtime-footer.json"),
  ];
}

function createAccessRecorder(existingPaths: readonly string[]): AccessRecorder {
  const existing = new Set(existingPaths);
  const existenceProbes: string[] = [];
  const statProbes: string[] = [];
  const readProbes: string[] = [];
  const ensuredPaths: string[] = [];

  return {
    exists(pathname: string): boolean {
      existenceProbes.push(pathname);
      return existing.has(pathname);
    },
    stat(pathname: string): number {
      statProbes.push(pathname);
      return 1;
    },
    readText(pathname: string): string {
      readProbes.push(pathname);
      return '{"left":[],"right":[],"branchStatusLine":false}';
    },
    ensure(pathname: string): void {
      ensuredPaths.push(pathname);
    },
    existenceProbes,
    statProbes,
    readProbes,
    ensuredPaths,
  };
}

function createAdapter(effects: RuntimeFooterExtensionEffects): CapturedAdapter {
  const handlers = new Map<string, Set<() => void>>();
  let payload: AgentChannelTestPayload = false;
  const captured: CapturedAdapter = {
    command: undefined,
    sessionStart: undefined,
    sessionTree: undefined,
    emit(channel, data): void {
      payload = data;
      for (const handler of handlers.get(channel) ?? []) handler();
    },
    listenerCount(channel): number {
      return handlers.get(channel)?.size ?? 0;
    },
  };
  const api: RuntimeFooterExtensionApi = {
    events: {
      on(channel, handler): () => void {
        const channelHandlers = handlers.get(channel) ?? new Set<() => void>();
        const notify = () => handler(payload);
        channelHandlers.add(notify);
        handlers.set(channel, channelHandlers);
        return () => channelHandlers.delete(notify);
      },
      emit: () => {},
    },
    getThinkingLevel: () => "off",
    on(registration): void {
      if (registration.event === "session_start") {
        captured.sessionStart = registration.handler;
      } else {
        captured.sessionTree = registration.handler;
      }
    },
    registerCommand(_name, command): void {
      captured.command = command.handler;
    },
  };

  registerRuntimeFooterExtension(api, effects);
  return captured;
}

type AdapterFooterFactory = Exclude<Parameters<ExtensionUIContext["setFooter"]>[0], undefined>;

type AdapterContext = ExtensionContext & {
  getFooterFactory(): AdapterFooterFactory;
};

function createContext(projectTrusted: boolean, onNotify: (message: string) => void): AdapterContext {
  let footerFactory: Parameters<ExtensionUIContext["setFooter"]>[0] | undefined;
  const ui = {
    notify(message: string): void {
      onNotify(message);
    },
    setFooter(factory: Parameters<ExtensionUIContext["setFooter"]>[0]): void {
      footerFactory = factory;
    },
  };

  // SAFETY: the adapter tests invoke only hasUI, cwd, isProjectTrusted, notify,
  // and setFooter; remaining Pi context fields are outside this wiring boundary.
  const context = {
    hasUI: true,
    cwd,
    isProjectTrusted: () => projectTrusted,
    ui,
  } as ExtensionContext;

  Object.defineProperties(context, {
    getContextUsage: { value: () => undefined },
    sessionManager: { value: { getBranch: () => [] } },
  });

  return Object.assign(context, {
    getFooterFactory: () => {
      if (!footerFactory) throw new Error("expected a footer factory");
      return footerFactory;
    },
  });
}

function renderCapturedFooter(context: AdapterContext): void {
  const footerFactory = context.getFooterFactory();

  // SAFETY: this render only uses requestRender, fg, and the listed footer-data
  // methods; the fixtures provide each of those runtime members.
  const component = footerFactory(
    { requestRender: () => {} } as Parameters<NonNullable<typeof footerFactory>>[0],
    { fg: (_tone: string, text: string) => text } as Parameters<NonNullable<typeof footerFactory>>[1],
    {
      getAvailableProviderCount: () => 0,
      getExtensionStatuses: () => new Map<string, string>(),
      getGitBranch: () => null,
      onBranchChange: () => () => {},
    } as Parameters<NonNullable<typeof footerFactory>>[2],
  );
  component.render(80);
}

describe("runtime-footer extension adapters", () => {
  it("uses context trust before untrusted automatic footer probes", () => {
    const globalJsonc = configPath("global", "config.jsonc");
    const projectJsonc = configPath("project", "config.jsonc");
    const recorder = createAccessRecorder([globalJsonc]);
    let trustCalls = 0;
    const effects: RuntimeFooterExtensionEffects = {
      getAgentDir: () => agentDir,
      fileExists: recorder.exists,
      readMtime: recorder.stat,
      readText: recorder.readText,
      ensureConfigFile: recorder.ensure,
      openConfigInEditor: async () => ({ ok: true, message: "opened" }),
    };
    const adapter = createAdapter(effects);
    const context = createContext(false, () => {});
    const originalTrust = context.isProjectTrusted;
    context.isProjectTrusted = () => {
      trustCalls += 1;
      return originalTrust();
    };
    const sessionStart = adapter.sessionStart;
    if (!sessionStart) throw new Error("expected session_start handler");

    sessionStart({ type: "session_start", reason: "startup" }, context);
    renderCapturedFooter(context);

    expect(trustCalls).toBe(1);
    expect(recorder.existenceProbes).toEqual([globalJsonc]);
    expect(recorder.statProbes).toEqual([globalJsonc]);
    expect(recorder.readProbes).toEqual([globalJsonc]);
    expect(recorder.existenceProbes).not.toContain(projectJsonc);
    expect(recorder.statProbes).not.toContain(projectJsonc);
    expect(recorder.readProbes).not.toContain(projectJsonc);
    for (const legacyPath of legacyPaths()) {
      expect([...recorder.existenceProbes, ...recorder.statProbes, ...recorder.readProbes]).not.toContain(legacyPath);
    }
  });

  it("passes selected JSON format to the compiler, falls back on errors, and notifies each error episode once", () => {
    vi.useFakeTimers();
    try {
      const globalJson = configPath("global", "config.json");
      const notifications: string[] = [];
      let sourceText = '{ // JSON comments are invalid here\n "left": [] }';
      let revision = 1;
      const effects: RuntimeFooterExtensionEffects = {
        getAgentDir: () => agentDir,
        fileExists: (pathname) => pathname === globalJson,
        readMtime: () => revision,
        readText: () => sourceText,
        ensureConfigFile: () => {},
        openConfigInEditor: async () => ({ ok: true, message: "opened" }),
      };
      const adapter = createAdapter(effects);
      const context = createContext(false, (message) => notifications.push(message));
      if (!adapter.sessionStart) throw new Error("expected session_start handler");

      adapter.sessionStart({ type: "session_start", reason: "startup" }, context);
      renderCapturedFooter(context);
      renderCapturedFooter(context);

      sourceText = '{"left":[],"right":[],"branchStatusLine":false}';
      revision += 1;
      vi.advanceTimersByTime(1001);
      renderCapturedFooter(context);

      sourceText = '{ // JSON comments are invalid here\n "left": [] }';
      revision += 1;
      vi.advanceTimersByTime(1001);
      renderCapturedFooter(context);

      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toContain(globalJson);
      expect(notifications[1]).toContain(globalJson);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses defaults and notifies when the selected config file cannot be read", () => {
    const globalJsonc = configPath("global", "config.jsonc");
    const notifications: string[] = [];
    const effects: RuntimeFooterExtensionEffects = {
      getAgentDir: () => agentDir,
      fileExists: (pathname) => pathname === globalJsonc,
      readMtime: () => 1,
      readText: () => {
        throw new Error("permission denied");
      },
      ensureConfigFile: () => {},
      openConfigInEditor: async () => ({ ok: true, message: "opened" }),
    };
    const adapter = createAdapter(effects);
    const context = createContext(false, (message) => notifications.push(message));
    if (!adapter.sessionStart) throw new Error("expected session_start handler");

    adapter.sessionStart({ type: "session_start", reason: "startup" }, context);
    expect(() => renderCapturedFooter(context)).not.toThrow();
    expect(notifications).toEqual([expect.stringContaining("permission denied")]);
  });

  it("rerenders the comms block after a decoded comms event", () => {
    const globalJsonc = configPath("global", "config.jsonc");
    const effects: RuntimeFooterExtensionEffects = {
      getAgentDir: () => agentDir,
      fileExists: (pathname) => pathname === globalJsonc,
      readMtime: () => 1,
      readText: () => '{"left":["comms"],"right":[],"branchStatusLine":false}',
      ensureConfigFile: () => {},
      openConfigInEditor: async () => ({ ok: true, message: "opened" }),
    };
    const adapter = createAdapter(effects);
    const context = createContext(false, () => {});
    if (!adapter.sessionStart) throw new Error("expected session_start handler");

    adapter.sessionStart({ type: "session_start", reason: "startup" }, context);
    const footerFactory = context.getFooterFactory();
    let renders = 0;
    // SAFETY: this adapter render path uses requestRender, fg, and the listed
    // footer-data methods; this fixture provides exactly those runtime members.
    const branchListeners = new Set<() => void>();
    const component = footerFactory(
      // SAFETY: the footer factory reads only requestRender from this TUI fixture.
      {
        requestRender: () => {
          renders += 1;
        },
      } as Parameters<NonNullable<typeof footerFactory>>[0],
      // SAFETY: the footer factory reads only fg from this theme fixture.
      { fg: (_tone: string, text: string) => text } as Parameters<NonNullable<typeof footerFactory>>[1],
      // SAFETY: the footer factory reads only these footer-data methods.
      {
        getAvailableProviderCount: () => 0,
        getExtensionStatuses: () => new Map<string, string>(),
        getGitBranch: () => null,
        onBranchChange(listener): () => void {
          branchListeners.add(listener);
          return () => branchListeners.delete(listener);
        },
      } as Parameters<NonNullable<typeof footerFactory>>[2],
    );

    expect(component.render(80)[0]).not.toContain("📡");
    adapter.emit("agent-channel:comms", true);
    expect(component.render(80)[0]).toContain("📡");
    adapter.emit("agent-channel:comms", { active: true });
    expect(component.render(80)[0]).not.toContain("📡");
    for (const listener of branchListeners) listener?.();
    expect(renders).toBe(3);
    expect(adapter.listenerCount("agent-channel:comms")).toBe(2);

    if (!component.dispose) throw new Error("expected footer disposal");
    component.dispose();
    expect(adapter.listenerCount("agent-channel:comms")).toBe(1);
    adapter.emit("agent-channel:comms", true);
    for (const listener of branchListeners) listener?.();
    expect(renders).toBe(3);
  });

  it("limits an untrusted local command to canonical project candidates and reports trust", async () => {
    const projectJsonc = configPath("project", "config.jsonc");
    const projectJson = configPath("project", "config.json");
    const globalJsonc = configPath("global", "config.jsonc");
    const recorder = createAccessRecorder([projectJson, globalJsonc]);
    const notifications: string[] = [];
    const effects: RuntimeFooterExtensionEffects = {
      getAgentDir: () => agentDir,
      fileExists: recorder.exists,
      readMtime: recorder.stat,
      readText: recorder.readText,
      ensureConfigFile: recorder.ensure,
      openConfigInEditor: async (_ctx, pathname) => ({ ok: true, message: `Updated ${pathname}` }),
    };
    const adapter = createAdapter(effects);
    const context = createContext(false, (message) => notifications.push(message));
    if (!adapter.command) throw new Error("expected command handler");

    await adapter.command("local", context);

    expect(recorder.existenceProbes).toEqual([projectJsonc, projectJson]);
    expect(recorder.ensuredPaths).toEqual([projectJson]);
    expect(recorder.existenceProbes).not.toContain(globalJsonc);
    for (const legacyPath of legacyPaths()) {
      expect(recorder.existenceProbes).not.toContain(legacyPath);
    }
    expect(notifications).toEqual([expect.stringContaining(projectJson)]);
    expect(notifications[0]).toMatch(/not consumed now/i);
    expect(notifications[0]).toMatch(/requires project trust/i);
  });
});
