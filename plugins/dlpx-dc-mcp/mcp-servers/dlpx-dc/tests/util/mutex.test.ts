import { describe, it, expect } from "vitest";
import { Mutex } from "../../src/util/mutex.js";

describe("Mutex", () => {
  it("serializes overlapping calls", async () => {
    const m = new Mutex();
    const log: string[] = [];
    const task = (id: string, ms: number) =>
      m.run(async () => {
        log.push(`start-${id}`);
        await new Promise((r) => setTimeout(r, ms));
        log.push(`end-${id}`);
      });
    await Promise.all([task("a", 20), task("b", 5), task("c", 5)]);
    expect(log).toEqual([
      "start-a", "end-a",
      "start-b", "end-b",
      "start-c", "end-c",
    ]);
  });

  it("keeps serializing after a rejection", async () => {
    const m = new Mutex();
    const log: string[] = [];
    await expect(
      m.run(async () => { log.push("a"); throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    await m.run(async () => { log.push("b"); });
    expect(log).toEqual(["a", "b"]);
  });
});
