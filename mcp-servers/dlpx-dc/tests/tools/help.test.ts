import { describe, it, expect, vi } from "vitest";
import { createHelpTool } from "../../src/tools/help.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_help tool", () => {
  it("runs `dc --help` when subcommand is omitted", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createHelpTool({ manager, creds });
    await tool.handler({ target: "dcol1" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "--help"]);
  });

  it("runs `dc <sub> --help` when subcommand is given", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createHelpTool({ manager, creds });
    await tool.handler({ target: "dcol1", subcommand: "expire" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "expire", "--help"]);
  });
});
