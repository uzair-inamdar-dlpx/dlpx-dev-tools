import { describe, it, expect, vi } from "vitest";
import { createGroupsTool } from "../../src/tools/groups.js";
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

describe("dlpx_groups tool", () => {
  it("runs `dc groups list` with no args", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createGroupsTool({ manager, creds });
    await tool.handler({ target: "dcol1", action: "list" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "groups", "list"]);
  });

  it("runs `dc groups set <group> <vm>`", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createGroupsTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      action: "set",
      args: ["dlpx-9", "my-vm"],
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "groups", "set", "dlpx-9", "my-vm",
    ]);
  });

  it("runs `dc groups unset <vm>`", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createGroupsTool({ manager, creds });
    await tool.handler({
      target: "dcol2",
      action: "unset",
      args: ["my-vm"],
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "groups", "unset", "my-vm",
    ]);
  });

  it("rejects an unknown action", async () => {
    const { manager, creds } = ctx();
    const tool = createGroupsTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", action: "wat" }),
    ).rejects.toThrow();
  });

  it("requires action", async () => {
    const { manager, creds } = ctx();
    const tool = createGroupsTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1" }),
    ).rejects.toThrow();
  });
});
