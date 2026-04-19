import { describe, it, expect, vi } from "vitest";
import { createUnarchiveTool } from "../../src/tools/unarchive.js";
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

describe("dlpx_unarchive tool", () => {
  it("builds the argv for dlpxdc", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await tool.handler({ target: "dlpxdc", vm_name: "my-vm" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "unarchive", "my-vm"]);
  });

  it("appends --ignore-owner, --wait, and --role before the vm name", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await tool.handler({
      target: "dlpxdc",
      vm_name: "my-vm",
      ignore_owner: true,
      wait: true,
      role: "operator",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "unarchive",
      "--ignore-owner",
      "--wait",
      "--role", "operator",
      "my-vm",
    ]);
  });

  it("handles tri-state booleans (false -> --no-*)", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await tool.handler({
      target: "dlpxdc",
      vm_name: "my-vm",
      ignore_owner: false,
      wait: false,
      test: false,
      use_default_cred: true,
      use_one_login: false,
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "unarchive",
      "--no-ignore-owner",
      "--no-wait",
      "--no-test",
      "--use-default-cred",
      "--no-use-one-login",
      "my-vm",
    ]);
  });

  it("passes --api-host and --env through", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await tool.handler({
      target: "dlpxdc",
      vm_name: "my-vm",
      api_host: "api.example.com",
      env: "staging",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "unarchive",
      "--api-host", "api.example.com",
      "--env", "staging",
      "my-vm",
    ]);
  });

  it("rejects dcol1 and dcol2 targets", async () => {
    const { manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", vm_name: "x" }),
    ).rejects.toThrow(/unarchive.*dcol1/i);
    await expect(
      tool.handler({ target: "dcol2", vm_name: "x" }),
    ).rejects.toThrow(/unarchive.*dcol2/i);
  });
});
