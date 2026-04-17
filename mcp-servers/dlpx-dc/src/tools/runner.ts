import { getTarget, assertTargetSupports, type TargetId } from "../targets.js";
import { SessionManager } from "../session/manager.js";
import { CredentialStore } from "../auth/credentials.js";
import { runWithDcLogin } from "../auth/dc-login.js";
import { formatExecResult } from "../format.js";

export interface RunOnTargetOptions {
  manager: SessionManager;
  creds: CredentialStore;
  target: TargetId;
  argv: string[];
  allowed?: readonly TargetId[];
  operation?: string;
}

export async function runOnTarget(opts: RunOnTargetOptions): Promise<string> {
  if (opts.allowed) {
    assertTargetSupports(
      opts.target,
      opts.allowed,
      opts.operation ?? "operation",
    );
  }
  const target = getTarget(opts.target);
  const run = (argv: string[]) => opts.manager.run(opts.target, argv);
  const result = target.requiresDcLogin
    ? await runWithDcLogin(run, opts.creds, opts.argv)
    : await run(opts.argv);
  return formatExecResult(result);
}
