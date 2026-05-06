import type { ExecResult, RunOptions } from "../session/exec.js";
import type { CredentialStore } from "./credentials.js";

const LOGIN_REQUIRED_PATTERNS = [
  /please run ['"]?dc login['"]?/i,
  /authentication token expired/i,
  /not logged in/i,
  /login required/i,
  /session expired/i,
  /user login expired/i,
  /invalid credentials/i,
];

export function isLoginRequiredError(r: ExecResult): boolean {
  if (r.code === 0) return false;
  const haystack = `${r.stderr}\n${r.stdout}`;
  return LOGIN_REQUIRED_PATTERNS.some((p) => p.test(haystack));
}

export type RunFn = (
  argv: string[],
  opts?: RunOptions,
) => Promise<ExecResult>;

function oneLoginUsername(ldapUser: string): string {
  return ldapUser.includes("@") ? ldapUser : `${ldapUser}@delphix.com`;
}

export async function runWithDcLogin(
  run: RunFn,
  creds: CredentialStore,
  argv: string[],
): Promise<ExecResult> {
  const first = await run(argv);
  if (!isLoginRequiredError(first)) return first;

  const password = await creds.getPassword();
  const otp = await creds.getOtp();
  // `dc login` reads the password and OTP via /dev/tty (Python getpass), so a
  // PTY is required. Pre-writing input to the PTY is unsafe because getpass
  // calls tcsetattr with TCSAFLUSH and discards anything already buffered;
  // hence we drive prompts on-match. `--username` is passed explicitly so
  // the username prompt is suppressed entirely.
  const login = await run(
    ["dc", "login", "--username", oneLoginUsername(creds.user)],
    {
      pty: true,
      timeoutSec: 60,
      prompts: [
        { match: /OneLogin password.*:/i, respond: password },
        { match: /OneLogin Protect Token:/i, respond: otp },
      ],
    },
  );
  if (login.code !== 0) {
    throw new Error(
      `dc login failed (exit ${login.code}): ${login.stderr.trim() || login.stdout.trim()}`,
    );
  }
  return run(argv);
}
