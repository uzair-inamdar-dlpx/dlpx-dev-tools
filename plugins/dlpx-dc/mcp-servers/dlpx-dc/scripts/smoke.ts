import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../src/config.js";
import { getTarget } from "../src/targets.js";
import { SshSession } from "../src/session/ssh-session.js";
import { SessionManager } from "../src/session/manager.js";
import { CredentialStore } from "../src/auth/credentials.js";
import { runWithDcLogin } from "../src/auth/dc-login.js";

async function main() {
  const cfg = loadConfig();
  const rl = readline.createInterface({ input, output });

  const elicitor = {
    async promptPassword(msg: string) {
      return rl.question(`${msg}: `);
    },
    async promptOtp(msg: string) {
      return rl.question(`${msg}: `);
    },
  };
  const creds = new CredentialStore(cfg.ldapUser, cfg.ldapPassword, elicitor);

  const manager = new SessionManager((id) => {
    const t = getTarget(id);
    let session: SshSession | undefined;
    return {
      async run(argv: string[]) {
        if (!session) {
          session = new SshSession({
            host: t.host,
            username: cfg.ldapUser,
            password: await creds.getPassword(),
            keepaliveIntervalSec: cfg.sshKeepaliveSec,
            commandTimeoutSec: cfg.commandTimeoutSec,
          });
        }
        return session.run(argv);
      },
      async close() {
        await session?.close();
      },
    };
  });

  console.log("--- dcol1 dc list ---");
  const r1 = await manager.run("dcol1", ["dc", "list"]);
  console.log(r1);

  console.log("--- dlpxdc dc list (with login retry) ---");
  const r2 = await runWithDcLogin(
    (argv) => manager.run("dlpxdc", argv),
    creds,
    ["dc", "list"],
  );
  console.log(r2);

  await manager.closeAll();
  rl.close();
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
