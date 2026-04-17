import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createListTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    vm_name: z.string().optional().describe("Filter to a single VM by name."),
    columns: z
      .array(z.string())
      .optional()
      .describe("Columns to include, joined with commas and passed as `-o`."),
  });
  return {
    name: "dlpx_list",
    description: "List VMs currently provisioned on the target (wraps `dc list`).",
    inputSchema,
    handler: async (raw) => {
      const { target, vm_name, columns } = inputSchema.parse(raw);
      const argv = ["dc", "list"];
      if (vm_name) argv.push(vm_name);
      if (columns && columns.length > 0) argv.push("-o", columns.join(","));
      return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
    },
  };
}
