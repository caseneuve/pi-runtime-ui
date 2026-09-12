import { describe, expect, it } from "vitest";

import { compileConfig } from "../extensions/shared/runtime-footer-config";

function expectConfig(source: string, format: "json" | "jsonc" = "json") {
  const result = compileConfig(source, format);
  if (!result.ok) throw new Error(`expected config, received: ${result.error.message}`);
  return result.value;
}

describe("runtime-footer config compiler", () => {
  it("accepts comments and trailing commas only in JSONC", () => {
    const source = '{ // comment\n "separator": " / ", }';

    expect(compileConfig(source, "json").ok).toBe(false);
    expect(expectConfig(source, "jsonc").separator).toBe(" / ");
  });

  it("rejects JSONC comments that conceal malformed syntax", () => {
    expect(compileConfig('{"truncate":1/* comment */2}', "jsonc").ok).toBe(false);
  });

  it("rejects unterminated JSONC block comments", () => {
    expect(compileConfig("{} /* unterminated", "jsonc").ok).toBe(false);
  });

  it("uses defaults and normalizes every supported field", () => {
    const config = expectConfig(
      JSON.stringify({
        left: ["cwd", 3, "unknown"],
        right: "not-an-array",
        separator: "\t|\t",
        truncate: 3.9,
        truncateBlocks: [" cwd ", "", 2],
        thinking: { mode: "blocks", mapping: { " High ": " ▆ ", ignored: "x" } },
        context: { mode: "bar", barWidth: 4.9 },
        branchStatusLine: false,
        extra: "ignored",
      }),
    );

    expect(config.left).toEqual([
      { kind: "block", blockId: "cwd" },
      { kind: "ignored", token: "unknown" },
    ]);
    expect(config.right).toEqual([
      { kind: "block", blockId: "provider" },
      { kind: "block", blockId: "model" },
      { kind: "block", blockId: "thinking" },
      { kind: "block", blockId: "cost" },
      { kind: "block", blockId: "context" },
    ]);
    expect(config.separator).toBe("    |    ");
    expect(config.truncate).toBe(3);
    expect(config.truncateBlocks).toEqual(["cwd"]);
    expect(config.thinking).toEqual({
      mode: "blocks",
      mapping: expect.objectContaining({ high: "▆", medium: "▄" }),
    });
    expect(config.context).toEqual({ mode: "bar", barWidth: 4 });
    expect(config.branchStatusLine).toBe(false);
  });

  it("uses fallback values for absent, invalid, and effectively empty fields", () => {
    const config = expectConfig(
      JSON.stringify({
        left: null,
        right: [null, "git-branch"],
        separator: 1,
        truncate: Number.NaN,
        truncateBlocks: ["", "  ", 1],
        thinking: { mode: "literal", mapping: { " ": "█", high: "not-a-glyph" } },
        context: { mode: "other", barWidth: 0 },
        branchStatusLine: "false",
      }),
    );

    expect(config.left.map((token) => (token.kind === "block" ? token.blockId : token.kind))).toEqual([
      "cwd",
      "git-branch",
      "session-notes",
    ]);
    expect(config.right).toEqual([{ kind: "block", blockId: "git-branch" }]);
    expect(config.separator).toBe(" · ");
    expect(config.truncate).toBeNull();
    expect(config.truncateBlocks).toBeNull();
    expect(config.thinking).toEqual({
      mode: "literal",
      mapping: {
        off: "▁",
        minimal: "▂",
        low: "▃",
        medium: "▄",
        high: "▅",
        xhigh: "▆",
        max: "█",
      },
    });
    expect(config.context).toEqual({ mode: "percent", barWidth: 8 });
    expect(config.branchStatusLine).toBe(true);
  });

  it("rejects invalid scalar values while accepting context blocks", () => {
    const config = expectConfig(
      '{"left":"not-an-array","right":[1,"unknown"],"separator":null,"truncate":1e999,"truncateBlocks":"cwd","thinking":{"mode":"other"},"context":{"mode":"blocks","barWidth":1e999},"branchStatusLine":null}',
    );

    expect(config.left).toHaveLength(3);
    expect(config.right).toEqual([{ kind: "ignored", token: "unknown" }]);
    expect(config.separator).toBe(" · ");
    expect(config.truncate).toBeNull();
    expect(config.truncateBlocks).toBeNull();
    expect(config.thinking.mode).toBe("literal");
    expect(config.context).toEqual({ mode: "blocks", barWidth: 8 });
    expect(config.branchStatusLine).toBe(true);
  });

  it("classifies each retained DSL form once, including ignored positions", () => {
    const config = expectConfig(
      JSON.stringify({
        left: [
          "sep",
          "S",
          "text:plain",
          "T:managed",
          "?text:before",
          "!text:after",
          "?T:left",
          "!T:right",
          "status: kilo ",
          "unknown",
        ],
        right: [],
        branchStatusLine: false,
      }),
    );

    expect(config.left).toEqual([
      { kind: "separator" },
      { kind: "separator" },
      { kind: "text", selector: "text:plain", payload: "plain", spacing: "normal", condition: "none" },
      { kind: "text", selector: "T:managed", payload: "managed", spacing: "managed", condition: "none" },
      { kind: "text", selector: "?text:before", payload: "before", spacing: "normal", condition: "prev" },
      { kind: "text", selector: "!text:after", payload: "after", spacing: "normal", condition: "next" },
      { kind: "text", selector: "?T:left", payload: "left", spacing: "managed", condition: "prev" },
      { kind: "text", selector: "!T:right", payload: "right", spacing: "managed", condition: "next" },
      { kind: "status", selector: "status: kilo ", key: "kilo" },
      { kind: "ignored", token: "unknown" },
    ]);
  });

  it("diagnoses non-object roots, empty statuses, and duplicate logical statuses", () => {
    expect(compileConfig("[]", "json")).toEqual({
      ok: false,
      error: { message: "config root must be an object" },
    });
    expect(compileConfig('{"left":["status:"],"right":[]}', "json")).toEqual({
      ok: false,
      error: { message: 'status block "status:" must include a non-empty key' },
    });
    expect(compileConfig('{"left":["session-notes"],"right":["status:session-notes"]}', "json")).toEqual({
      ok: false,
      error: { message: 'duplicate extension status "session-notes" at left[0] and right[0]' },
    });
    expect(compileConfig('{"left":["status:branch-status"],"right":[]}', "json")).toEqual({
      ok: false,
      error: { message: 'duplicate extension status "branch-status" at left[0] and branchStatusLine' },
    });
  });

  it("treats removed git syntax as ignored without special truncation semantics", () => {
    const config = expectConfig(
      JSON.stringify({ left: ["git", "git-branch", "git-diff"], right: [], truncateBlocks: ["git"] }),
    );

    expect(config.left).toEqual([
      { kind: "ignored", token: "git" },
      { kind: "block", blockId: "git-branch" },
      { kind: "block", blockId: "git-diff" },
    ]);
    expect(config.truncateBlocks).toEqual(["git"]);
  });
});
