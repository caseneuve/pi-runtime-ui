import { describe, expect, it } from "vitest";

import {
  type ExternalEditorResult,
  openExternalEditor,
  parseEditorCommand,
} from "../extensions/shared/external-editor";

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
    let resolved: ExternalEditorResult | undefined;

    const ui = {
      custom: async <T>(factory: any): Promise<T> => {
        const component = factory(
          {
            stop: () => events.push("stop"),
            start: () => events.push("start"),
            requestRender: () => events.push("render"),
          },
          {},
          {},
          (result: ExternalEditorResult) => {
            resolved = result;
          },
        );
        expect(component.render(80)).toEqual([]);
        return resolved as T;
      },
    };

    const result = await openExternalEditor(ui, "true", "/tmp/editor-test");

    expect(result).toEqual({ ok: true });
    expect(events).toEqual(["stop", "start", "render"]);
  });

  it("restarts and redraws the TUI after a non-zero editor exit", async () => {
    const events: string[] = [];
    const ui = {
      custom: async <T>(factory: any): Promise<T> => {
        let result: ExternalEditorResult | undefined;
        factory(
          {
            stop: () => events.push("stop"),
            start: () => events.push("start"),
            requestRender: () => events.push("render"),
          },
          {},
          {},
          (value: ExternalEditorResult) => {
            result = value;
          },
        );
        return result as T;
      },
    };

    await expect(openExternalEditor(ui, "false", "/tmp/editor-test")).resolves.toEqual({
      ok: false,
      message: "Editor exited with code 1",
    });
    expect(events).toEqual(["stop", "start", "render"]);
  });

  it("restarts and reports a missing editor executable", async () => {
    const events: string[] = [];
    const ui = {
      custom: async <T>(factory: any): Promise<T> => {
        let result: ExternalEditorResult | undefined;
        factory(
          {
            stop: () => events.push("stop"),
            start: () => events.push("start"),
            requestRender: () => events.push("render"),
          },
          {},
          {},
          (value: ExternalEditorResult) => {
            result = value;
          },
        );
        return result as T;
      },
    };

    const result = await openExternalEditor(ui, "/definitely/missing/pi-editor", "/tmp/editor-test");

    expect(result.ok).toBe(false);
    expect(events).toEqual(["stop", "start", "render"]);
  });

  it("rejects an empty editor command without opening custom UI", async () => {
    let customCalls = 0;
    const ui = {
      custom: async <T>(): Promise<T> => {
        customCalls += 1;
        return undefined as T;
      },
    };

    await expect(openExternalEditor(ui, "", "/tmp/editor-test")).resolves.toEqual({
      ok: false,
      message: "Invalid editor command",
    });
    expect(customCalls).toBe(0);
  });
});
