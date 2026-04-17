import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createCloneLatestTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    image_name: z.string().min(1).describe("Image to clone from (e.g. ubuntu-22)."),
    vm_name: z.string().min(1).describe("Name for the new VM."),
  });
  return {
    name: "dlpx_clone_latest",
    description:
      "Provision a new VM from the latest of an image (wraps `dc clone-latest <image> <vm>`). Long-running: may take several minutes.",
    inputSchema,
    handler: async (raw) => {
      const { target, image_name, vm_name } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        argv: ["dc", "clone-latest", image_name, vm_name],
      });
    },
  };
}
