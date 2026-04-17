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
  it("runs `dc clone-latest <image> <vm>`", async () => {
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
});
