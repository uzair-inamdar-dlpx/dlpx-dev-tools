import { describe, it, expect, vi } from "vitest";
import { createListTool } from "../../src/tools/list.js";
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

describe("dlpx_list tool", () => {
  it("runs `dc list` with no filters by default", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol2" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list"]);
  });

  it("appends vm name when provided", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", vm_name: "my-vm" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "my-vm"]);
  });

  it("joins columns with commas for -o", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", columns: ["name", "ip", "owner"] });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-o", "name,ip,owner"]);
  });

  it("combines vm name and columns", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      vm_name: "my-vm",
      columns: ["name", "ip"],
    });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "my-vm", "-o", "name,ip"]);
  });
});
