import { describe, it, expect, vi } from "vitest";
import { SessionManager } from "../../src/session/manager.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

class StubExec implements SshExec {
  public calls: string[][] = [];
  public closed = false;
  constructor(private responder: (argv: string[]) => Promise<ExecResult>) {}
  run(argv: string[]): Promise<ExecResult> {
    this.calls.push(argv);
    return this.responder(argv);
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

function ok(stdout = ""): ExecResult {
  return { stdout, stderr: "", code: 0 };
}

describe("SessionManager", () => {
  it("creates one session per target lazily", async () => {
    const factories = { dlpxdc: 0, dcol1: 0, dcol2: 0 };
    const mgr = new SessionManager((id) => {
      factories[id]++;
      return new StubExec(async () => ok(id));
    });
    await mgr.run("dcol1", ["dc", "list"]);
    await mgr.run("dcol1", ["dc", "list"]);
    await mgr.run("dcol2", ["dc", "list"]);
    expect(factories).toEqual({ dlpxdc: 0, dcol1: 1, dcol2: 1 });
  });

  it("serializes calls against the same target", async () => {
    const order: string[] = [];
    const stub = new StubExec(async (argv) => {
      order.push(`start:${argv[0]}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${argv[0]}`);
      return ok();
    });
    const mgr = new SessionManager(() => stub);
    await Promise.all([
      mgr.run("dcol1", ["a"]),
      mgr.run("dcol1", ["b"]),
      mgr.run("dcol1", ["c"]),
    ]);
    expect(order).toEqual([
      "start:a", "end:a",
      "start:b", "end:b",
      "start:c", "end:c",
    ]);
  });

  it("runs different targets in parallel", async () => {
    let concurrent = 0;
    let peak = 0;
    const make = () =>
      new StubExec(async () => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return ok();
      });
    const mgr = new SessionManager(() => make());
    await Promise.all([
      mgr.run("dcol1", ["x"]),
      mgr.run("dcol2", ["x"]),
    ]);
    expect(peak).toBe(2);
  });

  it("closeAll closes all live sessions", async () => {
    const stubs: StubExec[] = [];
    const mgr = new SessionManager(() => {
      const s = new StubExec(async () => ok());
      stubs.push(s);
      return s;
    });
    await mgr.run("dcol1", ["a"]);
    await mgr.run("dcol2", ["a"]);
    await mgr.closeAll();
    expect(stubs.every((s) => s.closed)).toBe(true);
  });
});
