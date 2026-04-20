import { z } from "zod";
export const targetSchema = z
    .enum(["dlpxdc", "dcol1", "dcol2"])
    .describe("Which VM to run against. dlpxdc = dlpxdc.co (AWS), dcol1 = dcol1.delphix.com, dcol2 = dcol2.delphix.com.");
//# sourceMappingURL=types.js.map