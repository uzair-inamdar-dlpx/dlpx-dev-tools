import { describe, it, expect, vi } from "vitest";
import { createSetUnregistersTool } from "../../src/tools/set-unregisters.js";
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

describe("dlpx_set_unregisters tool", () => {
  it("builds the argv for dcol1", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createSetUnregistersTool({ manager, creds });
    await tool.handler({ target: "dcol1", days: 3, vm_names: ["a"] });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "set-unregisters", "3", "a",
    ]);
  });

  it("appends --ignore-missing when requested", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createSetUnregistersTool({ manager, creds });
    await tool.handler({
      target: "dcol2",
      days: 2,
      vm_names: ["a", "b"],
      ignore_missing: true,
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "set-unregisters", "--ignore-missing", "2", "a", "b",
    ]);
  });

  it("rejects dlpxdc target", async () => {
    const { manager, creds } = ctx();
    const tool = createSetUnregistersTool({ manager, creds });
    await expect(
      tool.handler({ target: "dlpxdc", days: 3, vm_names: ["a"] }),
    ).rejects.toThrow(/set-unregisters.*dlpxdc/i);
  });
});
