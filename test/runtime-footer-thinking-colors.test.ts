import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderSide } from "../extensions/runtime-footer";
import { compileConfig, DEFAULT_THINKING_MAPPING } from "../extensions/shared/runtime-footer-config";

function builtinTheme(name: "light" | "dark", omitMax = false): Theme {
  const root = path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  const data = JSON.parse(readFileSync(path.join(root, "modes/interactive/theme", `${name}.json`), "utf8")) as {
    vars: Record<string, string>;
    colors: Record<string, string>;
  };
  const colors = Object.fromEntries(
    Object.entries(data.colors).map(([key, value]) => [key, data.vars[value] ?? value]),
  );
  if (omitMax) delete colors.thinkingMax;
  // SAFETY: the upstream built-in JSON supplies all required theme tokens.
  return new Theme(
    colors as ConstructorParameters<typeof Theme>[0],
    colors as ConstructorParameters<typeof Theme>[1],
    "truecolor",
  );
}

function renderThinking(theme: Theme, level: string, mode = "blocks", truncate: number | null = null): string {
  const result = compileConfig(
    JSON.stringify({ left: ["thinking"], right: [], thinking: { mode, mapping: { high: "█" } }, truncate }),
    "json",
  );
  if (!result.ok) throw new Error(result.error.message);
  const config = result.value;
  return renderSide(
    config.left,
    config.separator,
    config.truncate,
    null,
    theme,
    // SAFETY: the thinking block reads only the separately supplied thinking API.
    {} as ExtensionContext,
    { getThinkingLevel: () => level },
    config,
    null,
    null,
    "",
    new Map(),
    false,
  );
}

describe.each(["light", "dark"] as const)("%s native thinking colors", (appearance) => {
  it.each(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const)(
    "matches the editor border for %s",
    (level) => {
      const theme = builtinTheme(appearance);
      const glyph = level === "high" ? "█" : DEFAULT_THINKING_MAPPING[level];
      expect(renderThinking(theme, level)).toBe(theme.getThinkingBorderColor(level)(glyph));
    },
  );

  it("keeps literal mode dim and unknown levels off", () => {
    const theme = builtinTheme(appearance);
    expect(renderThinking(theme, "high", "literal")).toBe(theme.fg("dim", "high"));
    expect(renderThinking(theme, "unknown")).toBe(theme.getThinkingBorderColor("off")("▁"));
  });

  it("retains the configured glyph and color at the minimum truncation width", () => {
    const theme = builtinTheme(appearance);
    expect(renderThinking(theme, "high", "blocks", 1)).toBe(theme.getThinkingBorderColor("high")("█"));
  });

  it("inherits Pi's max fallback for themes without thinkingMax", () => {
    const theme = builtinTheme(appearance, true);
    expect(renderThinking(theme, "max")).toBe(theme.getThinkingBorderColor("xhigh")("█"));
  });
});
