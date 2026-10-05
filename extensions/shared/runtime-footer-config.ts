export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type Result<Value, Error> = { ok: true; value: Value } | { ok: false; error: Error };

export type Diagnostic = {
  message: string;
};

export type FooterBlockId =
  | "cwd"
  | "project"
  | "git-branch"
  | "git-diff"
  | "provider"
  | "model"
  | "thinking"
  | "cost"
  | "context";

export type LayoutToken =
  | { kind: "block"; blockId: FooterBlockId }
  | { kind: "separator" }
  | {
      kind: "text";
      selector: string;
      payload: string;
      spacing: "normal" | "managed";
      condition: "none" | "prev" | "next";
    }
  | { kind: "status"; selector: string; key: string }
  | { kind: "ignored"; token: string };

type ThinkingConfig = {
  mode: "literal" | "blocks";
  mapping: Record<string, string>;
};

type ContextConfig = {
  mode: "percent" | "bar" | "blocks";
  barWidth: number;
};

export type CompiledConfig = {
  left: LayoutToken[];
  right: LayoutToken[];
  separator: string;
  truncate: number | null;
  truncateBlocks: string[] | null;
  thinking: ThinkingConfig;
  context: ContextConfig;
};

const DEFAULT_LEFT = ["cwd", "git-branch"] as const;
const DEFAULT_RIGHT = ["provider", "model", "thinking", "cost", "context"] as const;
const KNOWN_BLOCKS = new Set<string>([...DEFAULT_LEFT, ...DEFAULT_RIGHT, "project", "git-diff"]);
const THINKING_GLYPHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]);
export const DEFAULT_THINKING_MAPPING = {
  off: "▁",
  minimal: "▂",
  low: "▃",
  medium: "▄",
  high: "▅",
  xhigh: "▆",
  max: "█",
} satisfies Record<string, string>;

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

function isJsonNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number";
}

function normalizeTabs(value: string): string {
  return value.replace(/\t/g, "    ");
}

function defaultThinking(): ThinkingConfig {
  return { mode: "literal", mapping: { ...DEFAULT_THINKING_MAPPING } };
}

function defaultContext(): ContextConfig {
  return { mode: "percent", barWidth: 8 };
}

function isFooterBlockId(value: string): value is FooterBlockId {
  return KNOWN_BLOCKS.has(value);
}

function classifyToken(token: string): LayoutToken {
  if (token === "sep" || token === "S") return { kind: "separator" };

  let condition: "none" | "prev" | "next" = "none";
  let source = token;
  if (source.startsWith("?")) {
    condition = "prev";
    source = source.slice(1);
  } else if (source.startsWith("!")) {
    condition = "next";
    source = source.slice(1);
  }

  if (source.startsWith("text:") || source.startsWith("T:")) {
    const managed = source.startsWith("T:");
    return {
      kind: "text",
      selector: token,
      payload: source.slice(managed ? 2 : 5),
      spacing: managed ? "managed" : "normal",
      condition,
    };
  }

  if (token.startsWith("status:")) {
    const key = token.slice("status:".length).trim();
    return key ? { kind: "status", selector: token, key } : { kind: "ignored", token };
  }

  return isFooterBlockId(token) ? { kind: "block", blockId: token } : { kind: "ignored", token };
}

function compileSide(value: JsonValue | undefined, fallback: readonly string[]): LayoutToken[] {
  if (!Array.isArray(value)) return fallback.map(classifyToken);
  return value.filter(isJsonString).map(classifyToken);
}

function compileThinking(value: JsonValue | undefined): ThinkingConfig {
  const fallback = defaultThinking();
  const object = value ?? null;
  if (!isJsonObject(object)) return fallback;

  const mode = object.mode === "blocks" ? "blocks" : fallback.mode;
  const mapping = { ...fallback.mapping };
  const mappingValue = object.mapping ?? null;
  if (isJsonObject(mappingValue)) {
    for (const [rawKey, rawGlyph] of Object.entries(mappingValue)) {
      const key = rawKey.trim().toLowerCase();
      const glyph = isJsonString(rawGlyph) ? rawGlyph.trim() : "";
      if (key && THINKING_GLYPHS.has(glyph)) mapping[key] = glyph;
    }
  }
  return { mode, mapping };
}

function compileContext(value: JsonValue | undefined): ContextConfig {
  const fallback = defaultContext();
  const object = value ?? null;
  if (!isJsonObject(object)) return fallback;

  const mode = object.mode === "bar" || object.mode === "blocks" ? object.mode : fallback.mode;
  const barWidth = validWidth(object.barWidth) ?? fallback.barWidth;
  return { mode, barWidth };
}

function validWidth(value: JsonValue | undefined): number | undefined {
  return isJsonNumber(value) && Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined;
}

function compileTruncateBlocks(value: JsonValue | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const blocks = value
    .filter(isJsonString)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return blocks.length > 0 ? blocks : null;
}

function validateStatuses(config: CompiledConfig): Diagnostic | undefined {
  const placements = new Map<string, string>();
  for (const [side, tokens] of [
    ["left", config.left],
    ["right", config.right],
  ] as const) {
    for (const [index, token] of tokens.entries()) {
      const key = token.kind === "status" ? token.key : undefined;
      if (key === undefined) continue;
      const location = `${side}[${index}]`;
      const previous = placements.get(key);
      if (previous) return { message: `duplicate extension status "${key}" at ${previous} and ${location}` };
      placements.set(key, location);
    }
  }

  for (const tokens of [config.left, config.right]) {
    for (const token of tokens) {
      if (token.kind === "ignored" && token.token.startsWith("status:") && !token.token.slice(7).trim()) {
        return { message: `status block "${token.token}" must include a non-empty key` };
      }
    }
  }

  return undefined;
}

function decodeConfig(value: JsonValue): Result<CompiledConfig, Diagnostic> {
  if (!isJsonObject(value)) return { ok: false, error: { message: "config root must be an object" } };

  const config: CompiledConfig = {
    left: compileSide(value.left, DEFAULT_LEFT),
    right: compileSide(value.right, DEFAULT_RIGHT),
    separator: isJsonString(value.separator) ? normalizeTabs(value.separator) : " · ",
    truncate: validWidth(value.truncate) ?? null,
    truncateBlocks: compileTruncateBlocks(value.truncateBlocks),
    thinking: compileThinking(value.thinking),
    context: compileContext(value.context),
  };
  const diagnostic = validateStatuses(config);
  return diagnostic ? { ok: false, error: diagnostic } : { ok: true, value: config };
}

function stripJsonComments(source: string): Result<string, Diagnostic> {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        output += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === "/" && next === "/") {
      output += " ";
      lineComment = true;
      index += 1;
    } else if (character === "/" && next === "*") {
      output += " ";
      blockComment = true;
      index += 1;
    } else {
      output += character;
    }
  }
  return blockComment ? { ok: false, error: { message: "unterminated block comment" } } : { ok: true, value: output };
}

function stripTrailingCommas(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ",") {
      let next = index + 1;
      while (next < source.length && /\s/.test(source[next])) next += 1;
      if (source[next] === "]" || source[next] === "}") continue;
    }
    output += character;
  }
  return output;
}

function parseSource(source: string, format: "json" | "jsonc"): Result<JsonValue, Diagnostic> {
  try {
    const comments: Result<string, Diagnostic> =
      format === "jsonc" ? stripJsonComments(source) : { ok: true, value: source };
    if (!comments.ok) return comments;
    const text = format === "jsonc" ? stripTrailingCommas(comments.value) : source;
    // SAFETY: JSON.parse only returns values representable by the JSON grammar.
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export function compileConfig(source: string, format: "json" | "jsonc"): Result<CompiledConfig, Diagnostic> {
  const parsed = parseSource(source, format);
  return parsed.ok ? decodeConfig(parsed.value) : parsed;
}
