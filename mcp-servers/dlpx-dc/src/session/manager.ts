import { Mutex } from "../util/mutex.js";
import type { TargetId } from "../targets.js";
import type { ExecResult, SshExec } from "./exec.js";

export type SessionFactory = (id: TargetId) => SshExec;

interface Slot {
  exec: SshExec;
  mutex: Mutex;
}

export class SessionManager {
  private slots = new Map<TargetId, Slot>();

  constructor(private readonly factory: SessionFactory) {}

  async run(id: TargetId, argv: string[]): Promise<ExecResult> {
    const slot = this.slotFor(id);
    return slot.mutex.run(() => slot.exec.run(argv));
  }

  private slotFor(id: TargetId): Slot {
    let slot = this.slots.get(id);
    if (!slot) {
      slot = { exec: this.factory(id), mutex: new Mutex() };
      this.slots.set(id, slot);
    }
    return slot;
  }

  async closeAll(): Promise<void> {
    const closings = [...this.slots.values()].map((s) => s.exec.close());
    this.slots.clear();
    await Promise.all(closings);
  }
}
