import { describe, it, expect, vi } from "vitest";
import { createCloneLatestTool } from "../../src/tools/clone-latest.js";
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

describe("dlpx_clone_latest tool", () => {
  it("runs `dc clone-latest <group> <name>` with no flags (non-AWS)", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      image_name: "ubuntu-22",
      vm_name: "my-vm",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "clone-latest", "ubuntu-22", "my-vm",
    ]);
  });

  it("rejects empty image or vm name", async () => {
    const { manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", image_name: "", vm_name: "x" }),
    ).rejects.toThrow();
    await expect(
      tool.handler({ target: "dcol1", image_name: "x", vm_name: "" }),
    ).rejects.toThrow();
  });

  it("appends non-AWS flags on dcol1 (options before positional args)", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      image_name: "dlpx-9",
      vm_name: "my-vm",
      esx_host: "esx-12",
      vm_memory: 16384,
      num_vcpus: 4,
      no_scripts: true,
      wait: true,
      no_register: true,
      subnet: "qa-net",
      automation_id: "http://jenkins/job/1",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "clone-latest",
      "--esx-host", "esx-12",
      "--vm-memory", "16384",
      "--num-vcpus", "4",
      "--no-scripts",
      "-w",
      "--no-register",
      "--subnet", "qa-net",
      "--automation-id", "http://jenkins/job/1",
      "dlpx-9", "my-vm",
    ]);
  });

  it("appends AWS flags on dlpxdc", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await tool.handler({
      target: "dlpxdc",
      image_name: "dlpx-9",
      vm_name: "my-instance",
      cloud: "AWS",
      wait: true,
      wait_timeout_m: 30,
      size: "m5.large",
      register: false,
      role: "operator",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "clone-latest",
      "--cloud", "AWS",
      "--wait",
      "--wait-timeout-m", "30",
      "--size", "m5.large",
      "--no-register",
      "--role", "operator",
      "dlpx-9", "my-instance",
    ]);
  });

  it("rejects non-AWS flags when target is dlpxdc", async () => {
    const { manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await expect(
      tool.handler({
        target: "dlpxdc",
        image_name: "dlpx-9",
        vm_name: "x",
        esx_host: "esx-1",
      }),
    ).rejects.toThrow(/esx_host/);
  });

  it("rejects AWS flags when target is non-AWS (dcol2)", async () => {
    const { manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await expect(
      tool.handler({
        target: "dcol2",
        image_name: "dlpx-9",
        vm_name: "x",
        cloud: "AWS",
      }),
    ).rejects.toThrow(/cloud/);
  });
});
