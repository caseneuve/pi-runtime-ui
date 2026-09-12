import path from "node:path";
import type {
  ExtensionContext,
  ExtensionUIContext,
  SessionStartEvent,
  SessionTreeEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
  type RuntimeFooterExtensionApi,
  type RuntimeFooterExtensionEffects,
  registerRuntimeFooterExtension,
} from "../extensions/runtime-footer";

type CapturedAdapter = {
  command: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
  sessionStart: ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
  sessionTree: ((event: SessionTreeEvent, ctx: ExtensionContext) => Promise<void> | void) | undefined;
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
  const captured: CapturedAdapter = {
    command: undefined,
    sessionStart: undefined,
    sessionTree: undefined,
  };
  const api: RuntimeFooterExtensionApi = {
    events: {
      on: () => () => {},
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
