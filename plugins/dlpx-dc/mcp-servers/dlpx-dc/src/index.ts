#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { getTarget } from "./targets.js";
import { SessionManager } from "./session/manager.js";
import { SshSession } from "./session/ssh-session.js";
import { CredentialStore } from "./auth/credentials.js";
import type { Elicitor } from "./auth/elicit.js";
import type { SshExec, ExecResult } from "./session/exec.js";
import { createRunTool } from "./tools/run.js";
import { createListTool } from "./tools/list.js";
import { createCloneLatestTool } from "./tools/clone-latest.js";
import { createExpireTool } from "./tools/expire.js";
import { createSetUnregistersTool } from "./tools/set-unregisters.js";
import { createUnarchiveTool } from "./tools/unarchive.js";
import { createRegisterTool } from "./tools/register.js";
import { createGroupsTool } from "./tools/groups.js";
import { createHelpTool } from "./tools/help.js";
import { createSetAuthTool } from "./tools/set-auth.js";
import type { ToolDef } from "./tools/types.js";
import type { AuthMode } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: "dlpx-dc",
    version: "0.1.0",
  });

  const elicitor: Elicitor = {
    async promptPassword(message) {
      const res = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: "object",
          properties: {
            password: { type: "string", title: "LDAP password" },
          },
          required: ["password"],
        },
      });
      if (res.action !== "accept" || !res.content?.password) {
        throw new Error("password elicitation cancelled or empty");
      }
      return String(res.content.password);
    },
    async promptOtp(message) {
      const res = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: "object",
          properties: {
            otp: {
              type: "string",
              title: "6-digit OTP",
              minLength: 6,
              maxLength: 6,
            },
          },
          required: ["otp"],
        },
      });
      if (res.action !== "accept" || !res.content?.otp) {
        throw new Error("OTP elicitation cancelled or empty");
      }
      return String(res.content.otp);
    },
  };

  const creds = new CredentialStore(
    config.ldapUser,
    config.ldapPassword,
    elicitor,
  );

  // Mutable at runtime via dlpx_set_auth. Seeded from DLPX_SSH_AUTH.
  let currentMode: AuthMode = config.authMode;
  const agentSocket = process.env.SSH_AUTH_SOCK;

  // SshSession resolves auth lazily: agent first (if SSH_AUTH_SOCK is set and
  // mode permits), password (via `creds`) only if needed. Keeping the wrapper
  // lets SessionManager's factory stay synchronous.
  class LazySshExec implements SshExec {
    private session?: SshSession;
    constructor(private readonly host: string) {}
    private ensure(): SshSession {
      if (!this.session) {
        this.session = new SshSession({
          host: this.host,
          username: config.ldapUser,
          agentSocket,
          password: () => creds.getPassword(),
          getMode: () => currentMode,
          keepaliveIntervalSec: config.sshKeepaliveSec,
          commandTimeoutSec: config.commandTimeoutSec,
        });
      }
      return this.session;
    }
    async run(argv: string[]): Promise<ExecResult> {
      return this.ensure().run(argv);
    }
    async close(): Promise<void> {
      if (this.session) await this.session.close();
      this.session = undefined;
    }
  }

  const manager = new SessionManager(
    (id) => new LazySshExec(getTarget(id).host),
  );

  const toolCtx = { manager, creds };
  const tools: ToolDef[] = [
    createRunTool(toolCtx),
    createListTool(toolCtx),
    createCloneLatestTool(toolCtx),
    createExpireTool(toolCtx),
    createSetUnregistersTool(toolCtx),
    createUnarchiveTool(toolCtx),
    createRegisterTool(toolCtx),
    createGroupsTool(toolCtx),
    createHelpTool(toolCtx),
    createSetAuthTool({
      manager,
      getMode: () => currentMode,
      setMode: (m) => { currentMode = m; },
      agentSocketPresent: Boolean(agentSocket),
    }),
  ];

  for (const tool of tools) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema.shape,
      async (args: Record<string, unknown>) => {
        try {
          const text = await tool.handler(args);
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    );
  }

  const shutdown = async () => {
    await manager.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
