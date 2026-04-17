import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createHelpTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    subcommand: z
      .string()
      .min(1)
      .optional()
      .describe("If given, shows help for that subcommand; otherwise top-level `dc --help`."),
  });
  return {
    name: "dlpx_help",
    description: "Show help text for `dc` or a specific subcommand.",
    inputSchema,
    handler: async (raw) => {
      const { target, subcommand } = inputSchema.parse(raw);
      const argv = subcommand ? ["dc", subcommand, "--help"] : ["dc", "--help"];
      return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
    },
  };
}
