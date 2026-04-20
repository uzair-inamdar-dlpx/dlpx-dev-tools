import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
export function createGroupsTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        action: z
            .enum(["set", "unset", "list"])
            .describe("`dc groups` subcommand to run: `set`, `unset`, or `list`."),
        args: z
            .array(z.string().min(1))
            .optional()
            .describe("Positional arguments for the subcommand (e.g. group/VM names). Consult `dlpx_help` with subcommand=`groups` for full sub-subcommand help."),
    });
    return {
        name: "dlpx_groups",
        description: "List and manipulate VM groups (wraps `dc groups {set,unset,list}`). The latest snapshot in a group can be cloned with `dlpx_clone_latest`.",
        inputSchema,
        handler: async (raw) => {
            const { target, action, args } = inputSchema.parse(raw);
            const argv = ["dc", "groups", action, ...(args ?? [])];
            return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
        },
    };
}
//# sourceMappingURL=groups.js.map