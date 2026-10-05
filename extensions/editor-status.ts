import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  formatGitStatsPlainCompact,
  formatGitStatsStyledCompact,
  type GitStatsCache,
  getGitStats,
  isGitRepo,
} from "./shared/runtime-status-git";

export type EditorStatusExtensionApi = {
  on(registration: {
    event: "session_start";
    handler: (event: SessionStartEvent, ctx: ExtensionContext) => Promise<void> | void;
  }): void;
};

type NativeIndicator = Parameters<CustomEditor["setWorkingStatusIndicator"]>[0];

function nativeInformationFits(width: number, statusWidth: number, hiddenLineCount: number): boolean {
  if (width < 1) return false;
  if (statusWidth > 0 && width < statusWidth + 5) return false;
  if (hiddenLineCount === 0) return true;

  // Pi 1.0.3 centers its overflow label and needs a gap after the native status.
  // Match that space budget, not the activity text, animation or lifecycle.
  const overflowWidth = visibleWidth(` ↑ ${hiddenLineCount} more `);
  if (overflowWidth + 2 > width) return false;
  return statusWidth === 0 || Math.floor((width - overflowWidth) / 2) - (3 + statusWidth + 1) >= 1;
}

function installEditor(ctx: ExtensionContext): void {
  let gitStatsCache: GitStatsCache | undefined;

  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    return new (class extends CustomEditor {
      private nativeIndicator: NativeIndicator;

      override setWorkingStatusIndicator(indicator: NativeIndicator): void {
        this.nativeIndicator = indicator;
        super.setWorkingStatusIndicator(indicator);
      }

      protected override renderTopBorder(width: number, hiddenLineCount: number): string {
        if (width <= 0) return super.renderTopBorder(width, hiddenLineCount);
        gitStatsCache = getGitStats(gitStatsCache);
        const gitRepo = isGitRepo();
        const rightPlain = formatGitStatsPlainCompact(gitStatsCache.stats) ?? (gitRepo ? "✓" : "");
        if (!rightPlain) return super.renderTopBorder(width, hiddenLineCount);

        const suffixWidth = visibleWidth(rightPlain) + 3;
        const nativeWidth = width - suffixWidth;
        const statusWidth = this.nativeIndicator
          ? visibleWidth(this.nativeIndicator.renderInBorder(Math.max(1, width - 5)))
          : 0;
        if (!nativeInformationFits(nativeWidth, statusWidth, hiddenLineCount)) {
          return super.renderTopBorder(width, hiddenLineCount);
        }

        const rightStyled =
          formatGitStatsStyledCompact(ctx.ui.theme, gitStatsCache.stats) ?? ctx.ui.theme.fg("dim", "✓");
        return `${super.renderTopBorder(nativeWidth, hiddenLineCount)} ${rightStyled} ${this.borderColor("─")}`;
      }
    })(tui, theme, keybindings, { embedWorkingStatus: true });
  });
}

export function registerEditorStatusExtension(pi: EditorStatusExtensionApi): void {
  pi.on({
    event: "session_start",
    handler: (_event, ctx) => {
      if (ctx.hasUI) installEditor(ctx);
    },
  });
}

export default function editorStatusExtension(pi: ExtensionAPI) {
  registerEditorStatusExtension({
    on: (registration) => {
      pi.on("session_start", registration.handler);
    },
  });
}
