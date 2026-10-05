import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
  type SessionStartEvent,
  type SessionTreeEvent,
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { openExternalEditor } from "./shared/external-editor";
import {
  type CompiledConfig,
  compileConfig,
  type FooterBlockId,
  type LayoutToken,
} from "./shared/runtime-footer-config";
import {
  formatGitStatsPlain,
  formatGitStatsStyled,
  type GitStats,
  type GitStatsCache,
  getGitStats,
} from "./shared/runtime-status-git";

const MIN_GAP = 2;
const PROJECT_NAME_TTL_MS = 2000;
const CONFIG_CHECK_TTL_MS = 1000;

const COMMAND_NAME = "runtime-footer-config";
const CONFIG_CHANGED_EVENT = "runtime-footer:config-changed";

type ProjectNameCache = {
  cwd: string;
  checkedAt: number;
  name: string;
};

type FooterConfigCache = {
  cwd: string;
  projectTrusted: boolean;
  checkedAt: number;
  sourcePath: string | null;
  sourceMtimeMs: number | null;
  config: CompiledConfig;
  error?: string;
};

export type RuntimeFooterConfigScope = "project" | "global";

export type RuntimeFooterConfigFormat = "jsonc" | "json";

export type RuntimeFooterConfigRoots = {
  cwd: string;
  agentDir: string;
  configDirName: string;
};

export type RuntimeFooterConfigCandidate = {
  scope: RuntimeFooterConfigScope;
  format: RuntimeFooterConfigFormat;
  path: string;
};

export type RuntimeFooterConfigExistenceFact = {
  path: string;
  exists: boolean;
};

const RUNTIME_FOOTER_CONFIG_FORMATS = ["jsonc", "json"] as const;

export type RuntimeFooterConfigEditMode = "global" | "local";

export type RuntimeFooterConfigEditPlan =
  | {
      kind: "invalid";
      usage: string;
    }
  | {
      kind: "edit";
      target: RuntimeFooterConfigCandidate;
      notice: string | undefined;
    };

export type RuntimeFooterConfigCommandCompletion = {
  label: RuntimeFooterConfigEditMode;
  value: RuntimeFooterConfigEditMode;
  description: string;
};

const RUNTIME_FOOTER_CONFIG_COMMAND_USAGE = "Usage: /runtime-footer-config [global|local]";
const RUNTIME_FOOTER_CONFIG_COMMAND_COMPLETIONS: readonly RuntimeFooterConfigCommandCompletion[] = [
  {
    label: "global",
    value: "global",
    description: "edit the global runtime-footer config",
  },
  {
    label: "local",
    value: "local",
    description: "edit the project runtime-footer config",
  },
];

function configFilename(format: RuntimeFooterConfigFormat): "config.jsonc" | "config.json" {
  return format === "jsonc" ? "config.jsonc" : "config.json";
}

function planConfigCandidatesForScope(
  roots: RuntimeFooterConfigRoots,
  scope: RuntimeFooterConfigScope,
): RuntimeFooterConfigCandidate[] {
  const configRoot = scope === "project" ? path.join(roots.cwd, roots.configDirName) : roots.agentDir;

  return RUNTIME_FOOTER_CONFIG_FORMATS.map((format) => ({
    scope,
    format,
    path: path.join(configRoot, "extensions", "runtime-footer", configFilename(format)),
  }));
}

export function planAutomaticConfigCandidates(
  roots: RuntimeFooterConfigRoots,
  projectTrusted: boolean,
): RuntimeFooterConfigCandidate[] {
  const globalCandidates = planConfigCandidatesForScope(roots, "global");
  if (!projectTrusted) return globalCandidates;

  return [...planConfigCandidatesForScope(roots, "project"), ...globalCandidates];
}

export function planEditConfigCandidates(
  roots: RuntimeFooterConfigRoots,
  scope: RuntimeFooterConfigScope,
): RuntimeFooterConfigCandidate[] {
  return planConfigCandidatesForScope(roots, scope);
}

export function selectFirstExistingConfigCandidate(
  candidates: readonly RuntimeFooterConfigCandidate[],
  existenceFacts: readonly RuntimeFooterConfigExistenceFact[],
): RuntimeFooterConfigCandidate | undefined {
  const existingPaths = new Set(existenceFacts.filter((fact) => fact.exists).map((fact) => fact.path));
  return candidates.find((candidate) => existingPaths.has(candidate.path));
}

type ConfigFileExists = (pathname: string) => boolean;
type ConfigFileMtime = (pathname: string) => number;
type ConfigFileText = (pathname: string) => string;

function collectExistenceFacts(
  candidates: readonly RuntimeFooterConfigCandidate[],
  fileExists: ConfigFileExists,
): RuntimeFooterConfigExistenceFact[] {
  const facts: RuntimeFooterConfigExistenceFact[] = [];
  for (const candidate of candidates) {
    const exists = fileExists(candidate.path);
    facts.push({ path: candidate.path, exists });
    if (exists) break;
  }
  return facts;
}

export function resolveAutomaticConfigSource(
  roots: RuntimeFooterConfigRoots,
  projectTrusted: boolean,
  fileExists: ConfigFileExists,
): RuntimeFooterConfigCandidate | undefined {
  const candidates = planAutomaticConfigCandidates(roots, projectTrusted);
  const existenceFacts = collectExistenceFacts(candidates, fileExists);
  return selectFirstExistingConfigCandidate(candidates, existenceFacts);
}

export function runtimeFooterConfigCommandCompletions(prefix: string): RuntimeFooterConfigCommandCompletion[] | null {
  const normalized = prefix.trim().toLowerCase();
  const completions = RUNTIME_FOOTER_CONFIG_COMMAND_COMPLETIONS.filter((completion) =>
    completion.value.startsWith(normalized),
  );
  return completions.length > 0 ? completions : null;
}

export function planRuntimeFooterConfigEdit(
  args: string,
  roots: RuntimeFooterConfigRoots,
  projectTrusted: boolean,
  fileExists: ConfigFileExists,
): RuntimeFooterConfigEditPlan {
  const modeRaw = args.trim();
  const mode: RuntimeFooterConfigEditMode | undefined =
    modeRaw === "" ? "global" : modeRaw === "global" || modeRaw === "local" ? modeRaw : undefined;
  if (!mode) return { kind: "invalid", usage: RUNTIME_FOOTER_CONFIG_COMMAND_USAGE };

  const scope: RuntimeFooterConfigScope = mode === "local" ? "project" : "global";
  const candidates = planEditConfigCandidates(roots, scope);
  const target =
    selectFirstExistingConfigCandidate(candidates, collectExistenceFacts(candidates, fileExists)) ?? candidates[0];
  if (!target) throw new Error("runtime-footer config candidates must include JSONC");

  return {
    kind: "edit",
    target,
    notice:
      mode === "local" && !projectTrusted
        ? `Project-local runtime-footer config at ${target.path} is not consumed now; it requires project trust on the next startup or restart.`
        : undefined,
  };
}

function runtimeFooterConfigRoots(cwd: string, agentDir: string): RuntimeFooterConfigRoots {
  return { cwd, agentDir, configDirName: CONFIG_DIR_NAME };
}

const CONTEXT_BLOCK_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
const CONTEXT_BAR_FILLED = "█";
const CONTEXT_BAR_EMPTY = "░";
function defaultConfigText(): string {
  return `{
  // Ordered block ids rendered on the left side.
  "left": ["cwd", "git-branch"],

  // Ordered block ids rendered on the right side.
  "right": ["provider", "model", "thinking", "cost", "context"],

  // Separator inserted between rendered blocks.
  "separator": " · ",

  // Optional per-block truncation (visible width). Use null to disable.
  "truncate": null,

  // Optional list of block ids eligible for truncation.
  // Omit or set [] to allow truncation on all blocks.
  "truncateBlocks": [],

  // Thinking block formatting.
  "thinking": {
    // "literal" (default) or "blocks"
    "mode": "literal",

    // Used only in "blocks" mode; keys are thinking levels.
    "mapping": {
      "off": "▁",
      "minimal": "▂",
      "low": "▃",
      "medium": "▄",
      "high": "▅",
      "xhigh": "▆",
      "max": "█"
    }
  },

  // Context block formatting.
  "context": {
    // "percent" (default), "bar", or "blocks"
    "mode": "percent",

    // Used only in "bar" mode.
    "barWidth": 8
  },

  // Available block ids:
  // cwd, project, git-branch, git-diff, provider, model, thinking, cost, context
  // status:<key> renders any extension status.
  // Status values are normalized to one line; missing/empty values render nothing.
  // Empty status keys and duplicate placements are configuration errors.
  // sep, S (explicit separator pseudo-block)
  // text:<payload> uses ordinary spacing; T:<payload> manages its adjacent spacing.
  // ?text:<payload> / ?T:<payload> (show only when previous non-separator token renders non-empty)
  // !text:<payload> / !T:<payload> (show only when next non-separator token renders non-empty)
  // Unknown tokens, including the removed git shorthand, are ignored.
}
`;
}

function normalizeTabs(text: string): string {
  return text.replace(/\t/g, "    ");
}

function readConfigMtime(pathname: string): number {
  return statSync(pathname).mtimeMs;
}

function readConfigText(pathname: string): string {
  return readFileSync(pathname, "utf8");
}

const defaultConfigResult = compileConfig("{}", "json");
if (!defaultConfigResult.ok) throw new Error(defaultConfigResult.error.message);
const DEFAULT_COMPILED_CONFIG = defaultConfigResult.value;

export function readFooterConfig(
  roots: RuntimeFooterConfigRoots,
  projectTrusted: boolean,
  previous: FooterConfigCache | undefined,
  fileExists: ConfigFileExists = existsSync,
  readMtime: ConfigFileMtime = readConfigMtime,
  readText: ConfigFileText = readConfigText,
): FooterConfigCache {
  const now = Date.now();
  const { cwd } = roots;
  if (
    previous &&
    previous.cwd === cwd &&
    previous.projectTrusted === projectTrusted &&
    now - previous.checkedAt < CONFIG_CHECK_TTL_MS
  ) {
    return previous;
  }

  const source = resolveAutomaticConfigSource(roots, projectTrusted, fileExists);
  const fallback = DEFAULT_COMPILED_CONFIG;
  if (!source) {
    return { cwd, projectTrusted, checkedAt: now, sourcePath: null, sourceMtimeMs: null, config: fallback };
  }

  let sourceMtimeMs: number | null;
  try {
    sourceMtimeMs = readMtime(source.path);
  } catch {
    sourceMtimeMs = null;
  }
  if (
    previous &&
    previous.cwd === cwd &&
    previous.projectTrusted === projectTrusted &&
    previous.sourcePath === source.path &&
    previous.sourceMtimeMs === sourceMtimeMs
  ) {
    return { ...previous, checkedAt: now };
  }

  try {
    const result = compileConfig(readText(source.path), source.format);
    if (result.ok) {
      return {
        cwd,
        projectTrusted,
        checkedAt: now,
        sourcePath: source.path,
        sourceMtimeMs,
        config: result.value,
      };
    }
    return {
      cwd,
      projectTrusted,
      checkedAt: now,
      sourcePath: source.path,
      sourceMtimeMs,
      config: fallback,
      error: `${source.path}: ${result.error.message}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      cwd,
      projectTrusted,
      checkedAt: now,
      sourcePath: source.path,
      sourceMtimeMs,
      config: fallback,
      error: `${source.path}: ${message}`,
    };
  }
}

function formatCwd(): string {
  const cwd = process.cwd();
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}` || "~";
  }
  return cwd;
}

function computeProjectName(): string {
  const gitRoot = runGit(["rev-parse", "--show-toplevel"])?.trim();
  const source = gitRoot && gitRoot.length > 0 ? gitRoot : process.cwd();
  const base = path.basename(source);
  return base || source;
}

const PROVIDER_SHORT = {
  "amazon-bedrock": "bedrock",
  "azure-openai": "azure",
  "google-vertex": "vertex",
  "openai-codex": "openai",
} satisfies Record<string, string>;

function shortenProvider(raw: string): string {
  return Object.entries(PROVIDER_SHORT).find(([provider]) => provider === raw)?.[1] ?? raw;
}

/**
 * Strip noisy prefixes and date/version suffixes from model IDs.
 *
 *   us.anthropic.claude-sonnet-4-20250514-v1:0  →  claude-sonnet-4
 *   anthropic/claude-opus-4-20250514-v1:0       →  claude-opus-4
 *   eu.anthropic.claude-3-5-haiku-20241022-v1:0 →  claude-3-5-haiku
 *   gpt-4.1-2025-04-14                          →  gpt-4.1
 *   openai.gpt-4.1-2025-04-14                   →  gpt-4.1
 */
export function shortenModelId(raw: string): string {
  let id = raw;

  // Strip region+vendor dot-prefix (e.g. "us.anthropic.")
  id = id.replace(/^[a-z]{2,4}\.[a-z]+\./, "");

  // Strip OpenAI's dot-prefix (including the historical "opnai" spelling).
  id = id.replace(/^(?:openai|opnai)\./, "");

  // Strip slash-prefix (e.g. "anthropic/")
  id = id.replace(/^[^/]+\//, "");

  // Strip date stamp + optional version tag at the end
  //   -20250514-v1:0 | -20241022-v1:0 | -2025-04-14
  id = id.replace(/-\d{4,}[-]?\d{2,}[-]?\d{2,}.*$/, "");

  return id || raw;
}

function formatProvider(ctx: ExtensionContext): string {
  return shortenProvider(ctx.model?.provider ?? "no-provider");
}

function formatModel(ctx: ExtensionContext): string {
  return shortenModelId(ctx.model?.id ?? "no-model");
}

type RuntimeFooterThinkingApi = {
  getThinkingLevel(): string;
};

function formatThinking(pi: RuntimeFooterThinkingApi): string {
  return pi.getThinkingLevel();
}

function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    });
  } catch {
    return null;
  }
}

function getProjectName(cache: ProjectNameCache | undefined): ProjectNameCache {
  const now = Date.now();
  const cwd = process.cwd();
  if (cache && cache.cwd === cwd && now - cache.checkedAt < PROJECT_NAME_TTL_MS) {
    return cache;
  }

  return {
    cwd,
    checkedAt: now,
    name: computeProjectName(),
  };
}

function formatCost(ctx: ExtensionContext): string | null {
  let cost = 0;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      cost += entry.message.usage?.cost?.total ?? 0;
    }
  }

  if (cost <= 0) {
    return null;
  }

  return `$${cost.toFixed(cost >= 10 ? 1 : 2)}`;
}

function getContextUsagePercent(ctx: ExtensionContext): number | null {
  const usage = ctx.getContextUsage?.();
  const contextWindow = ctx.model?.contextWindow;

  if (!usage || usage.tokens === null || !contextWindow || contextWindow <= 0) {
    return null;
  }

  return Math.max(0, Math.min(999, Math.round((usage.tokens / contextWindow) * 100)));
}

function contextPercentTone(percent: number): "dim" | "warning" | "error" {
  if (percent >= 90) return "error";
  if (percent >= 80) return "warning";
  return "dim";
}

function contextHeatTone(percent: number): "success" | "dim" | "warning" | "error" {
  if (percent <= 20) return "success";
  if (percent <= 70) return "dim";
  if (percent <= 85) return "warning";
  return "error";
}

export function thinkingBlockTone(level: string): "dim" | "success" | "accent" | "warning" | "error" {
  const normalized = level.trim().toLowerCase();
  if (normalized === "off" || normalized === "minimal") return "dim";
  if (normalized === "low") return "success";
  if (normalized === "medium") return "accent";
  if (normalized === "high" || normalized === "xhigh") return "warning";
  if (normalized === "max") return "error";
  return "dim";
}

function contextBarText(percent: number, width: number): string {
  const fill = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  return `${CONTEXT_BAR_FILLED.repeat(fill)}${CONTEXT_BAR_EMPTY.repeat(Math.max(0, width - fill))}`;
}

function contextBlockText(percent: number): string {
  const ratio = Math.max(0, Math.min(1, percent / 100));
  const index = Math.max(
    0,
    Math.min(CONTEXT_BLOCK_GLYPHS.length - 1, Math.round(ratio * (CONTEXT_BLOCK_GLYPHS.length - 1))),
  );
  return CONTEXT_BLOCK_GLYPHS[index];
}

type RenderBlockParams = {
  blockId: FooterBlockId;
  theme: ExtensionContext["ui"]["theme"];
  ctx: ExtensionContext;
  pi: RuntimeFooterThinkingApi;
  config: CompiledConfig;
  gitBranch: string | null;
  gitStats: GitStats | null;
  projectName: string;
  statuses: ReadonlyMap<string, string>;
};

type FooterBlockText = {
  plain: string;
  styled: string;
  tone: "dim" | "accent" | "success" | "warning" | "error";
  preserveStyleOnTruncate?: boolean;
};

function renderBlock(params: RenderBlockParams): FooterBlockText | undefined {
  const { blockId, theme, ctx, pi, config, gitBranch, gitStats, projectName } = params;

  switch (blockId) {
    case "cwd": {
      const plain = formatCwd();
      return { plain, styled: theme.fg("dim", plain), tone: "dim" };
    }
    case "project": {
      const plain = projectName;
      return { plain, styled: theme.fg("dim", plain), tone: "dim" };
    }
    case "git-branch": {
      if (!gitBranch) return undefined;
      return {
        plain: gitBranch,
        styled: theme.fg("dim", gitBranch),
        tone: "dim",
      };
    }
    case "git-diff": {
      const statsPlain = formatGitStatsPlain(gitStats);
      const statsStyled = formatGitStatsStyled(theme, gitStats);
      if (!statsPlain || !statsStyled) return undefined;
      return { plain: statsPlain, styled: statsStyled, tone: "dim" };
    }
    case "provider": {
      const plain = formatProvider(ctx);
      return { plain, styled: theme.fg("dim", plain), tone: "dim" };
    }
    case "model": {
      const plain = formatModel(ctx);
      return { plain, styled: theme.fg("dim", plain), tone: "dim" };
    }
    case "thinking": {
      const level = formatThinking(pi);
      if (config.thinking.mode === "blocks") {
        const glyph = config.thinking.mapping[level.toLowerCase()] ?? config.thinking.mapping[level] ?? "▁";
        const tone = thinkingBlockTone(level);
        return { plain: glyph, styled: theme.fg(tone, glyph), tone };
      }
      return { plain: level, styled: theme.fg("dim", level), tone: "dim" };
    }
    case "cost": {
      const plain = formatCost(ctx);
      return plain ? { plain, styled: theme.fg("dim", plain), tone: "dim" } : undefined;
    }
    case "context": {
      const percent = getContextUsagePercent(ctx);
      if (percent === null) return undefined;

      if (config.context.mode === "bar") {
        const plain = contextBarText(percent, config.context.barWidth);
        const tone = contextHeatTone(percent);
        return { plain, styled: theme.fg(tone, plain), tone };
      }

      if (config.context.mode === "blocks") {
        const plain = contextBlockText(percent);
        const tone = contextHeatTone(percent);
        return { plain, styled: theme.fg(tone, plain), tone };
      }

      const plain = `${percent}%`;
      const tone = contextPercentTone(percent);
      return { plain, styled: theme.fg(tone, plain), tone };
    }
    default:
      return undefined;
  }
}

function shouldTruncateToken(token: LayoutToken, truncateBlocks: string[] | null): boolean {
  if (!truncateBlocks) return token.kind !== "separator";
  const selector =
    token.kind === "block"
      ? token.blockId
      : token.kind === "text" || token.kind === "status"
        ? token.selector
        : undefined;
  return selector !== undefined && truncateBlocks.includes(selector);
}

function renderTruncatedBlock(
  block: FooterBlockText,
  maxWidth: number,
  theme: ExtensionContext["ui"]["theme"],
): string {
  if (block.preserveStyleOnTruncate) {
    return `${truncateToWidth(block.styled, maxWidth, "")}${theme.fg("dim", "… ")}`;
  }
  return theme.fg(block.tone, `${clipPlainTextToWidth(block.plain, maxWidth)}… `);
}

function renderStatus(key: string, statuses: ReadonlyMap<string, string>): FooterBlockText | undefined {
  const value = statuses.get(key);
  if (!value) return undefined;
  const styled = value
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
  const plain = stripTerminalSequences(styled);
  return plain.trim() ? { plain, styled, tone: "dim", preserveStyleOnTruncate: true } : undefined;
}

function renderToken(token: LayoutToken, params: Omit<RenderBlockParams, "blockId">): FooterBlockText | undefined {
  if (token.kind === "block") return renderBlock({ ...params, blockId: token.blockId });
  if (token.kind === "status") return renderStatus(token.key, params.statuses);
  if (token.kind === "text" && token.payload.trim()) {
    return { plain: token.payload, styled: params.theme.fg("dim", token.payload), tone: "dim" };
  }
  return undefined;
}

function conditionAllows(
  token: LayoutToken,
  index: number,
  tokens: readonly LayoutToken[],
  rendered: readonly (FooterBlockText | undefined)[],
): boolean {
  if (token.kind !== "text" || token.condition === "none") return true;
  const step = token.condition === "prev" ? -1 : 1;
  for (let cursor = index + step; cursor >= 0 && cursor < tokens.length; cursor += step) {
    if (tokens[cursor]?.kind === "separator") continue;
    return Boolean(rendered[cursor]?.plain.trim());
  }
  return false;
}

export function renderSide(
  tokens: readonly LayoutToken[],
  separator: string,
  truncate: number | null,
  truncateBlocks: string[] | null,
  theme: ExtensionContext["ui"]["theme"],
  ctx: ExtensionContext,
  pi: RuntimeFooterThinkingApi,
  config: CompiledConfig,
  gitBranch: string | null,
  gitStats: GitStats | null,
  projectName: string,
  statuses: ReadonlyMap<string, string>,
  explicitSeparatorMode: boolean,
): string {
  const params = { theme, ctx, pi, config, gitBranch, gitStats, projectName, statuses };
  const rendered = tokens.map((token) => renderToken(token, params));
  const explicitSeparators = explicitSeparatorMode;
  const renderedSeparator = theme.fg("dim", normalizeTabs(separator));
  const parts: string[] = [];
  let pendingSeparator = false;
  let previousSpacing: "normal" | "managed" = "normal";

  for (const [index, token] of tokens.entries()) {
    if (token.kind === "separator") {
      if (explicitSeparators && parts.length > 0) pendingSeparator = true;
      continue;
    }
    const block = rendered[index];
    if (!block || !conditionAllows(token, index, tokens, rendered)) continue;
    const textSpacing = token.kind === "text" ? token.spacing : "normal";
    const value =
      truncate && shouldTruncateToken(token, truncateBlocks) && visibleWidth(block.plain) > truncate
        ? renderTruncatedBlock(block, truncate, theme)
        : block.styled;
    if (parts.length > 0) {
      if (!explicitSeparators) parts.push(renderedSeparator);
      else if (pendingSeparator) parts.push(renderedSeparator);
      else if (previousSpacing === "normal" && textSpacing === "normal") parts.push(" ");
    }
    parts.push(value);
    pendingSeparator = false;
    previousSpacing = textSpacing;
  }
  return parts.join("");
}

function clipPlainTextToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";

  let out = "";
  let width = 0;

  for (const ch of text) {
    const chWidth = visibleWidth(ch);
    if (width + chWidth > maxWidth) break;
    out += ch;
    width += chWidth;
  }

  return out;
}

function renderFooterLine(width: number, left: string, right: string): string {
  const safeLeft = normalizeTabs(left);
  const safeRight = normalizeTabs(right);
  const gap = " ".repeat(Math.max(MIN_GAP, width - visibleWidth(safeLeft) - visibleWidth(safeRight)));
  return truncateToWidth(`${safeLeft}${gap}${safeRight}`, width);
}

function ensureConfigFile(pathname: string): void {
  mkdirSync(path.dirname(pathname), { recursive: true });
  if (!existsSync(pathname)) {
    writeFileSync(pathname, defaultConfigText(), "utf8");
  }
}

type RuntimeFooterEditorResult = { ok: boolean; message: string };

async function openConfigInEditor(ctx: ExtensionContext, pathname: string): Promise<RuntimeFooterEditorResult> {
  const editorCommand = process.env.VISUAL || process.env.EDITOR;
  if (!editorCommand) {
    return {
      ok: false,
      message: `Set $VISUAL or $EDITOR. Config path: ${pathname}`,
    };
  }
  if (!editorCommand.trim()) {
    return {
      ok: false,
      message: `Invalid editor command. Config path: ${pathname}`,
    };
  }

  const result = await openExternalEditor(ctx.ui, editorCommand, pathname);
  return result.ok ? { ok: true, message: `Updated ${pathname}` } : result;
}

export type RuntimeFooterSessionRegistration =
  | {
      event: "session_start";
      handler: (event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void;
    }
  | {
      event: "session_tree";
      handler: (event: SessionTreeEvent, ctx: ExtensionContext) => Promise<void> | void;
    };

export type RuntimeFooterExtensionApi = {
  events: ExtensionAPI["events"];
  getThinkingLevel(): string;
  on(registration: RuntimeFooterSessionRegistration): void;
  registerCommand(
    name: string,
    command: {
      description?: string;
      getArgumentCompletions?: (prefix: string) => RuntimeFooterConfigCommandCompletion[] | null;
      handler(args: string, ctx: ExtensionContext): Promise<void>;
    },
  ): void;
};

export type RuntimeFooterExtensionEffects = {
  getAgentDir(): string;
  fileExists: ConfigFileExists;
  readMtime: ConfigFileMtime;
  readText: ConfigFileText;
  ensureConfigFile(pathname: string): void;
  openConfigInEditor(ctx: ExtensionContext, pathname: string): Promise<RuntimeFooterEditorResult>;
};

function defaultRuntimeFooterExtensionEffects(): RuntimeFooterExtensionEffects {
  return {
    getAgentDir,
    fileExists: existsSync,
    readMtime: readConfigMtime,
    readText: readConfigText,
    ensureConfigFile,
    openConfigInEditor,
  };
}

export function registerRuntimeFooterExtension(
  pi: RuntimeFooterExtensionApi,
  effects: RuntimeFooterExtensionEffects = defaultRuntimeFooterExtensionEffects(),
) {
  let gitStatsCache: GitStatsCache | undefined;
  let projectNameCache: ProjectNameCache | undefined;
  let configCache: FooterConfigCache | undefined;
  let lastConfigError: string | undefined;

  pi.registerCommand(COMMAND_NAME, {
    description:
      "Open runtime footer config in $EDITOR. Usage: /runtime-footer-config [global|local] (default: global)",
    getArgumentCompletions: runtimeFooterConfigCommandCompletions,
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify(`/${COMMAND_NAME} requires interactive mode`, "error");
        return;
      }

      const plan = planRuntimeFooterConfigEdit(
        args,
        runtimeFooterConfigRoots(ctx.cwd, effects.getAgentDir()),
        ctx.isProjectTrusted(),
        effects.fileExists,
      );
      if (plan.kind === "invalid") {
        ctx.ui.notify(plan.usage, "warning");
        return;
      }

      effects.ensureConfigFile(plan.target.path);

      const opened = await effects.openConfigInEditor(ctx, plan.target.path);
      const message = plan.notice ? `${opened.message} ${plan.notice}` : opened.message;
      ctx.ui.notify(message, opened.ok ? "info" : "warning");

      configCache = undefined;
      lastConfigError = undefined;
      pi.events.emit(CONFIG_CHANGED_EVENT, undefined);
    },
  });

  const installFooter = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const disposeBranch = footerData.onBranchChange(() => tui.requestRender());
      const disposeConfig = pi.events.on(CONFIG_CHANGED_EVENT, () => tui.requestRender());

      return {
        dispose() {
          disposeBranch();
          disposeConfig();
        },
        invalidate() {},
        render(width: number): string[] {
          const terminalWidth = process.stdout.columns ?? width;
          const safeWidth = Math.max(1, Math.min(width, terminalWidth));

          configCache = readFooterConfig(
            runtimeFooterConfigRoots(ctx.cwd, effects.getAgentDir()),
            ctx.isProjectTrusted(),
            configCache,
            effects.fileExists,
            effects.readMtime,
            effects.readText,
          );
          if (configCache.error && configCache.error !== lastConfigError) {
            lastConfigError = configCache.error;
            ctx.ui.notify(`runtime-footer config error (${configCache.error}); using defaults`, "warning");
          } else if (!configCache.error) {
            lastConfigError = undefined;
          }

          const usesGit = [...configCache.config.left, ...configCache.config.right].some(
            (token) => token.kind === "block" && (token.blockId === "git-branch" || token.blockId === "git-diff"),
          );
          if (usesGit) {
            gitStatsCache = getGitStats(gitStatsCache);
          }

          const usesProject = [...configCache.config.left, ...configCache.config.right].some(
            (token) => token.kind === "block" && token.blockId === "project",
          );
          if (usesProject) {
            projectNameCache = getProjectName(projectNameCache);
          }

          const statuses = footerData.getExtensionStatuses();
          const gitBranch = footerData.getGitBranch();
          const gitStats = usesGit ? (gitStatsCache?.stats ?? null) : null;
          const projectName = usesProject ? (projectNameCache?.name ?? computeProjectName()) : "";
          const explicitSeparatorMode = [...configCache.config.left, ...configCache.config.right].some(
            (token) => token.kind === "separator",
          );

          const left = renderSide(
            configCache.config.left,
            configCache.config.separator,
            configCache.config.truncate,
            configCache.config.truncateBlocks,
            theme,
            ctx,
            pi,
            configCache.config,
            gitBranch,
            gitStats,
            projectName,
            statuses,
            explicitSeparatorMode,
          );
          const right = renderSide(
            configCache.config.right,
            configCache.config.separator,
            configCache.config.truncate,
            configCache.config.truncateBlocks,
            theme,
            ctx,
            pi,
            configCache.config,
            gitBranch,
            gitStats,
            projectName,
            statuses,
            explicitSeparatorMode,
          );

          return [truncateToWidth(renderFooterLine(safeWidth, left, right), safeWidth)];
        },
      };
    });
  };

  pi.on({
    event: "session_start",
    handler: (_event, ctx) => installFooter(ctx),
  });
  pi.on({
    event: "session_tree",
    handler: (_event, ctx) => installFooter(ctx),
  });
}

export default function runtimeFooterExtension(pi: ExtensionAPI) {
  registerRuntimeFooterExtension({
    events: pi.events,
    getThinkingLevel: () => pi.getThinkingLevel(),
    on: (registration) => {
      if (registration.event === "session_start") {
        pi.on("session_start", registration.handler);
      } else {
        pi.on("session_tree", registration.handler);
      }
    },
    registerCommand: (name, command) => pi.registerCommand(name, command),
  });
}
