import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionShutdownEvent,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { Value } from "typebox/value";
import {
  formatGitStatsPlainCompact,
  formatGitStatsStyledCompact,
  type GitStatsCache,
  getGitStats,
  isGitRepo,
} from "./shared/runtime-status-git";

const MIN_GAP = 1;

type EditorStatusState = {
  name: string;
  commsActive: boolean;
};

type EditorStatusSessionRegistration =
  | {
      event: "session_start";
      handler: (event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void;
    }
  | {
      event: "session_shutdown";
      handler: (event: SessionShutdownEvent, ctx: ExtensionContext) => Promise<void> | void;
    };

export type EditorStatusExtensionApi = {
  events: ExtensionAPI["events"];
  on(registration: EditorStatusSessionRegistration): void;
};

const agentChannelIdentitySchema = Type.Object({
  id: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
});
const agentChannelCommsSchema = Type.Object({ active: Type.Boolean() });

function normalizeName(value: string | undefined): string | undefined {
  const name = value?.trim();
  return name || undefined;
}

function readInitialState(ctx: ExtensionContext): EditorStatusState {
  let name = "agent";
  let commsActive = false;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "custom") continue;
    if (entry.customType === "agent-channel-identity" && Value.Check(agentChannelIdentitySchema, entry.data)) {
      name = entry.data.label || entry.data.id || name;
    }
    if (entry.customType === "agent-channel-comms" && Value.Check(agentChannelCommsSchema, entry.data)) {
      commsActive = entry.data.active;
    }
  }

  return { name, commsActive };
}

function buildLeftLabel(state: EditorStatusState): string {
  return state.commsActive ? ` ${state.name} 📡 ` : ` ${state.name} `;
}

function clipLabel(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  let out = "";
  let used = 0;
  for (const ch of text) {
    const w = visibleWidth(ch);
    if (used + w > maxWidth) break;
    out += ch;
    used += w;
  }
  return out;
}

function renderTopBorder(
  width: number,
  borderColor: (text: string) => string,
  colorAccent: (text: string) => string,
  leftLabel: string,
  rightPlain: string,
  rightStyled: string,
): string {
  if (width <= 0) return "";

  const right = rightPlain.trim();
  let plainLeft = leftLabel;

  const rightBudget = right ? visibleWidth(right) + MIN_GAP : 0;
  const leftMax = Math.max(3, width - 1 - rightBudget);
  if (visibleWidth(plainLeft) > leftMax) {
    const clipped = clipLabel(plainLeft.trim(), Math.max(1, leftMax - 2));
    plainLeft = ` ${clipped} `;
  }

  const leftWidth = visibleWidth(plainLeft);
  const leftSegmentWidth = 1 + leftWidth;
  const rightWidth = right ? visibleWidth(right) : 0;
  const rightSegmentWidth = rightWidth > 0 ? rightWidth + 3 : 0;

  if (!right || width - leftSegmentWidth - rightSegmentWidth < MIN_GAP) {
    const tailWidth = Math.max(0, width - leftSegmentWidth);
    return borderColor("─") + colorAccent(plainLeft) + borderColor("─".repeat(tailWidth));
  }

  const gapWidth = width - leftSegmentWidth - rightSegmentWidth;
  return (
    borderColor("─") +
    colorAccent(plainLeft) +
    borderColor("─".repeat(gapWidth)) +
    " " +
    rightStyled +
    " " +
    borderColor("─")
  );
}

function installEditor(
  ctx: ExtensionContext,
  pi: EditorStatusExtensionApi,
  disposePreviousSubscriptions: () => void,
  setDisposeSubscriptions: (dispose: () => void) => void,
): void {
  disposePreviousSubscriptions();

  let state = readInitialState(ctx);
  let gitStatsCache: GitStatsCache | undefined;

  const fullTheme = ctx.ui.theme;

  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    const disposeName = pi.events.on("agent-channel:name", (value) => {
      if (!Value.Check(Type.String(), value)) return;
      const name = normalizeName(value);
      if (!name) return;
      state = { ...state, name };
      tui.requestRender();
    });

    const disposeComms = pi.events.on("agent-channel:comms", (value) => {
      state = { ...state, commsActive: Value.Check(Type.Literal(true), value) };
      tui.requestRender();
    });

    setDisposeSubscriptions(() => {
      disposeName();
      disposeComms();
    });

    return new (class extends CustomEditor {
      render(width: number): string[] {
        const lines = super.render(width);
        if (lines.length === 0 || width <= 0) return lines;

        gitStatsCache = getGitStats(gitStatsCache);
        const gitRepo = isGitRepo();
        const rightLabel = formatGitStatsPlainCompact(gitStatsCache.stats) ?? (gitRepo ? "✓" : "");
        lines[0] = renderTopBorder(
          width,
          this.borderColor.bind(this),
          (text) => fullTheme.fg("accent", text),
          buildLeftLabel(state),
          rightLabel,
          formatGitStatsStyledCompact(fullTheme, gitStatsCache.stats) ?? (gitRepo ? fullTheme.fg("dim", "✓") : ""),
        );
        return lines;
      }
    })(tui, theme, keybindings);
  });
}

export function registerEditorStatusExtension(pi: EditorStatusExtensionApi): void {
  let disposeSubscriptions: (() => void) | undefined;

  const clearSubscriptions = () => {
    disposeSubscriptions?.();
    disposeSubscriptions = undefined;
  };

  pi.on({
    event: "session_start",
    handler: async (_event, ctx) => {
      if (!ctx.hasUI) return;
      installEditor(ctx, pi, clearSubscriptions, (dispose) => {
        disposeSubscriptions = dispose;
      });
    },
  });

  pi.on({
    event: "session_shutdown",
    handler: async () => {
      clearSubscriptions();
    },
  });
}

export default function editorStatusExtension(pi: ExtensionAPI) {
  registerEditorStatusExtension({
    events: pi.events,
    on: (registration) => {
      if (registration.event === "session_start") {
        pi.on("session_start", registration.handler);
      } else {
        pi.on("session_shutdown", registration.handler);
      }
    },
  });
}
