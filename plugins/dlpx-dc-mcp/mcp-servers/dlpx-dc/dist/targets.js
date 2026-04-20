export const TARGET_IDS = ["dlpxdc", "dcol1", "dcol2"];
const TARGETS = {
    dlpxdc: { id: "dlpxdc", host: "dlpxdc.co", requiresDcLogin: true },
    dcol1: { id: "dcol1", host: "dcol1.delphix.com", requiresDcLogin: false },
    dcol2: { id: "dcol2", host: "dcol2.delphix.com", requiresDcLogin: false },
};
export function getTarget(id) {
    const t = TARGETS[id];
    if (!t)
        throw new Error(`unknown target: ${id}`);
    return t;
}
export function assertTargetSupports(id, allowed, operation) {
    if (!allowed.includes(id)) {
        throw new Error(`${operation} is not supported on ${id}; allowed: ${allowed.join(", ")}`);
    }
}
//# sourceMappingURL=targets.js.map