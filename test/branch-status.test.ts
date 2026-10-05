import type { ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { createEventBus, SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import branchStatusExtension from "../extensions/branch-status";

function harness(session: SessionManager) {
  const handlers = new Map<string, () => Promise<void>>();
  const events = createEventBus();
  const emitted: string[] = [];
  events.on("branch-status:changed", () => emitted.push("branch-status:changed"));
  const publications: Array<[string, string | undefined]> = [];
  const statuses = new Map<string, string>();
  // SAFETY: the producer only reads hasUI, sessionManager and the listed UI methods.
  const ctx = {
    hasUI: true,
    sessionManager: session,
    ui: {
      theme: { fg: (_tone: string, text: string) => text },
      setStatus(key: string, text: string | undefined) {
        publications.push([key, text]);
        if (text === undefined) statuses.delete(key);
        else statuses.set(key, text);
      },
    },
  };
  // SAFETY: handlers use only the context members provided above.
  const context: ExtensionContext = ctx as never;
  // SAFETY: this factory only calls on and events.on/emit. Lifecycle handlers
  // ignore the event payload; invoking them uses the captured context above.
  const pi = {
    on(name: string, handler: (event: SessionStartEvent, context: ExtensionContext) => Promise<void>) {
      handlers.set(name, () => handler({ type: "session_start", reason: "startup" }, context));
      return () => {
        handlers.delete(name);
      };
    },
    events,
  };
  // SAFETY: branch-status registers only lifecycle handlers and event listeners.
  branchStatusExtension(pi as never);
  return {
    ctx: context,
    statuses,
    publications,
    emitted,
    async refresh(event: string) {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`missing handler: ${event}`);
      await handler();
    },
    bookmarkChanged() {
      events.emit("bookmark:changed", undefined);
    },
  };
}

describe("branch-status producer", () => {
  it("publishes labels, refreshes bookmarks and clears through setStatus without a footer event", async () => {
    const session = SessionManager.inMemory("/workspace");
    const root = session.appendCustomEntry("test-root");
    session.appendCustomEntry("test-left");
    session.branch(root);
    const right = session.appendCustomEntry("test-right");
    session.appendLabelChange(right, "Feature");
    const h = harness(session);

    await h.refresh("session_start");
    expect(h.statuses.get("branch-status")).toBe("[⋔ Feature]");
    expect(h.emitted).toEqual([]);
    await h.refresh("turn_end");
    expect(h.publications).toHaveLength(1);

    session.appendLabelChange(right, " Updated   label ");
    h.bookmarkChanged();
    expect(h.statuses.get("branch-status")).toBe("[⋔ Updated label]");
    expect(h.emitted).toEqual([]);

    h.ctx.sessionManager = SessionManager.inMemory("/workspace");
    await h.refresh("session_tree");
    expect(h.statuses.has("branch-status")).toBe(false);
    expect(h.publications.at(-1)).toEqual(["branch-status", undefined]);
    expect(h.emitted).toEqual([]);
  });

  it("does not publish when no UI is available", async () => {
    const h = harness(SessionManager.inMemory("/workspace"));
    h.ctx.hasUI = false;
    await h.refresh("session_start");
    h.bookmarkChanged();
    expect(h.publications).toEqual([]);
    expect(h.emitted).toEqual([]);
  });
});
