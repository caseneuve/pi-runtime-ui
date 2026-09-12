import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  planAutomaticConfigCandidates,
  planEditConfigCandidates,
  planRuntimeFooterConfigEdit,
  readFooterConfig,
  runtimeFooterConfigCommandCompletions,
  selectFirstExistingConfigCandidate,
  shortenModelId,
  thinkingBlockTone,
} from "../extensions/runtime-footer";
import { compileConfig, DEFAULT_THINKING_MAPPING, type JsonValue } from "../extensions/shared/runtime-footer-config";

function parseConfig(value: JsonValue) {
  const result = compileConfig(JSON.stringify(value), "json");
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const configRoots = {
  cwd: "/workspace/runtime-ui",
  agentDir: "/home/piotr/agent",
  configDirName: ".custom-pi",
};

function canonicalConfigPath(scope: "project" | "global", filename: "config.jsonc" | "config.json"): string {
  const root = scope === "project" ? configRoots.cwd : configRoots.agentDir;
  const segments = scope === "project" ? [configRoots.configDirName] : [];
  return path.join(root, ...segments, "extensions", "runtime-footer", filename);
}

function expectedCandidate(scope: "project" | "global", format: "jsonc" | "json") {
  return {
    scope,
    format,
    path: canonicalConfigPath(scope, format === "jsonc" ? "config.jsonc" : "config.json"),
  };
}

describe("runtime-footer canonical config candidates", () => {
  it.each([
    [
      "trusted projects place local JSONC and JSON ahead of global candidates",
      true,
      [
        expectedCandidate("project", "jsonc"),
        expectedCandidate("project", "json"),
        expectedCandidate("global", "jsonc"),
        expectedCandidate("global", "json"),
      ],
    ],
    [
      "untrusted projects omit all local candidates",
      false,
      [expectedCandidate("global", "jsonc"), expectedCandidate("global", "json")],
    ],
  ])("%s", (_case, projectTrusted, expected) => {
    expect(planAutomaticConfigCandidates(configRoots, projectTrusted)).toEqual(expected);
  });

  it.each([
    ["project", [expectedCandidate("project", "jsonc"), expectedCandidate("project", "json")]],
    ["global", [expectedCandidate("global", "jsonc"), expectedCandidate("global", "json")]],
  ] as const)("plans canonical %s edit candidates in JSONC-first order", (scope, expected) => {
    expect(planEditConfigCandidates(configRoots, scope)).toEqual(expected);
  });

  it("never plans the four removed root-level paths", () => {
    const candidates = [
      ...planAutomaticConfigCandidates(configRoots, true),
      ...planEditConfigCandidates(configRoots, "project"),
      ...planEditConfigCandidates(configRoots, "global"),
    ];
    const paths = candidates.map((candidate) => candidate.path);
    const legacyPaths = [
      path.join(configRoots.cwd, configRoots.configDirName, "runtime-footer.jsonc"),
      path.join(configRoots.cwd, configRoots.configDirName, "runtime-footer.json"),
      path.join(configRoots.agentDir, "runtime-footer.jsonc"),
      path.join(configRoots.agentDir, "runtime-footer.json"),
    ];

    for (const legacyPath of legacyPaths) {
      expect(paths).not.toContain(legacyPath);
    }
  });
});

describe("runtime-footer canonical source selection", () => {
  const candidates = planAutomaticConfigCandidates(configRoots, true);
  const [projectJsonc, projectJson, globalJsonc, globalJson] = candidates;

  it.each([
    ["prefers project JSONC over project JSON", [projectJsonc.path, projectJson.path], projectJsonc],
    ["prefers project JSON over global JSONC", [projectJson.path, globalJsonc.path], projectJson],
    ["prefers global JSONC over global JSON", [globalJsonc.path, globalJson.path], globalJsonc],
  ])("%s", (_case, existingPaths, expected) => {
    const facts = candidates.map((candidate) => ({
      path: candidate.path,
      exists: existingPaths.includes(candidate.path),
    }));

    expect(selectFirstExistingConfigCandidate(candidates, facts)).toEqual(expected);
  });

  it("returns no source when no canonical candidate exists, even if legacy paths exist", () => {
    const facts = [
      ...candidates.map((candidate) => ({ path: candidate.path, exists: false })),
      { path: path.join(configRoots.cwd, configRoots.configDirName, "runtime-footer.jsonc"), exists: true },
      { path: path.join(configRoots.cwd, configRoots.configDirName, "runtime-footer.json"), exists: true },
      { path: path.join(configRoots.agentDir, "runtime-footer.jsonc"), exists: true },
      { path: path.join(configRoots.agentDir, "runtime-footer.json"), exists: true },
    ];

    expect(selectFirstExistingConfigCandidate(candidates, facts)).toBeUndefined();
  });
});

function createConfigAccessRecorder(
  existingPaths: readonly string[],
  fileTexts: ReadonlyMap<string, string> = new Map(),
) {
  const existing = new Set(existingPaths);
  const existenceProbes: string[] = [];
  const statProbes: string[] = [];
  const readProbes: string[] = [];

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
      return fileTexts.get(pathname) ?? '{"separator":" | "}';
    },
    existenceProbes,
    statProbes,
    readProbes,
  };
}

function legacyConfigPaths(): string[] {
  return [
    path.join(configRoots.cwd, configRoots.configDirName, "runtime-footer.jsonc"),
    path.join(configRoots.cwd, configRoots.configDirName, "runtime-footer.json"),
    path.join(configRoots.agentDir, "runtime-footer.jsonc"),
    path.join(configRoots.agentDir, "runtime-footer.json"),
  ];
}

function expectNoLegacyPaths(paths: readonly string[]): void {
  for (const legacyPath of legacyConfigPaths()) {
    expect(paths).not.toContain(legacyPath);
  }
}

describe("runtime-footer automatic config resolution", () => {
  const [projectJsonc, projectJson, globalJsonc, globalJson] = planAutomaticConfigCandidates(configRoots, true);

  it("keeps global config eligible without probing untrusted project paths", () => {
    const recorder = createConfigAccessRecorder([globalJsonc.path]);
    const result = readFooterConfig(configRoots, false, undefined, recorder.exists, recorder.stat, recorder.readText);

    expect(result.sourcePath).toBe(globalJsonc.path);
    expect(recorder.existenceProbes).toEqual([globalJsonc.path]);
    expect(recorder.statProbes).toEqual([globalJsonc.path]);
    expect(recorder.readProbes).toEqual([globalJsonc.path]);
    expectNoLegacyPaths([...recorder.existenceProbes, ...recorder.statProbes, ...recorder.readProbes]);
    expect(recorder.existenceProbes).not.toContain(projectJsonc.path);
    expect(recorder.existenceProbes).not.toContain(projectJson.path);
  });

  it("stops probing once the first existing trusted candidate is found", () => {
    const recorder = createConfigAccessRecorder([projectJson.path, globalJsonc.path, globalJson.path]);
    const result = readFooterConfig(configRoots, true, undefined, recorder.exists, recorder.stat, recorder.readText);

    expect(result.sourcePath).toBe(projectJson.path);
    expect(recorder.existenceProbes).toEqual([projectJsonc.path, projectJson.path]);
    expect(recorder.statProbes).toEqual([projectJson.path]);
    expect(recorder.readProbes).toEqual([projectJson.path]);
  });

  it("gives a trusted project candidate precedence over an existing global candidate", () => {
    const recorder = createConfigAccessRecorder([projectJson.path, globalJsonc.path]);
    const result = readFooterConfig(configRoots, true, undefined, recorder.exists, recorder.stat, recorder.readText);

    expect(result.sourcePath).toBe(projectJson.path);
    expect(recorder.existenceProbes).toEqual([projectJsonc.path, projectJson.path]);
  });
  it("reports a malformed authoritative project JSONC and does not inspect lower candidates", () => {
    const recorder = createConfigAccessRecorder(
      [projectJsonc.path, projectJson.path, globalJsonc.path, globalJson.path],
      new Map([[projectJsonc.path, "{"]]),
    );

    const result = readFooterConfig(configRoots, true, undefined, recorder.exists, recorder.stat, recorder.readText);

    expect(result.config.separator).toBe(" · ");
    expect(result.error).toContain(projectJsonc.path);
    expect(result.sourcePath).toBe(projectJsonc.path);
    expect(recorder.existenceProbes).toEqual([projectJsonc.path]);
    expect(recorder.statProbes).toEqual([projectJsonc.path]);
    expect(recorder.readProbes).toEqual([projectJsonc.path]);
  });

  it("reports a malformed authoritative global JSONC without falling through to global JSON", () => {
    const recorder = createConfigAccessRecorder(
      [globalJsonc.path, globalJson.path],
      new Map([[globalJsonc.path, "{"]]),
    );

    const result = readFooterConfig(configRoots, false, undefined, recorder.exists, recorder.stat, recorder.readText);

    expect(result.config.separator).toBe(" · ");
    expect(result.error).toContain(globalJsonc.path);
    expect(result.sourcePath).toBe(globalJsonc.path);
    expect(recorder.existenceProbes).toEqual([globalJsonc.path]);
    expect(recorder.statProbes).toEqual([globalJsonc.path]);
    expect(recorder.readProbes).toEqual([globalJsonc.path]);
  });

  it.each([
    ["JSONC", projectJsonc.path, '{ // comment\n "separator": " / " }', " / "],
    ["JSON", projectJson.path, '{"separator":" :: "}', " :: "],
  ])("continues loading valid %s files", (_format, sourcePath, sourceText, separator) => {
    const recorder = createConfigAccessRecorder([sourcePath], new Map([[sourcePath, sourceText]]));

    const result = readFooterConfig(configRoots, true, undefined, recorder.exists, recorder.stat, recorder.readText);

    expect(result.error).toBeUndefined();
    expect(result.sourcePath).toBe(sourcePath);
    expect(result.config.separator).toBe(separator);
  });

  it("reuses a same-cwd, same-trust cache within the TTL without filesystem probes", () => {
    const initialRecorder = createConfigAccessRecorder([projectJsonc.path]);
    const previous = readFooterConfig(
      configRoots,
      true,
      undefined,
      initialRecorder.exists,
      initialRecorder.stat,
      initialRecorder.readText,
    );
    const cachedRecorder = createConfigAccessRecorder([projectJsonc.path]);

    const result = readFooterConfig(
      configRoots,
      true,
      previous,
      cachedRecorder.exists,
      cachedRecorder.stat,
      cachedRecorder.readText,
    );

    expect(result).toBe(previous);
    expect(cachedRecorder.existenceProbes).toEqual([]);
    expect(cachedRecorder.statProbes).toEqual([]);
    expect(cachedRecorder.readProbes).toEqual([]);
  });

  it("invalidates a trusted project cache when trust changes", () => {
    const trustedRecorder = createConfigAccessRecorder([projectJsonc.path]);
    const trustedCache = readFooterConfig(
      configRoots,
      true,
      undefined,
      trustedRecorder.exists,
      trustedRecorder.stat,
      trustedRecorder.readText,
    );
    const untrustedRecorder = createConfigAccessRecorder([globalJsonc.path]);

    const result = readFooterConfig(
      configRoots,
      false,
      trustedCache,
      untrustedRecorder.exists,
      untrustedRecorder.stat,
      untrustedRecorder.readText,
    );

    expect(result).not.toBe(trustedCache);
    expect(result.sourcePath).toBe(globalJsonc.path);
    expect(untrustedRecorder.existenceProbes).toEqual([globalJsonc.path]);
    expect(untrustedRecorder.statProbes).toEqual([globalJsonc.path]);
    expect(untrustedRecorder.readProbes).toEqual([globalJsonc.path]);
  });
});

function expectEditTarget(plan: ReturnType<typeof planRuntimeFooterConfigEdit>): string {
  if (plan.kind !== "edit") throw new Error("expected edit plan");
  return plan.target.path;
}

describe("runtime-footer explicit config editing", () => {
  const [projectJsonc, projectJson] = planEditConfigCandidates(configRoots, "project");
  const [globalJsonc, globalJson] = planEditConfigCandidates(configRoots, "global");

  it.each([
    ["global JSONC", "global", [globalJsonc.path, globalJson.path], globalJsonc.path, [globalJsonc.path]],
    ["global JSON", "global", [globalJson.path], globalJson.path, [globalJsonc.path, globalJson.path]],
    ["global creation", "global", [], globalJsonc.path, [globalJsonc.path, globalJson.path]],
    ["local JSONC", "local", [projectJsonc.path, projectJson.path], projectJsonc.path, [projectJsonc.path]],
    ["local JSON", "local", [projectJson.path], projectJson.path, [projectJsonc.path, projectJson.path]],
    ["local creation", "local", [], projectJsonc.path, [projectJsonc.path, projectJson.path]],
  ])("targets %s before lower-precedence formats", (_case, args, existingPaths, expectedPath, expectedProbes) => {
    const recorder = createConfigAccessRecorder(existingPaths);
    const plan = planRuntimeFooterConfigEdit(args, configRoots, true, recorder.exists);

    expect(expectEditTarget(plan)).toBe(expectedPath);
    expect(recorder.existenceProbes).toEqual(expectedProbes);
  });

  it("allows an untrusted local edit to probe only canonical project candidates", () => {
    const recorder = createConfigAccessRecorder([projectJson.path, globalJsonc.path]);
    const plan = planRuntimeFooterConfigEdit("local", configRoots, false, recorder.exists);

    expect(expectEditTarget(plan)).toBe(projectJson.path);
    expect(recorder.existenceProbes).toEqual([projectJsonc.path, projectJson.path]);
    expectNoLegacyPaths(recorder.existenceProbes);
    expect(recorder.existenceProbes).not.toContain(globalJsonc.path);
    expect(recorder.existenceProbes).not.toContain(globalJson.path);
  });

  it("rejects the removed project alias without config filesystem access", () => {
    const recorder = createConfigAccessRecorder([projectJsonc.path, globalJsonc.path]);
    const plan = planRuntimeFooterConfigEdit("project", configRoots, true, recorder.exists);

    expect(plan).toEqual({ kind: "invalid", usage: "Usage: /runtime-footer-config [global|local]" });
    expect(recorder.existenceProbes).toEqual([]);
  });

  it("defaults a blank argument to the global canonical JSONC target", () => {
    const recorder = createConfigAccessRecorder([]);
    const plan = planRuntimeFooterConfigEdit("   ", configRoots, true, recorder.exists);

    expect(expectEditTarget(plan)).toBe(globalJsonc.path);
  });

  it("uses path-neutral completion text and explains untrusted local consumption", () => {
    const completions = runtimeFooterConfigCommandCompletions("");
    const recorder = createConfigAccessRecorder([]);
    const plan = planRuntimeFooterConfigEdit("local", configRoots, false, recorder.exists);

    expect(completions).not.toBeNull();
    expect(completions?.flatMap((completion) => [completion.label, completion.description]).join("\n")).not.toContain(
      ".pi",
    );
    if (plan.kind !== "edit") throw new Error("expected edit plan");
    expect(plan.notice).toContain(projectJsonc.path);
    expect(plan.notice).toMatch(/not consumed now/i);
    expect(plan.notice).toMatch(/requires project trust.*next startup or restart/i);
    expect(plan.notice).not.toContain(".pi");
  });
});

describe("runtime-footer status placement validation", () => {
  it("rejects malformed status tokens", () => {
    expect(() => parseConfig({ left: ["status:"], right: [] })).toThrow(/non-empty key/);
  });

  it("allows a well-formed status before its producer appears", () => {
    expect(parseConfig({ left: ["status:not-running"], right: [], branchStatusLine: false }).left).toEqual([
      { kind: "status", selector: "status:not-running", key: "not-running" },
    ]);
  });

  it.each([
    ["named alias", { left: ["session-notes", "status:session-notes"], right: [] }, "session-notes"],
    ["legacy branch line", { left: ["status:branch-status"], right: [], branchStatusLine: true }, "branch-status"],
    ["two configured sides", { left: ["status:hotl"], right: ["status:hotl"] }, "hotl"],
  ])("rejects duplicate status placement through %s", (_case, config, key) => {
    expect(() => parseConfig(config)).toThrow(new RegExp(`duplicate extension status.*${key}`));
  });
});

describe("runtime-footer thinking blocks", () => {
  it("maps every supported thinking level to a distinct glyph", () => {
    expect(DEFAULT_THINKING_MAPPING).toEqual({
      off: "▁",
      minimal: "▂",
      low: "▃",
      medium: "▄",
      high: "▅",
      xhigh: "▆",
      max: "█",
    });
    expect(new Set(Object.values(DEFAULT_THINKING_MAPPING)).size).toBe(Object.keys(DEFAULT_THINKING_MAPPING).length);
  });

  it("gives max a stronger tone than xhigh", () => {
    expect(thinkingBlockTone("xhigh")).toBe("warning");
    expect(thinkingBlockTone("max")).toBe("error");
  });

  it("strips OpenAI dot-prefixes from model ids", () => {
    expect(shortenModelId("openai.gpt-4.1-2025-04-14")).toBe("gpt-4.1");
    expect(shortenModelId("opnai.gpt-4.1-2025-04-14")).toBe("gpt-4.1");
  });
});
