import { describe, it, expect } from "vitest";
import { shellQuote } from "../../src/util/shell-quote.js";

describe("shellQuote", () => {
  it("returns simple words unquoted", () => {
    expect(shellQuote(["dc", "list"])).toBe("dc list");
  });

  it("single-quotes args with spaces or metachars", () => {
    expect(shellQuote(["dc", "my vm"])).toBe("dc 'my vm'");
    expect(shellQuote(["dc", "a;rm -rf /"])).toBe("dc 'a;rm -rf /'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote(["echo", "it's"])).toBe(`echo 'it'\\''s'`);
  });
});
