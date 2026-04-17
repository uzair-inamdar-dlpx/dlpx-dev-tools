import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.DLPX_LDAP_USER;
    delete process.env.DLPX_LDAP_PASSWORD;
    delete process.env.DLPX_COMMAND_TIMEOUT_SEC;
    delete process.env.DLPX_SSH_KEEPALIVE_SEC;
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
  });

  it("honors env overrides", () => {
    process.env.DLPX_LDAP_USER = "bob";
    process.env.DLPX_LDAP_PASSWORD = "secret";
    process.env.DLPX_COMMAND_TIMEOUT_SEC = "60";
    process.env.DLPX_SSH_KEEPALIVE_SEC = "5";
    const cfg = loadConfig();
    expect(cfg).toEqual({
      ldapUser: "bob",
      ldapPassword: "secret",
      commandTimeoutSec: 60,
      sshKeepaliveSec: 5,
    });
  });

  it("throws when user cannot be resolved", () => {
    expect(() => loadConfig()).toThrow(/ldap user/i);
  });
});
