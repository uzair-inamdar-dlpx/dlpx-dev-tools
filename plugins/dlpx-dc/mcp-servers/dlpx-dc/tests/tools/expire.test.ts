import { describe, it, expect, vi } from "vitest";
import { createExpireTool } from "../../src/tools/expire.js";
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

describe("dlpx_expire tool", () => {
  it("passes days as string and appends each vm name", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createExpireTool({ manager, creds });
    await tool.handler({ target: "dcol1", days: 7, vm_names: ["a", "b"] });
    expect(stub.run).toHaveBeenCalledWith(["dc", "expire", "7", "a", "b"]);
  });

  it("appends --ignore-missing when requested, before days/vms", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createExpireTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      days: 3,
      vm_names: ["a"],
      ignore_missing: true,
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "expire", "--ignore-missing", "3", "a",
    ]);
  });

  it("omits --ignore-missing when false or absent", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createExpireTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      days: 3,
      vm_names: ["a"],
      ignore_missing: false,
    });
    expect(stub.run).toHaveBeenCalledWith(["dc", "expire", "3", "a"]);
  });

  it("rejects non-positive days and empty vm list", async () => {
    const { manager, creds } = ctx();
    const tool = createExpireTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", days: 0, vm_names: ["a"] }),
    ).rejects.toThrow();
    await expect(
      tool.handler({ target: "dcol1", days: 5, vm_names: [] }),
    ).rejects.toThrow();
  });
});
