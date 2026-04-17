import { describe, it, expect, vi } from "vitest";
import {
  isLoginRequiredError,
  runWithDcLogin,
} from "../../src/auth/dc-login.js";
import type { ExecResult } from "../../src/session/exec.js";
import { CredentialStore } from "../../src/auth/credentials.js";

function result(partial: Partial<ExecResult>): ExecResult {
  return { stdout: "", stderr: "", code: 0, ...partial };
}

describe("isLoginRequiredError", () => {
  it.each([
    { stderr: "Error: please run 'dc login' to authenticate", code: 1 },
    { stderr: "authentication token expired", code: 2 },
    { stderr: "dc: not logged in", code: 1 },
  ])("detects %j as login-required", (r) => {
    expect(isLoginRequiredError(result(r))).toBe(true);
  });

  it("ignores zero exit even if message matches", () => {
    expect(
      isLoginRequiredError(result({ stderr: "dc: not logged in", code: 0 })),
    ).toBe(false);
  });

  it("ignores other failures", () => {
    expect(
      isLoginRequiredError(result({ stderr: "some other error", code: 1 })),
    ).toBe(false);
  });
});

describe("runWithDcLogin", () => {
  const creds = () =>
    new CredentialStore("alice", "pw", {
      promptPassword: vi.fn(async () => "pw"),
      promptOtp: vi.fn(async () => "123456"),
    });

  it("returns on first-try success without invoking login", async () => {
    const run = vi.fn(async () => result({ code: 0, stdout: "ok" }));
    const out = await runWithDcLogin(run, creds(), ["dc", "list"]);
    expect(out.code).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(["dc", "list"]);
  });

  it("runs dc login and retries once on expiry", async () => {
    const run = vi
      .fn<(a: string[]) => Promise<ExecResult>>()
      .mockResolvedValueOnce(
        result({ code: 1, stderr: "authentication token expired" }),
      )
      .mockResolvedValueOnce(result({ code: 0, stdout: "logged in" }))
      .mockResolvedValueOnce(result({ code: 0, stdout: "ok" }));
    const out = await runWithDcLogin(run, creds(), ["dc", "list"]);
    expect(out.stdout).toBe("ok");
    expect(run).toHaveBeenNthCalledWith(1, ["dc", "list"]);
    expect(run.mock.calls[1][0][0]).toBe("dc");
    expect(run.mock.calls[1][0][1]).toBe("login");
    expect(run).toHaveBeenNthCalledWith(3, ["dc", "list"]);
  });

  it("surfaces error when dc login itself fails", async () => {
    const run = vi
      .fn<(a: string[]) => Promise<ExecResult>>()
      .mockResolvedValueOnce(result({ code: 1, stderr: "dc: not logged in" }))
      .mockResolvedValueOnce(result({ code: 1, stderr: "bad otp" }));
    await expect(
      runWithDcLogin(run, creds(), ["dc", "list"]),
    ).rejects.toThrow(/dc login failed/i);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not loop if retry also reports login-required", async () => {
    const run = vi
      .fn<(a: string[]) => Promise<ExecResult>>()
      .mockResolvedValueOnce(result({ code: 1, stderr: "dc: not logged in" }))
      .mockResolvedValueOnce(result({ code: 0, stdout: "logged in" }))
      .mockResolvedValueOnce(result({ code: 1, stderr: "dc: not logged in" }));
    const out = await runWithDcLogin(run, creds(), ["dc", "list"]);
    expect(out.code).toBe(1);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
