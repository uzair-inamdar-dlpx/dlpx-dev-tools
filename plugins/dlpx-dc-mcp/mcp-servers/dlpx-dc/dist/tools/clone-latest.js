import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { targetSchema } from "./types.js";
import { getTarget } from "../targets.js";
const cloudEnum = z
    .enum(["AWS", "AZURE", "GCP", "OCI", "IBM"])
    .describe("Cloud in which to clone the instance (AWS only, `--cloud`).");
const roleEnum = z
    .enum(["librarian", "viewer", "user", "operator"])
    .describe("When using one-login, execute with this role (AWS only, `--role`).");
// Fields whose presence means "non-AWS-only"; used for target-variant gating.
const NON_AWS_ONLY = [
    "esx_host",
    "vm_memory",
    "num_vcpus",
    "no_scripts",
    "no_vmx_template",
    "no_register",
    "no_power_on",
    "subnet",
    "skip_wait_esx_slot",
    "virtual_suffix",
];
// Fields whose presence means "AWS-only".
const AWS_ONLY = [
    "cloud",
    "wait_timeout_m",
    "size",
    "powers_off",
    "register",
    "public_key",
    "dlpx_dc_tags",
    "extra_opts",
    "api_host",
    "test",
    "use_default_cred",
    "use_one_login",
    "role",
    "env",
];
export function createCloneLatestTool(ctx) {
    const inputSchema = z.object({
        target: targetSchema,
        image_name: z
            .string()
            .min(1)
            .describe("The group to clone from (also referred to as the image, e.g. `ubuntu-22`)."),
        vm_name: z
            .string()
            .min(1)
            .describe("Name for the new VM/instance."),
        // Shared across both variants
        wait: z
            .boolean()
            .optional()
            .describe("Wait for the VM to finish booting (`-w`/`--wait`). On AWS, false appends `--no-wait`; on non-AWS only true has an effect."),
        automation_id: z
            .string()
            .optional()
            .describe("A unique identifier for the automation job (e.g. Jenkins URL, `--automation-id`)."),
        // Non-AWS (dcol1 / dcol2) only
        esx_host: z
            .string()
            .optional()
            .describe("Non-AWS only. Specific ESX host to register the VM to (`--esx-host`); random if omitted."),
        vm_memory: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Non-AWS only. VM memory in MB (`--vm-memory`)."),
        num_vcpus: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Non-AWS only. Number of vCPUs (`--num-vcpus`)."),
        no_scripts: z
            .boolean()
            .optional()
            .describe("Non-AWS only. Do not run any post-clone scripts (`--no-scripts`)."),
        no_vmx_template: z
            .boolean()
            .optional()
            .describe("Non-AWS only. Ignore any VMX templates when creating the new VM (`--no-vmx-template`)."),
        no_register: z
            .boolean()
            .optional()
            .describe("Non-AWS only. Do not register the VM to an ESX host automatically after creation (`--no-register`)."),
        no_power_on: z
            .boolean()
            .optional()
            .describe("Non-AWS only. Do not power on the VM automatically after creation (`--no-power-on`)."),
        subnet: z
            .string()
            .optional()
            .describe("Non-AWS only. Assign the VM's interfaces to this named subnet (`--subnet`)."),
        skip_wait_esx_slot: z
            .boolean()
            .optional()
            .describe("Non-AWS only. Skip waiting for a free ESX slot; fail immediately if none (`--skip-wait-esx-slot`)."),
        virtual_suffix: z
            .string()
            .optional()
            .describe("Non-AWS only. Create a virtual IP with this suffix (`--virtual-suffix`)."),
        // AWS (dlpxdc) only
        cloud: cloudEnum.optional(),
        wait_timeout_m: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("AWS only. Minutes to wait before timing out when `wait` is set (`-W`/`--wait-timeout-m`)."),
        size: z
            .string()
            .optional()
            .describe("AWS only. Override the default instance size (`-S`/`--size`). Affects cost."),
        powers_off: z
            .string()
            .optional()
            .describe("AWS only. Override the default power-off duration in days (`-P`/`--powers-off`). Affects cost."),
        register: z
            .boolean()
            .optional()
            .describe("AWS only. true → `--register` (register as created); false → `--no-register`."),
        public_key: z
            .string()
            .optional()
            .describe("AWS only. Path to public key used by the instance (`--public-key`)."),
        dlpx_dc_tags: z
            .string()
            .optional()
            .describe("AWS only. Customized tags for the instance (`--dlpx-dc-tags`)."),
        extra_opts: z
            .string()
            .optional()
            .describe("AWS only. Comma-separated key=value pairs of additional properties (`--extra-opts`)."),
        api_host: z
            .string()
            .optional()
            .describe("AWS only. Override `$DLPX_DC_API_HOST` (`--api-host`)."),
        test: z
            .boolean()
            .optional()
            .describe("AWS only. Toggle `--test`/`--no-test` (defaults to `$DLPX_TEST`)."),
        use_default_cred: z
            .boolean()
            .optional()
            .describe("AWS only. Use default AWS credentials without forcing a specific profile (`--use-default-cred`/`--no-use-default-cred`)."),
        use_one_login: z
            .boolean()
            .optional()
            .describe("AWS only. Use one-login role profile (`--use-one-login`/`--no-use-one-login`)."),
        role: roleEnum.optional(),
        env: z
            .string()
            .optional()
            .describe("AWS only. Override `$DLPX_DC_ENV` (`--env`)."),
    });
    return {
        name: "dlpx_clone_latest",
        description: "Clone the latest initial snapshot in a given group into a new VM/instance (wraps `dc clone-latest <group> <name>`). Long-running: may take several minutes. On dlpxdc (AWS) and on dcol1/dcol2 (non-AWS) different flag sets apply — this tool branches on the target and rejects cross-variant flags.",
        inputSchema,
        handler: async (raw) => {
            const p = inputSchema.parse(raw);
            const isAws = getTarget(p.target).requiresDcLogin;
            const violating = (isAws ? NON_AWS_ONLY : AWS_ONLY).filter((k) => p[k] !== undefined);
            if (violating.length > 0) {
                const variantLabel = isAws ? "AWS (dlpxdc)" : "non-AWS (dcol1/dcol2)";
                throw new Error(`the following flags are not supported on ${variantLabel}: ${violating.join(", ")}`);
            }
            const argv = ["dc", "clone-latest"];
            if (isAws) {
                if (p.cloud)
                    argv.push("--cloud", p.cloud);
                if (p.wait === true)
                    argv.push("--wait");
                else if (p.wait === false)
                    argv.push("--no-wait");
                if (p.wait_timeout_m !== undefined)
                    argv.push("--wait-timeout-m", String(p.wait_timeout_m));
                if (p.size !== undefined)
                    argv.push("--size", p.size);
                if (p.powers_off !== undefined)
                    argv.push("--powers-off", p.powers_off);
                if (p.register === true)
                    argv.push("--register");
                else if (p.register === false)
                    argv.push("--no-register");
                if (p.public_key)
                    argv.push("--public-key", p.public_key);
                if (p.automation_id)
                    argv.push("--automation-id", p.automation_id);
                if (p.dlpx_dc_tags)
                    argv.push("--dlpx-dc-tags", p.dlpx_dc_tags);
                if (p.extra_opts)
                    argv.push("--extra-opts", p.extra_opts);
                if (p.api_host)
                    argv.push("--api-host", p.api_host);
                if (p.test === true)
                    argv.push("--test");
                else if (p.test === false)
                    argv.push("--no-test");
                if (p.use_default_cred === true)
                    argv.push("--use-default-cred");
                else if (p.use_default_cred === false)
                    argv.push("--no-use-default-cred");
                if (p.use_one_login === true)
                    argv.push("--use-one-login");
                else if (p.use_one_login === false)
                    argv.push("--no-use-one-login");
                if (p.role)
                    argv.push("--role", p.role);
                if (p.env)
                    argv.push("--env", p.env);
            }
            else {
                if (p.esx_host)
                    argv.push("--esx-host", p.esx_host);
                if (p.vm_memory !== undefined)
                    argv.push("--vm-memory", String(p.vm_memory));
                if (p.num_vcpus !== undefined)
                    argv.push("--num-vcpus", String(p.num_vcpus));
                if (p.no_scripts)
                    argv.push("--no-scripts");
                if (p.no_vmx_template)
                    argv.push("--no-vmx-template");
                if (p.wait === true)
                    argv.push("-w");
                if (p.no_register)
                    argv.push("--no-register");
                if (p.no_power_on)
                    argv.push("--no-power-on");
                if (p.subnet)
                    argv.push("--subnet", p.subnet);
                if (p.skip_wait_esx_slot)
                    argv.push("--skip-wait-esx-slot");
                if (p.virtual_suffix)
                    argv.push("--virtual-suffix", p.virtual_suffix);
                if (p.automation_id)
                    argv.push("--automation-id", p.automation_id);
            }
            argv.push(p.image_name, p.vm_name);
            return runOnTarget({
                manager: ctx.manager,
                creds: ctx.creds,
                target: p.target,
                argv,
            });
        },
    };
}
//# sourceMappingURL=clone-latest.js.map