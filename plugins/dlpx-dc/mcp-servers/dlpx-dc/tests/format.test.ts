import { describe, it, expect } from "vitest";
import { formatExecResult } from "../src/format.js";

describe("formatExecResult", () => {
  it("renders a non-empty stdout/stderr result", () => {
    const text = formatExecResult({
      code: 0,
      stdout: "vm-1 created\n",
      stderr: "",
    });
    expect(text).toBe(
      "exit: 0\n--- stdout ---\nvm-1 created\n--- stderr ---\n(empty)",
    );
  });

  it("substitutes (empty) for blank streams", () => {
    const text = formatExecResult({ code: 2, stdout: "", stderr: "" });
    expect(text).toBe(
      "exit: 2\n--- stdout ---\n(empty)\n--- stderr ---\n(empty)",
    );
  });

  it("trims trailing newlines from each stream", () => {
    const text = formatExecResult({
      code: 0,
      stdout: "a\nb\n\n",
      stderr: "warn\n",
    });
    expect(text).toBe(
      "exit: 0\n--- stdout ---\na\nb\n--- stderr ---\nwarn",
    );
  });
});
