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
import { createGroupsTool } from "./tools/groups.js";
import { createHelpTool } from "./tools/help.js";
import type { ToolDef } from "./tools/types.js";

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

  // Password is resolved the first time a session needs it (via creds), so we
  // wrap SshSession behind a lazy adapter. This lets SessionManager's factory
  // stay synchronous while the actual SSH connect is async.
  class LazySshExec implements SshExec {
    private session?: SshSession;
    constructor(private readonly host: string) {}
    private async ensure(): Promise<SshSession> {
      if (!this.session) {
        this.session = new SshSession({
          host: this.host,
          username: config.ldapUser,
          password: await creds.getPassword(),
          keepaliveIntervalSec: config.sshKeepaliveSec,
          commandTimeoutSec: config.commandTimeoutSec,
        });
      }
      return this.session;
    }
    async run(argv: string[]): Promise<ExecResult> {
      return (await this.ensure()).run(argv);
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
    createGroupsTool(toolCtx),
    createHelpTool(toolCtx),
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
