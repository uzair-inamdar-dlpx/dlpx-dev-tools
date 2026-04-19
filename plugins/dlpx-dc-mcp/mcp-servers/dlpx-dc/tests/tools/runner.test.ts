import { describe, it, expect, vi } from "vitest";
import { runOnTarget } from "../../src/tools/runner.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function makeStub(responder: (argv: string[]) => Promise<ExecResult>): SshExec {
  return {
    run: vi.fn(responder),
    close: vi.fn(async () => {}),
  };
}

function okResult(stdout: string): ExecResult {
  return { stdout, stderr: "", code: 0 };
}

function ctx(stub: SshExec) {
  const mgr = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { manager: mgr, creds };
}

describe("runOnTarget", () => {
  it("runs argv and returns formatted text for dcol1 (no login wrap)", async () => {
    const stub = makeStub(async () => okResult("hello"));
    const { manager, creds } = ctx(stub);
    const text = await runOnTarget({
      manager,
      creds,
      target: "dcol1",
      argv: ["dc", "list"],
    });
    expect(text).toContain("exit: 0");
    expect(text).toContain("hello");
    expect(stub.run).toHaveBeenCalledWith(["dc", "list"]);
  });

  it("wraps with dc login flow for dlpxdc", async () => {
    const calls: string[][] = [];
    const stub = makeStub(async (argv) => {
      calls.push(argv);
      if (calls.length === 1) {
        return { stdout: "", stderr: "dc: not logged in", code: 1 };
      }
      if (calls.length === 2) return okResult("logged in");
      return okResult("hello");
    });
    const { manager, creds } = ctx(stub);
    const text = await runOnTarget({
      manager,
      creds,
      target: "dlpxdc",
      argv: ["dc", "list"],
    });
    expect(text).toContain("hello");
    expect(calls.length).toBe(3);
    expect(calls[1][1]).toBe("login");
  });

  it("rejects disallowed targets", async () => {
    const stub = makeStub(async () => okResult(""));
    const { manager, creds } = ctx(stub);
    await expect(
      runOnTarget({
        manager,
        creds,
        target: "dcol1",
        argv: ["dc", "unarchive", "x"],
        allowed: ["dlpxdc"],
        operation: "unarchive",
      }),
    ).rejects.toThrow(/unarchive.*dcol1/i);
  });
});
