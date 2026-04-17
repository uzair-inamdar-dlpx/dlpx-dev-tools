import type { ExecResult } from "../session/exec.js";
import type { CredentialStore } from "./credentials.js";

const LOGIN_REQUIRED_PATTERNS = [
  /please run ['"]?dc login['"]?/i,
  /authentication token expired/i,
  /not logged in/i,
  /login required/i,
  /session expired/i,
];

export function isLoginRequiredError(r: ExecResult): boolean {
  if (r.code === 0) return false;
  const haystack = `${r.stderr}\n${r.stdout}`;
  return LOGIN_REQUIRED_PATTERNS.some((p) => p.test(haystack));
}

export type RunFn = (argv: string[]) => Promise<ExecResult>;

export async function runWithDcLogin(
  run: RunFn,
  creds: CredentialStore,
  argv: string[],
): Promise<ExecResult> {
  const first = await run(argv);
  if (!isLoginRequiredError(first)) return first;

  const password = await creds.getPassword();
  const otp = await creds.getOtp();
  // NOTE: `--password <value>` makes the password visible to `ps` on the
  // remote host for the duration of `dc login`. Confirm during smoke test
  // whether `dc login` supports stdin piping or an env-var form, and switch
  // to that if available.
  const login = await run([
    "dc",
    "login",
    "--user", creds.user,
    "--password", password,
    "--otp", otp,
  ]);
  if (login.code !== 0) {
    throw new Error(
      `dc login failed (exit ${login.code}): ${login.stderr.trim() || login.stdout.trim()}`,
    );
  }
  return run(argv);
}
