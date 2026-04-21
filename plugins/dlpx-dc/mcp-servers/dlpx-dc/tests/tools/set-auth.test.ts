import { describe, it, expect, vi } from "vitest";
import type { AuthMode } from "../../src/config.js";
import { createSetAuthTool } from "../../src/tools/set-auth.js";
import { SessionManager } from "../../src/session/manager.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function makeDeps(initial: AuthMode = "auto", agentSocketPresent = true) {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const closeAll = vi.spyOn(manager, "closeAll");
  let currentMode: AuthMode = initial;
  const tool = createSetAuthTool({
    manager,
    getMode: () => currentMode,
    setMode: (m) => { currentMode = m; },
    agentSocketPresent,
  });
  return { tool, getMode: () => currentMode, closeAll };
}

describe("dlpx_set_auth tool", () => {
  it("mutates the mode, closes sessions, and returns a snapshot", async () => {
    const { tool, getMode, closeAll } = makeDeps("auto", true);

    const out = await tool.handler({ method: "agent" });

    expect(getMode()).toBe("agent");
    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(out).toBe(
      "auth mode set to agent; sessions reset; agent socket present: true",
    );
  });

  it("reports agent socket presence accurately", async () => {
    const { tool } = makeDeps("auto", false);
    const out = await tool.handler({ method: "password" });
    expect(out).toContain("agent socket present: false");
  });

  it.each(["auto", "agent", "password"] as const)(
    "accepts method=%s",
    async (method) => {
      const { tool, getMode } = makeDeps();
      await tool.handler({ method });
      expect(getMode()).toBe(method);
    },
  );

  it("rejects an invalid method", async () => {
    const { tool, getMode, closeAll } = makeDeps("auto");
    await expect(tool.handler({ method: "hunter2" })).rejects.toThrow();
    expect(getMode()).toBe("auto");
    expect(closeAll).not.toHaveBeenCalled();
  });

  it("rejects when method is missing", async () => {
    const { tool } = makeDeps();
    await expect(tool.handler({})).rejects.toThrow();
  });
});
