import { describe, it, expect } from "vitest";
import {
  TARGET_IDS,
  getTarget,
  assertTargetSupports,
} from "../src/targets.js";

describe("targets", () => {
  it("exposes the three expected ids", () => {
    expect(TARGET_IDS).toEqual(["dlpxdc", "dcol1", "dcol2"]);
  });

  it("resolves dlpxdc with login required", () => {
    const t = getTarget("dlpxdc");
    expect(t.host).toBe("dlpxdc.co");
    expect(t.requiresDcLogin).toBe(true);
  });

  it("resolves dcol1 and dcol2 with login not required", () => {
    expect(getTarget("dcol1").requiresDcLogin).toBe(false);
    expect(getTarget("dcol2").requiresDcLogin).toBe(false);
    expect(getTarget("dcol1").host).toBe("dcol1.delphix.com");
    expect(getTarget("dcol2").host).toBe("dcol2.delphix.com");
  });

  it("throws on unknown id", () => {
    // @ts-expect-error deliberately wrong
    expect(() => getTarget("nope")).toThrow(/unknown target/i);
  });

  it("assertTargetSupports accepts allowed targets", () => {
    expect(() =>
      assertTargetSupports("dlpxdc", ["dlpxdc"], "unarchive"),
    ).not.toThrow();
  });

  it("assertTargetSupports rejects disallowed targets", () => {
    expect(() =>
      assertTargetSupports("dcol1", ["dlpxdc"], "unarchive"),
    ).toThrow(/unarchive.*not supported.*dcol1/i);
  });
});
