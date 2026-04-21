import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { AuthMode } from "../../src/config.js";

const connectCalls: Array<Record<string, unknown>> = [];

class MockClient extends EventEmitter {
  connect(config: Record<string, unknown>): this {
    connectCalls.push(config);
    return this;
  }
  end(): void {}
  exec(): void {}
}

vi.mock("ssh2", () => ({ Client: MockClient }));

// Imported after the mock so SshSession picks up MockClient.
const { SshSession } = await import("../../src/session/ssh-session.js");

type AuthHandler = (
  authsLeft: string[] | null,
  partialSuccess: boolean | null,
  next: (m: unknown) => void,
) => void;

function captureAuthHandler(opts: {
  agentSocket?: string;
  password?: () => Promise<string>;
  getMode?: () => AuthMode;
}): AuthHandler {
  const session = new SshSession({
    host: "example.test",
    username: "alice",
    agentSocket: opts.agentSocket,
    password: opts.password,
    getMode: opts.getMode,
    keepaliveIntervalSec: 30,
    commandTimeoutSec: 60,
  });
  // Kick connect(); the mock never emits 'ready', so the promise stays pending.
  void session.run(["noop"]).catch(() => {});
  const cfg = connectCalls.at(-1)!;
  return cfg.authHandler as AuthHandler;
}

async function drainAuth(authHandler: AuthHandler): Promise<unknown[]> {
  const yielded: unknown[] = [];
  await new Promise<void>((resolve) => {
    const step = (first: boolean) => {
      const next = (m: unknown) => {
        yielded.push(m);
        if (m === false) {
          resolve();
          return;
        }
        step(false);
      };
      if (first) authHandler(null, null, next);
      else authHandler([], false, next);
    };
    step(true);
  });
  return yielded;
}

describe("SshSession authHandler", () => {
  beforeEach(() => {
    connectCalls.length = 0;
  });

  it("yields agent then password then stops when both are configured", async () => {
    const passwordProvider = vi.fn(async () => "sekret");
    const authHandler = captureAuthHandler({
      agentSocket: "/tmp/ssh-agent.sock",
      password: passwordProvider,
    });

    const yielded = await drainAuth(authHandler);

    expect(yielded).toEqual([
      { type: "agent", username: "alice", agent: "/tmp/ssh-agent.sock" },
      { type: "password", username: "alice", password: "sekret" },
      false,
    ]);
    expect(passwordProvider).toHaveBeenCalledTimes(1);
  });

  it("does not call the password provider when only agent is configured", async () => {
    const passwordProvider = vi.fn(async () => "sekret");
    const authHandler = captureAuthHandler({
      agentSocket: "/tmp/ssh-agent.sock",
      // password intentionally omitted
    });

    const yielded = await drainAuth(authHandler);

    expect(yielded).toEqual([
      { type: "agent", username: "alice", agent: "/tmp/ssh-agent.sock" },
      false,
    ]);
    expect(passwordProvider).not.toHaveBeenCalled();
  });

  it("skips the agent step and goes straight to password when no agent socket is set", async () => {
    const passwordProvider = vi.fn(async () => "sekret");
    const authHandler = captureAuthHandler({
      // agentSocket intentionally omitted
      password: passwordProvider,
    });

    const yielded = await drainAuth(authHandler);

    expect(yielded).toEqual([
      { type: "password", username: "alice", password: "sekret" },
      false,
    ]);
    expect(passwordProvider).toHaveBeenCalledTimes(1);
  });

  it("stops immediately when neither agent nor password is available", async () => {
    const authHandler = captureAuthHandler({});

    const yielded = await drainAuth(authHandler);

    expect(yielded).toEqual([false]);
  });

  it("does not invoke the password provider during the agent step", async () => {
    const passwordProvider = vi.fn(async () => "sekret");
    const authHandler = captureAuthHandler({
      agentSocket: "/tmp/ssh-agent.sock",
      password: passwordProvider,
    });

    // Only drive the first step (agent). The password provider must not fire yet.
    await new Promise<void>((resolve) => {
      authHandler(null, null, () => resolve());
    });

    expect(passwordProvider).not.toHaveBeenCalled();
  });

  it("stops auth cleanly when the password provider rejects (e.g. user cancels prompt)", async () => {
    const passwordProvider = vi.fn(async () => {
      throw new Error("prompt cancelled");
    });
    const authHandler = captureAuthHandler({
      agentSocket: "/tmp/ssh-agent.sock",
      password: passwordProvider,
    });

    const yielded = await drainAuth(authHandler);

    expect(yielded).toEqual([
      { type: "agent", username: "alice", agent: "/tmp/ssh-agent.sock" },
      false,
    ]);
    expect(passwordProvider).toHaveBeenCalledTimes(1);
  });

  describe("mode=agent", () => {
    it("yields only the agent step when a socket is set", async () => {
      const passwordProvider = vi.fn(async () => "sekret");
      const authHandler = captureAuthHandler({
        agentSocket: "/tmp/ssh-agent.sock",
        password: passwordProvider,
        getMode: () => "agent",
      });

      const yielded = await drainAuth(authHandler);

      expect(yielded).toEqual([
        { type: "agent", username: "alice", agent: "/tmp/ssh-agent.sock" },
        false,
      ]);
      expect(passwordProvider).not.toHaveBeenCalled();
    });

    it("stops immediately when agent mode is set but no socket is available", async () => {
      const passwordProvider = vi.fn(async () => "sekret");
      const authHandler = captureAuthHandler({
        password: passwordProvider,
        getMode: () => "agent",
      });

      const yielded = await drainAuth(authHandler);

      expect(yielded).toEqual([false]);
      expect(passwordProvider).not.toHaveBeenCalled();
    });
  });

  describe("mode=password", () => {
    it("skips the agent step even when a socket is set", async () => {
      const passwordProvider = vi.fn(async () => "sekret");
      const authHandler = captureAuthHandler({
        agentSocket: "/tmp/ssh-agent.sock",
        password: passwordProvider,
        getMode: () => "password",
      });

      const yielded = await drainAuth(authHandler);

      expect(yielded).toEqual([
        { type: "password", username: "alice", password: "sekret" },
        false,
      ]);
      expect(passwordProvider).toHaveBeenCalledTimes(1);
    });

    it("stops immediately when password mode is set but no password provider is available", async () => {
      const authHandler = captureAuthHandler({
        agentSocket: "/tmp/ssh-agent.sock",
        getMode: () => "password",
      });

      const yielded = await drainAuth(authHandler);

      expect(yielded).toEqual([false]);
    });
  });

  describe("mode=auto", () => {
    it("matches the default (omitted-getMode) behavior: agent then password", async () => {
      const passwordProvider = vi.fn(async () => "sekret");
      const authHandler = captureAuthHandler({
        agentSocket: "/tmp/ssh-agent.sock",
        password: passwordProvider,
        getMode: () => "auto",
      });

      const yielded = await drainAuth(authHandler);

      expect(yielded).toEqual([
        { type: "agent", username: "alice", agent: "/tmp/ssh-agent.sock" },
        { type: "password", username: "alice", password: "sekret" },
        false,
      ]);
    });
  });

  it("reads the mode lazily so mutations between construction and connect() take effect", async () => {
    let currentMode: AuthMode = "auto";
    const passwordProvider = vi.fn(async () => "sekret");
    const authHandler = captureAuthHandler({
      agentSocket: "/tmp/ssh-agent.sock",
      password: passwordProvider,
      getMode: () => currentMode,
    });

    // Flip to 'password' before we start draining.
    currentMode = "password";

    const yielded = await drainAuth(authHandler);

    expect(yielded).toEqual([
      { type: "password", username: "alice", password: "sekret" },
      false,
    ]);
  });
});
