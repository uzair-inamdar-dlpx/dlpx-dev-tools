export const TARGET_IDS = ["dlpxdc", "dcol1", "dcol2"] as const;
export type TargetId = (typeof TARGET_IDS)[number];

export interface Target {
  id: TargetId;
  host: string;
  requiresDcLogin: boolean;
}

const TARGETS: Record<TargetId, Target> = {
  dlpxdc: { id: "dlpxdc", host: "dlpxdc.co",         requiresDcLogin: true  },
  dcol1:  { id: "dcol1",  host: "dcol1.delphix.com", requiresDcLogin: false },
  dcol2:  { id: "dcol2",  host: "dcol2.delphix.com", requiresDcLogin: false },
};

export function getTarget(id: TargetId): Target {
  const t = TARGETS[id];
  if (!t) throw new Error(`unknown target: ${id}`);
  return t;
}

export function assertTargetSupports(
  id: TargetId,
  allowed: readonly TargetId[],
  operation: string,
): void {
  if (!allowed.includes(id)) {
    throw new Error(
      `${operation} is not supported on ${id}; allowed: ${allowed.join(", ")}`,
    );
  }
}
