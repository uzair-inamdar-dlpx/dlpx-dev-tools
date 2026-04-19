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

  it("combines vm name and columns (options before positional)", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      vm_name: "my-vm",
      columns: ["name", "ip"],
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "list", "-o", "name,ip", "my-vm",
    ]);
  });

  it("appends -a for all=true", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", all: true });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-a"]);
  });

  it("appends -g GROUP for group", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", group: "dlpx-8" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-g", "dlpx-8"]);
  });

  it("joins sort keys with commas for -s", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", sort: ["expires", "name"] });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "list", "-s", "expires,name",
    ]);
  });

  it("appends -H for omit_headers=true", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", omit_headers: true });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-H"]);
  });

  it("rejects vm_name combined with all", async () => {
    const { manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", vm_name: "x", all: true }),
    ).rejects.toThrow(/vm_name.*all.*group/);
  });

  it("rejects vm_name combined with group", async () => {
    const { manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", vm_name: "x", group: "g" }),
    ).rejects.toThrow(/vm_name.*all.*group/);
  });
});
