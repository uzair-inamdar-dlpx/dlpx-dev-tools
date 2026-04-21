import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.DLPX_LDAP_USER;
    delete process.env.DLPX_LDAP_PASSWORD;
    delete process.env.DLPX_COMMAND_TIMEOUT_SEC;
    delete process.env.DLPX_SSH_KEEPALIVE_SEC;
    delete process.env.DLPX_SSH_AUTH;
    delete process.env.USER;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("uses defaults when env is empty", () => {
    process.env.USER = "alice";
    const cfg = loadConfig();
    expect(cfg.ldapUser).toBe("alice");
    expect(cfg.ldapPassword).toBeUndefined();
    expect(cfg.commandTimeoutSec).toBe(1800);
    expect(cfg.sshKeepaliveSec).toBe(30);
    expect(cfg.authMode).toBe("auto");
  });

  it("honors env overrides", () => {
    process.env.DLPX_LDAP_USER = "bob";
    process.env.DLPX_LDAP_PASSWORD = "secret";
    process.env.DLPX_COMMAND_TIMEOUT_SEC = "60";
    process.env.DLPX_SSH_KEEPALIVE_SEC = "5";
    process.env.DLPX_SSH_AUTH = "agent";
    const cfg = loadConfig();
    expect(cfg).toEqual({
      ldapUser: "bob",
      ldapPassword: "secret",
      commandTimeoutSec: 60,
      sshKeepaliveSec: 5,
      authMode: "agent",
    });
  });

  it("throws when user cannot be resolved", () => {
    expect(() => loadConfig()).toThrow(/ldap user/i);
  });

  it("parses each valid DLPX_SSH_AUTH value", () => {
    process.env.USER = "alice";
    for (const mode of ["auto", "agent", "password"] as const) {
      process.env.DLPX_SSH_AUTH = mode;
      expect(loadConfig().authMode).toBe(mode);
    }
  });

  it("throws on an invalid DLPX_SSH_AUTH value", () => {
    process.env.USER = "alice";
    process.env.DLPX_SSH_AUTH = "hunter2";
    expect(() => loadConfig()).toThrow(/DLPX_SSH_AUTH/);
  });
});
