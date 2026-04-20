import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
export function createExpireTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        days: z
            .number()
            .int()
            .positive()
            .describe("Number of days from now until the VMs expire."),
        vm_names: z
            .array(z.string().min(1))
            .min(1)
            .describe("One or more VM names whose expiration to update."),
        ignore_missing: z
            .boolean()
            .optional()
            .describe("Succeed even if the VM does not exist (`--ignore-missing`)."),
    });
    return {
        name: "dlpx_expire",
        description: "Takes a list of VMs and sets the expiration (in days) on each of them. Wraps `dc expire [--ignore-missing] <days> <vm_name>...`.",
        inputSchema,
        handler: async (raw) => {
            const { target, days, vm_names, ignore_missing } = inputSchema.parse(raw);
            const argv = ["dc", "expire"];
            if (ignore_missing)
                argv.push("--ignore-missing");
            argv.push(String(days), ...vm_names);
            return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
        },
    };
}
//# sourceMappingURL=expire.js.map