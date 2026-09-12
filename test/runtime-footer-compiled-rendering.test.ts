import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { renderSide } from "../extensions/runtime-footer";
import { compileConfig } from "../extensions/shared/runtime-footer-config";

const identityTheme = {
  fg: (_tone: string, text: string) => text,
};

function compiled(source: Record<string, string | number | boolean | null | string[]>) {
  const result = compileConfig(JSON.stringify(source), "json");
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function renderLeft(
  left: string[],
  options: {
    separator?: string;
    truncate?: number | null;
    truncateBlocks?: string[] | null;
    statuses?: ReadonlyMap<string, string>;
    explicitSeparatorMode?: boolean;
  } = {},
): string {
  const config = compiled({
    left,
    right: [],
    separator: options.separator ?? " | ",
    truncate: options.truncate ?? null,
    truncateBlocks: options.truncateBlocks ?? null,
    branchStatusLine: false,
  });

  return renderSide(
    config.left,
    config.separator,
    config.truncate,
    config.truncateBlocks,
    // SAFETY: this renderer fixture only invokes the identity fg function.
    identityTheme as never,
    // SAFETY: these layouts contain no blocks that read the Pi context.
    {} as never,
    { getThinkingLevel: () => "off" },
    config,
    "main",
    { addedLines: 2, removedLines: 1, changedFiles: 1, addedFiles: 0, untrackedFiles: 0 },
    "project",
    options.statuses ?? new Map(),
    false,
    options.explicitSeparatorMode ?? config.left.some((token) => token.kind === "separator"),
  );
}

describe("runtime-footer compiled rendering", () => {
  it("retains implicit and explicit separators with the distinct text and T spacing rules", () => {
    expect(renderLeft(["text:a", "text:b"])).toBe("a | b");
    expect(renderLeft(["text:a", "T:b"])).toBe("a | b");
    expect(renderLeft(["text:a", "T:b", "sep"])).toBe("ab");
    expect(renderLeft(["T:a", "text:b", "sep"])).toBe("ab");
    expect(renderLeft(["text:a", "sep", "T:b"])).toBe("a | b");
  });

  it("uses explicit baseline spacing on a side without separators when the opposite side has one", () => {
    expect(renderLeft(["text:a", "text:b"], { explicitSeparatorMode: true })).toBe("a b");
  });

  it("applies every conditional text and T form at its retained token position", () => {
    expect(renderLeft(["cwd", "?text:x"])).toMatch(/ x$/);
    expect(renderLeft(["cwd", "unknown", "?text:x"])).not.toMatch(/ x$/);
    expect(renderLeft(["!text:x", "cwd"])).toMatch(/^x /);
    expect(renderLeft(["!text:x", "unknown", "cwd"])).not.toMatch(/^x /);
    expect(renderLeft(["cwd", "?T:x", "T:y", "sep"])).toMatch(/xy$/);
    expect(renderLeft(["!T:x", "cwd"])).toMatch(/^x/);
  });

  it("truncates exact literal and status selectors from classified token metadata", () => {
    expect(renderLeft(["text:abcdef"], { truncate: 3, truncateBlocks: ["text:abcdef"] })).toBe("abc… ");
    expect(
      stripTerminalSequences(
        renderLeft(["status:note"], {
          truncate: 3,
          truncateBlocks: ["status:note"],
          statuses: new Map([["note", "abcdef"]]),
        }),
      ),
    ).toBe("abc… ");
  });

  it("normalizes status control whitespace and ignores unavailable or ANSI-whitespace-only values", () => {
    expect(renderLeft(["status:note"], { statuses: new Map([["note", "ready\r\n\t now"]]) })).toBe("ready now");
    expect(renderLeft(["status:missing"], { statuses: new Map() })).toBe("");
    expect(renderLeft(["status:blank"], { statuses: new Map([["blank", "\x1b[31m \r\n\t \x1b[0m"]]) })).toBe("");
  });

  it("preserves ANSI and OSC status producer styling through safe truncation", () => {
    const styled = "\x1b]8;;https://example.com\x07\x1b[31mabcdef\x1b[0m\x1b]8;;\x07";
    const rendered = renderLeft(["status:link"], {
      truncate: 4,
      truncateBlocks: ["status:link"],
      statuses: new Map([["link", styled]]),
    });

    expect(stripTerminalSequences(rendered)).toBe("abcd… ");
    expect(rendered).toContain("\x1b]8;;https://example.com\x07");
    expect(rendered).toContain("\x1b]8;;\x07");
    expect(rendered).toContain("\x1b[31m");
    expect(rendered).toContain("\x1b[0m");
  });

  it("keeps git branch and diff blocks while ignoring removed git and its truncation selector", () => {
    const rendered = stripTerminalSequences(
      renderLeft(["git", "git-branch", "git-diff"], { truncate: 3, truncateBlocks: ["git"] }),
    );

    expect(rendered).toBe("main | [+2/-1 (1)]");
  });
});
