import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createUnarchiveTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    vm_name: z.string().min(1),
  });
  return {
    name: "dlpx_unarchive",
    description:
      "Unarchive a VM on dlpxdc.co (wraps `dc unarchive <vm>`). dlpxdc only.",
    inputSchema,
    handler: async (raw) => {
      const { target, vm_name } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        allowed: ["dlpxdc"],
        operation: "unarchive",
        argv: ["dc", "unarchive", vm_name],
      });
    },
  };
}
