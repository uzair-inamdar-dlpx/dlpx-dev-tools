import { z } from "zod";
import type { SessionManager } from "../session/manager.js";
import type { CredentialStore } from "../auth/credentials.js";

export interface ToolContext {
  manager: SessionManager;
  creds: CredentialStore;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: any) => Promise<string>;
}

export const targetSchema = z
  .enum(["dlpxdc", "dcol1", "dcol2"])
  .describe(
    "Which VM to run against. dlpxdc = dlpxdc.co (AWS), dcol1 = dcol1.delphix.com, dcol2 = dcol2.delphix.com.",
  );
