import { describe, it, expect, vi } from "vitest";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { Elicitor } from "../../src/auth/elicit.js";

function makeElicitor(answers: Record<string, string>): Elicitor {
  return {
    promptPassword: vi.fn(async () => answers.password ?? "pw"),
    promptOtp: vi.fn(async () => answers.otp ?? "000000"),
  };
}

describe("CredentialStore", () => {
  it("returns env password without prompting", async () => {
    const elicitor = makeElicitor({});
    const store = new CredentialStore("alice", "envpw", elicitor);
    expect(await store.getPassword()).toBe("envpw");
    expect(elicitor.promptPassword).not.toHaveBeenCalled();
  });

  it("prompts once when env is unset and caches the result", async () => {
    const elicitor = makeElicitor({ password: "prompted" });
    const store = new CredentialStore("alice", undefined, elicitor);
    expect(await store.getPassword()).toBe("prompted");
    expect(await store.getPassword()).toBe("prompted");
    expect(elicitor.promptPassword).toHaveBeenCalledTimes(1);
  });

  it("getOtp delegates to elicitor every call (OTPs are single-use)", async () => {
    const elicitor = makeElicitor({ otp: "123456" });
    const store = new CredentialStore("alice", "pw", elicitor);
    expect(await store.getOtp()).toBe("123456");
    expect(await store.getOtp()).toBe("123456");
    expect(elicitor.promptOtp).toHaveBeenCalledTimes(2);
  });
});
