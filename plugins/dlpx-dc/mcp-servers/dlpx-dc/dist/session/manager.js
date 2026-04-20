import { Mutex } from "../util/mutex.js";
export class SessionManager {
    factory;
    slots = new Map();
    constructor(factory) {
        this.factory = factory;
    }
    async run(id, argv) {
        const slot = this.slotFor(id);
        return slot.mutex.run(() => slot.exec.run(argv));
    }
    slotFor(id) {
        let slot = this.slots.get(id);
        if (!slot) {
            slot = { exec: this.factory(id), mutex: new Mutex() };
            this.slots.set(id, slot);
        }
        return slot;
    }
    async closeAll() {
        const closings = [...this.slots.values()].map((s) => s.exec.close());
        this.slots.clear();
        await Promise.all(closings);
    }
}
//# sourceMappingURL=manager.js.map