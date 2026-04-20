import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
const roleEnum = z
    .enum(["librarian", "viewer", "user", "operator"])
    .describe("When using one-login, execute using this role (`--role`).");
export function createUnarchiveTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        vm_name: z
            .string()
            .min(1)
            .describe("The name of the VM to unarchive."),
        ignore_owner: z
            .boolean()
            .optional()
            .describe("Pass `--ignore-owner`/`--no-ignore-owner`."),
        wait: z
            .boolean()
            .optional()
            .describe("Wait for the instance to unarchive (`-w`/`--wait`). Pass false for `--no-wait`."),
        claiming: z
            .boolean()
            .optional()
            .describe("Currently unused by `dc unarchive`; toggles `--claiming`/`--no-claiming`."),
        api_host: z
            .string()
            .optional()
            .describe("Override `$DLPX_DC_API_HOST` (`--api-host`)."),
        test: z
            .boolean()
            .optional()
            .describe("Toggle `--test`/`--no-test` (defaults to `$DLPX_TEST`)."),
        use_default_cred: z
            .boolean()
            .optional()
            .describe("Use default AWS credentials without forcing a specific profile (`--use-default-cred`/`--no-use-default-cred`)."),
        use_one_login: z
            .boolean()
            .optional()
            .describe("Use one-login role profile (`--use-one-login`/`--no-use-one-login`)."),
        role: roleEnum.optional(),
        env: z
            .string()
            .optional()
            .describe("Override `$DLPX_DC_ENV` (`--env ENV`)."),
    });
    return {
        name: "dlpx_unarchive",
        description: "Unarchive a VM on dlpxdc.co (wraps `dc unarchive [opts] <name>`). dlpxdc only (AWS).",
        inputSchema,
        handler: async (raw) => {
            const p = inputSchema.parse(raw);
            const argv = ["dc", "unarchive"];
            if (p.ignore_owner === true)
                argv.push("--ignore-owner");
            else if (p.ignore_owner === false)
                argv.push("--no-ignore-owner");
            if (p.wait === true)
                argv.push("--wait");
            else if (p.wait === false)
                argv.push("--no-wait");
            if (p.claiming === true)
                argv.push("--claiming");
            else if (p.claiming === false)
                argv.push("--no-claiming");
            if (p.api_host)
                argv.push("--api-host", p.api_host);
            if (p.test === true)
                argv.push("--test");
            else if (p.test === false)
                argv.push("--no-test");
            if (p.use_default_cred === true)
                argv.push("--use-default-cred");
            else if (p.use_default_cred === false)
                argv.push("--no-use-default-cred");
            if (p.use_one_login === true)
                argv.push("--use-one-login");
            else if (p.use_one_login === false)
                argv.push("--no-use-one-login");
            if (p.role)
                argv.push("--role", p.role);
            if (p.env)
                argv.push("--env", p.env);
            argv.push(p.vm_name);
            return runOnTarget({
                manager: ctx.manager,
                creds: ctx.creds,
                target: p.target,
                allowed: ["dlpxdc"],
                operation: "unarchive",
                argv,
            });
        },
    };
}
//# sourceMappingURL=unarchive.js.map