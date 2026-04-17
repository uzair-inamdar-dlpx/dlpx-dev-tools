import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createSetUnregistersTool(ctx: ToolContext): ToolDef {
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
      .describe("One or more VM names to update."),
  });
  return {
    name: "dlpx_set_unregisters",
    description:
      "Schedule unregister/sleep in N days for one or more VMs (wraps `dc set-unregisters <days> <vm...>`). dcol1 and dcol2 only.",
    inputSchema,
    handler: async (raw) => {
      const { target, days, vm_names } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        allowed: ["dcol1", "dcol2"],
        operation: "set-unregisters",
        argv: ["dc", "set-unregisters", String(days), ...vm_names],
      });
    },
  };
}
