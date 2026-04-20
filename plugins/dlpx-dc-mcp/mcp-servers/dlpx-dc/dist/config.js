function intEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`${name} must be a positive integer, got ${raw}`);
    }
    return n;
}
export function loadConfig() {
    const ldapUser = process.env.DLPX_LDAP_USER || process.env.USER;
    if (!ldapUser) {
        throw new Error("could not resolve LDAP user: set DLPX_LDAP_USER or USER env var");
    }
    return {
        ldapUser,
        ldapPassword: process.env.DLPX_LDAP_PASSWORD,
        commandTimeoutSec: intEnv("DLPX_COMMAND_TIMEOUT_SEC", 1800),
        sshKeepaliveSec: intEnv("DLPX_SSH_KEEPALIVE_SEC", 30),
    };
}
//# sourceMappingURL=config.js.map