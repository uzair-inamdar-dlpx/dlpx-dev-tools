import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createRegisterTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    vm_name: z
      .string()
      .min(1)
      .describe("The name of the VM to register."),
    esx_host: z
      .string()
      .optional()
      .describe(
        "Pin the VM to a specific ESX host (`--esx-host`). Defaults to a random host.",
      ),
    no_claiming: z
      .boolean()
      .optional()
      .describe("Skip claiming ownership of an unowned VM (`--no-claiming`)."),
    no_power_on: z
      .boolean()
      .optional()
      .describe("Skip power-on after registering (`--no-power-on`)."),
    wait: z
      .boolean()
      .optional()
      .describe("Wait for boot to finish (`-w`/`--wait`); non-zero exit if it doesn't."),
    subnet: z
      .string()
      .optional()
      .describe(
        "Assign the VM's interfaces to a named subnet (`--subnet`). Defaults to the default subnet.",
      ),
  });
  return {
    name: "dlpx_register",
    description:
      "Register a previously-unregistered VM to an ESX host and power it on (wraps `dc register [opts] <vm_name>`). dcol1 and dcol2 only.",
    inputSchema,
    handler: async (raw) => {
      const p = inputSchema.parse(raw);
      const argv = ["dc", "register"];
      if (p.esx_host) argv.push("--esx-host", p.esx_host);
      if (p.no_claiming) argv.push("--no-claiming");
      if (p.no_power_on) argv.push("--no-power-on");
      if (p.wait) argv.push("-w");
      if (p.subnet) argv.push("--subnet", p.subnet);
      argv.push(p.vm_name);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target: p.target,
        allowed: ["dcol1", "dcol2"],
        operation: "register",
        argv,
      });
    },
  };
}
