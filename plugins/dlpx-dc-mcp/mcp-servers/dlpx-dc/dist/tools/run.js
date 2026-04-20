import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
export function createRunTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        args: z
            .array(z.string())
            .min(1, "args must contain at least one element")
            .describe("Argv passed after `dc`. Example: ['list', '-o', 'name,ip']."),
    });
    return {
        name: "dlpx_run",
        description: "Run an arbitrary `dc` command on the given VM. Escape hatch for subcommands that don't have a dedicated tool.",
        inputSchema,
        handler: async (raw) => {
            const { target, args } = inputSchema.parse(raw);
            return runOnTarget({
                manager: ctx.manager,
                creds: ctx.creds,
                target,
                argv: ["dc", ...args],
            });
        },
    };
}
//# sourceMappingURL=run.js.map