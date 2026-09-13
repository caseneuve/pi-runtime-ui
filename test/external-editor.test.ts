import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { openExternalEditor, parseEditorCommand } from "../extensions/shared/external-editor";

type ExternalEditorUi = Parameters<typeof openExternalEditor>[0];
type ExternalEditorCallback = Parameters<ExtensionUIContext["custom"]>[0];
type ExternalEditorCallbackValues = [
  tui: Parameters<ExternalEditorCallback>[0],
  theme: Parameters<ExternalEditorCallback>[1],
  keybindings: Parameters<ExternalEditorCallback>[2],
];
type ExternalEditorCustomFactory<T> = (
  ...args: [...ExternalEditorCallbackValues, done: (result: T) => void]
) => ReturnType<ExternalEditorCallback>;

function unreadCallbackValue<T>(): T {
  // SAFETY: openExternalEditor deliberately ignores the theme and keybindings callback values.
  return undefined as T;
}

function createExternalEditorUi(events: string[]): ExternalEditorUi {
  const custom: ExternalEditorUi["custom"] = <T>(factory: ExternalEditorCustomFactory<T>) =>
    new Promise<T>((resolve, reject) => {
      let rendered = false;
      let resolveAfterRender: (() => void) | undefined;
      const done = (result: T) => {
        const finish = () => resolve(result);
        if (rendered) {
          finish();
        } else {
          resolveAfterRender = finish;
        }
      };
      const tui: Pick<ExternalEditorCallbackValues[0], "start" | "stop" | "requestRender"> = {
        stop: () => events.push("stop"),
        start: () => events.push("start"),
        requestRender: () => events.push("render"),
      };
      // SAFETY: openExternalEditor reads only these three TUI methods; its
      // callback deliberately does not read the supplied theme or keybindings.
      const callbackValues: ExternalEditorCallbackValues = [
        tui as ExternalEditorCallbackValues[0],
        unreadCallbackValue<ExternalEditorCallbackValues[1]>(),
        unreadCallbackValue<ExternalEditorCallbackValues[2]>(),
      ];

      void (async () => {
        try {
          const component = await factory(...callbackValues, done);
          expect(component.render(80)).toEqual([]);
          rendered = true;
          resolveAfterRender?.();
        } catch (error) {
          reject(error);
        }
      })();
    });

  return { custom };
}

describe("parseEditorCommand", () => {
  it("preserves quoted empty arguments", () => {
    expect(parseEditorCommand('env TERM=xterm-ghostty-direct emacsclient -nw -a ""')).toEqual([
      "env",
      "TERM=xterm-ghostty-direct",
      "emacsclient",
      "-nw",
      "-a",
      "",
    ]);
  });

  it("rejects unterminated quotes", () => {
    expect(parseEditorCommand("emacsclient -a '")).toBeUndefined();
  });
});

describe("openExternalEditor", () => {
  it("stops and restarts the TUI around the child process", async () => {
    const events: string[] = [];
    const result = await openExternalEditor(createExternalEditorUi(events), "true", "/tmp/editor-test");

    expect(result).toEqual({ ok: true });
    expect(events).toEqual(["stop", "start", "render"]);
  });

  it("restarts and redraws the TUI after a non-zero editor exit", async () => {
    const events: string[] = [];
    await expect(openExternalEditor(createExternalEditorUi(events), "false", "/tmp/editor-test")).resolves.toEqual({
      ok: false,
      message: "Editor exited with code 1",
    });
    expect(events).toEqual(["stop", "start", "render"]);
  });

  it("restarts and reports a missing editor executable", async () => {
    const events: string[] = [];
    const result = await openExternalEditor(
      createExternalEditorUi(events),
      "/definitely/missing/pi-editor",
      "/tmp/editor-test",
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual(["stop", "start", "render"]);
  });

  it("rejects an empty editor command without opening custom UI", async () => {
    let customCalls = 0;
    const ui: ExternalEditorUi = {
      custom: <T>() => {
        customCalls += 1;
        return new Promise<T>(() => {});
      },
    };

    await expect(openExternalEditor(ui, "", "/tmp/editor-test")).resolves.toEqual({
      ok: false,
      message: "Invalid editor command",
    });
    expect(customCalls).toBe(0);
  });
});
