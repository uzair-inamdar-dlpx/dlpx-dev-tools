export type AuthMode = "auto" | "agent" | "password";

export const AUTH_MODES: readonly AuthMode[] = ["auto", "agent", "password"];

export interface Config {
  ldapUser: string;
  ldapPassword?: string;
  commandTimeoutSec: number;
  sshKeepaliveSec: number;
  authMode: AuthMode;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return n;
}

function authModeEnv(name: string, fallback: AuthMode): AuthMode {
  const raw = process.env[name];
  if (!raw) return fallback;
  if ((AUTH_MODES as readonly string[]).includes(raw)) return raw as AuthMode;
  throw new Error(
    `${name} must be one of ${AUTH_MODES.join(", ")}, got ${raw}`,
  );
}

export function loadConfig(): Config {
  const ldapUser = process.env.DLPX_LDAP_USER || process.env.USER;
  if (!ldapUser) {
    throw new Error(
      "could not resolve LDAP user: set DLPX_LDAP_USER or USER env var",
    );
  }
  return {
    ldapUser,
    ldapPassword: process.env.DLPX_LDAP_PASSWORD,
    commandTimeoutSec: intEnv("DLPX_COMMAND_TIMEOUT_SEC", 1800),
    sshKeepaliveSec: intEnv("DLPX_SSH_KEEPALIVE_SEC", 30),
    authMode: authModeEnv("DLPX_SSH_AUTH", "auto"),
  };
}
