import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
export function createListTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        vm_name: z
            .string()
            .optional()
            .describe("Optional VM name to display. Must be omitted if `all` or `group` is set."),
        all: z
            .boolean()
            .optional()
            .describe("List every VM, including initial snapshots and those created by other users (`-a`). Default columns: name,esx_host,user,expires."),
        group: z
            .string()
            .optional()
            .describe("List VMs in the given group (`-g GROUP`)."),
        sort: z
            .array(z.string())
            .optional()
            .describe("Sort VMs by these properties, joined with commas and passed as `-s` (default: name)."),
        columns: z
            .array(z.string())
            .optional()
            .describe("Columns to include, joined with commas and passed as `-o` (default: name,esx_host,expires,unregisters)."),
        omit_headers: z
            .boolean()
            .optional()
            .describe("Omit column headers and use a single hard tab between columns for easy awk consumption (`-H`)."),
    });
    return {
        name: "dlpx_list",
        description: "List VMs and their properties on the target (wraps `dc list`). By default shows the current user's VMs. Valid properties include: name, created, user, esx_host, registered_since, group, source_group, expires, vnc_port, tty_port, mac, ip, ips, hostname, hostnames, used, vips, automation_id, cluster_name, cluster_state, cluster_group, cluster_pool_name, cluster_pool_size, content_type, unregisters, version.",
        inputSchema,
        handler: async (raw) => {
            const { target, vm_name, all, group, sort, columns, omit_headers } = inputSchema.parse(raw);
            if (vm_name && (all || group)) {
                throw new Error("vm_name cannot be combined with `all` or `group`; the CLI rejects positional VMs alongside -a/-g.");
            }
            const argv = ["dc", "list"];
            if (all)
                argv.push("-a");
            if (group)
                argv.push("-g", group);
            if (sort && sort.length > 0)
                argv.push("-s", sort.join(","));
            if (columns && columns.length > 0)
                argv.push("-o", columns.join(","));
            if (omit_headers)
                argv.push("-H");
            if (vm_name)
                argv.push(vm_name);
            return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
        },
    };
}
//# sourceMappingURL=list.js.map