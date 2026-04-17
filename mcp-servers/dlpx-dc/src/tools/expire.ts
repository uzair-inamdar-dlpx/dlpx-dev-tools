import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createExpireTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    days: z
      .number()
      .int()
      .positive()
      .describe("Number of days from now until the VM expires."),
    vm_names: z
      .array(z.string().min(1))
      .min(1)
      .describe("One or more VM names to update."),
  });
  return {
    name: "dlpx_expire",
    description:
      "Set the expiration (in days) for one or more VMs (wraps `dc expire <days> <vm...>`).",
    inputSchema,
    handler: async (raw) => {
      const { target, days, vm_names } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        argv: ["dc", "expire", String(days), ...vm_names],
      });
    },
  };
}
