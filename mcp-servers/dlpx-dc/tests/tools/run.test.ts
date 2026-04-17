import { describe, it, expect, vi } from "vitest";
import { createRunTool } from "../../src/tools/run.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx(responder: (argv: string[]) => Promise<ExecResult>) {
  const stub: SshExec = { run: vi.fn(responder), close: vi.fn(async () => {}) };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_run tool", () => {
  it("passes args through as a dc invocation", async () => {
    const { stub, manager, creds } = ctx(async () => ({
      stdout: "done", stderr: "", code: 0,
    }));
    const tool = createRunTool({ manager, creds });
    const text = await tool.handler({ target: "dcol1", args: ["list", "-o", "name,ip"] });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-o", "name,ip"]);
    expect(text).toContain("done");
  });

  it("rejects empty args", async () => {
    const { manager, creds } = ctx(async () => ({ stdout: "", stderr: "", code: 0 }));
    const tool = createRunTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", args: [] }),
    ).rejects.toThrow(/at least one/i);
  });

  it("has the expected metadata", () => {
    const { manager, creds } = ctx(async () => ({ stdout: "", stderr: "", code: 0 }));
    const tool = createRunTool({ manager, creds });
    expect(tool.name).toBe("dlpx_run");
    expect(tool.inputSchema).toBeDefined();
  });
});
