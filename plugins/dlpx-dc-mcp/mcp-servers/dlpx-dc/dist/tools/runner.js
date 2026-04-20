import { getTarget, assertTargetSupports } from "../targets.js";
import { runWithDcLogin } from "../auth/dc-login.js";
import { formatExecResult } from "../format.js";
export async function runOnTarget(opts) {
    if (opts.allowed) {
        assertTargetSupports(opts.target, opts.allowed, opts.operation ?? "operation");
    }
    const target = getTarget(opts.target);
    const run = (argv) => opts.manager.run(opts.target, argv);
    const result = target.requiresDcLogin
        ? await runWithDcLogin(run, opts.creds, opts.argv)
        : await run(opts.argv);
    return formatExecResult(result);
}
//# sourceMappingURL=runner.js.map