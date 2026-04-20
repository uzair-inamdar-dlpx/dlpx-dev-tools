export class Mutex {
    tail = Promise.resolve();
    run(fn) {
        const next = this.tail.then(() => fn());
        this.tail = next.catch(() => undefined);
        return next;
    }
}
//# sourceMappingURL=mutex.js.map