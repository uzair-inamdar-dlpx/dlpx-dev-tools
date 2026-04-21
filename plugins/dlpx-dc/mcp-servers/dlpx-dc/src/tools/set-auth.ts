import { z } from "zod";
import type { AuthMode } from "../config.js";
import { AUTH_MODES } from "../config.js";
import type { SessionManager } from "../session/manager.js";
import type { ToolDef } from "./types.js";

export interface SetAuthDeps {
  manager: SessionManager;
  getMode: () => AuthMode;
  setMode: (mode: AuthMode) => void;
  agentSocketPresent: boolean;
}

export function createSetAuthTool(deps: SetAuthDeps): ToolDef {
  const inputSchema = z.object({
    method: z
      .enum(AUTH_MODES as readonly [AuthMode, ...AuthMode[]])
      .describe(
        "Which SSH auth method to use for subsequent connections. " +
          "'auto' = agent-first with password fallback; " +
          "'agent' = agent only (fails fast if agent can't auth); " +
          "'password' = LDAP password only (skip the agent).",
      ),
  });
  return {
    name: "dlpx_set_auth",
    description:
      "Set the SSH auth mode used for subsequent connections to dlpxdc/dcol1/dcol2. " +
      "Applies to the plugin process lifetime; restart reverts to DLPX_SSH_AUTH. " +
      "Any live SSH sessions are closed so the next tool call reconnects with the new mode.",
    inputSchema,
    handler: async (raw) => {
      const { method } = inputSchema.parse(raw);
      deps.setMode(method);
      await deps.manager.closeAll();
      return (
        `auth mode set to ${deps.getMode()}; sessions reset; ` +
        `agent socket present: ${deps.agentSocketPresent}`
      );
    },
  };
}
