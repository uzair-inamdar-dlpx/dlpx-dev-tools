import { describe, it, expect, vi } from "vitest";
import { createRegisterTool } from "../../src/tools/register.js";
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

describe("dlpx_register tool", () => {
  it("builds the minimal argv with just the vm name", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createRegisterTool({ manager, creds });
    await tool.handler({ target: "dcol1", vm_name: "my-vm" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "register", "my-vm"]);
  });

  it("appends all flags in help-output order before the vm name", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createRegisterTool({ manager, creds });
    await tool.handler({
      target: "dcol2",
      vm_name: "my-vm",
      esx_host: "esx-07",
      no_claiming: true,
      no_power_on: true,
      wait: true,
      subnet: "lab-net",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "register",
      "--esx-host", "esx-07",
      "--no-claiming",
      "--no-power-on",
      "-w",
      "--subnet", "lab-net",
      "my-vm",
    ]);
  });

  it("omits boolean flags when false or undefined", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createRegisterTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      vm_name: "my-vm",
      no_claiming: false,
      no_power_on: false,
      wait: false,
    });
    expect(stub.run).toHaveBeenCalledWith(["dc", "register", "my-vm"]);
  });

  it("rejects the dlpxdc target", async () => {
    const { manager, creds } = ctx();
    const tool = createRegisterTool({ manager, creds });
    await expect(
      tool.handler({ target: "dlpxdc", vm_name: "x" }),
    ).rejects.toThrow(/register.*dlpxdc/i);
  });

  it("rejects an empty vm_name", async () => {
    const { manager, creds } = ctx();
    const tool = createRegisterTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", vm_name: "" }),
    ).rejects.toThrow();
  });
});
