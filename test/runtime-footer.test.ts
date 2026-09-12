import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THINKING_MAPPING,
  parseConfig,
  renderExternalStatusToken,
  renderSide,
  shortenModelId,
  thinkingBlockTone,
} from "../extensions/runtime-footer";

const identityTheme = {
  fg: (_tone: string, text: string) => text,
};

function renderStatusSide(tokens: string[], explicitSeparatorMode: boolean): string {
  const config = parseConfig({
    left: tokens,
    right: [],
    separator: " | ",
    truncate: 4,
    truncateBlocks: ["status:kilo"],
    branchStatusLine: false,
  });
  if (!config) throw new Error("expected valid test config");

  return renderSide(
    config.left,
    config.separator,
    config.truncate,
    config.truncateBlocks,
    identityTheme as never,
    {} as never,
    {} as never,
    config,
    null,
    null,
    "",
    new Map([["kilo", "\x1b]8;;https://example.com\x07\x1b[31mabcdef\x1b[0m\x1b]8;;\x07"]]),
    false,
    explicitSeparatorMode,
  );
}

describe("runtime-footer external statuses", () => {
  it("resolves a named extension status and preserves its styling", () => {
    const styled = "\x1b[32m42%\x1b[39m";
    const statuses = new Map([["kilo-usage-day", styled]]);

    expect(renderExternalStatusToken("status: kilo-usage-day ", statuses)).toEqual({
      plain: "42%",
      styled,
      tone: "dim",
      preserveStyleOnTruncate: true,
    });
  });

  it("normalizes control whitespace and strips OSC/APC sequences from plain text", () => {
    const styled = "\x1b]8;;https://example.com\x07ready\r\n\t now\x1b]8;;\x07\x1b_pi-marker\x1b\\";
    const result = renderExternalStatusToken("status:link", new Map([["link", styled]]));

    expect(result?.plain).toBe("ready now");
    expect(stripTerminalSequences(result?.styled ?? "")).toBe("ready now");
    expect(result?.styled).toContain("\x1b]8;;https://example.com\x07");
  });

  it("ignores missing, empty, and styled-whitespace-only statuses", () => {
    const statuses = new Map([
      ["empty", ""],
      ["spaces", "\x1b[31m \r\n\t \x1b[0m"],
    ]);

    expect(renderExternalStatusToken("provider", statuses)).toBeUndefined();
    expect(renderExternalStatusToken("status:missing", statuses)).toBeUndefined();
    expect(renderExternalStatusToken("status:empty", statuses)).toBeUndefined();
    expect(renderExternalStatusToken("status:spaces", statuses)).toBeUndefined();
  });

  it("reflects status appearance, updates, and clearing", () => {
    const statuses = new Map<string, string>();

    expect(renderExternalStatusToken("status:hotl", statuses)).toBeUndefined();
    statuses.set("hotl", "running 2");
    expect(renderExternalStatusToken("status:hotl", statuses)?.plain).toBe("running 2");
    statuses.set("hotl", "done 2");
    expect(renderExternalStatusToken("status:hotl", statuses)?.plain).toBe("done 2");
    statuses.delete("hotl");
    expect(renderExternalStatusToken("status:hotl", statuses)).toBeUndefined();
  });

  it.each([
    ["implicit", ["status:kilo", "text:tail"], false],
    ["explicit", ["status:kilo", "sep", "text:tail"], true],
  ])("preserves status styling during %s-separator truncation", (_mode, tokens, explicit) => {
    const rendered = renderStatusSide(tokens as string[], explicit as boolean);
    const plain = stripTerminalSequences(rendered);

    expect(plain).toContain("abcd… ");
    expect(plain).not.toContain("abcde");
    expect(visibleWidth(rendered)).toBe(visibleWidth(plain));
    expect(rendered).toContain("\x1b]8;;https://example.com\x07");
    expect(rendered).toContain("\x1b]8;;\x07");
    expect(rendered).toContain("\x1b[31m");
    expect(rendered).toContain("\x1b[0m");
  });
});

describe("runtime-footer status placement validation", () => {
  it("rejects malformed status tokens", () => {
    expect(() => parseConfig({ left: ["status:"], right: [] })).toThrow(/non-empty key/);
  });

  it("allows a well-formed status before its producer appears", () => {
    expect(parseConfig({ left: ["status:not-running"], right: [], branchStatusLine: false })?.left).toEqual([
      "status:not-running",
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
