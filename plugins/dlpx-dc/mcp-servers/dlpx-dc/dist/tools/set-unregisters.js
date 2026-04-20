import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
export function createSetUnregistersTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        days: z
            .number()
            .int()
            .positive()
            .describe("Number of days from now until the VMs are unregistered/slept."),
        vm_names: z
            .array(z.string().min(1))
            .min(1)
            .describe("One or more VM names whose un-registration time to extend."),
        ignore_missing: z
            .boolean()
            .optional()
            .describe("Succeed even if the VM does not exist (`--ignore-missing`)."),
    });
    return {
        name: "dlpx_set_unregisters",
        description: "Takes a list of VMs and extends the un-registration time on each of them. Wraps `dc set-unregisters [--ignore-missing] <days> <vm_name>...`. dcol1 and dcol2 only (non-AWS).",
        inputSchema,
        handler: async (raw) => {
            const { target, days, vm_names, ignore_missing } = inputSchema.parse(raw);
            const argv = ["dc", "set-unregisters"];
            if (ignore_missing)
                argv.push("--ignore-missing");
            argv.push(String(days), ...vm_names);
            return runOnTarget({
                manager: ctx.manager,
                creds: ctx.creds,
                target,
                allowed: ["dcol1", "dcol2"],
                operation: "set-unregisters",
                argv,
            });
        },
    };
}
//# sourceMappingURL=set-unregisters.js.map