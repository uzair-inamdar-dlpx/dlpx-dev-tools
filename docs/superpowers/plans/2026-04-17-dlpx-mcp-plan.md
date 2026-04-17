# dlpx-dc MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin whose first component is an MCP server (`dlpx-dc`) that wraps the internal `dc` CLI over persistent SSH sessions to three VMs (`dlpxdc.co`, `dcol1.delphix.com`, `dcol2.delphix.com`).

**Architecture:** Single-process, per-engineer stdio MCP server in TypeScript/Node. Lazy per-VM SSH sessions (via `ssh2`) serialized by a per-target mutex. Business logic depends on an `SshExec` interface so tools are unit-testable without a real SSH server. LDAP password loaded from env var with an MCP-elicitation prompt fallback; OTP prompted via elicitation only when `dc login` expiry is detected on `dlpxdc`.

**Tech Stack:** Node ≥ 20, TypeScript, `@modelcontextprotocol/sdk`, `ssh2`, `zod`, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-17-dlpx-mcp-design.md`

**Conventions used throughout:**
- All paths are relative to the repo root `/Users/uzair.inamdar/Documents/dlpx-plugin` unless prefixed.
- All `npm` commands run inside `mcp-servers/dlpx-dc/` unless stated otherwise.
- Tests use Vitest (`npx vitest run <file>` for one-shot, `--watch` for dev).
- Every task ends with a git commit. Task 1 initializes the repo.

---

### Task 1: Initialize plugin repo, TypeScript package, and dependencies

**Files:**
- Create: `.gitignore`
- Create: `.claude-plugin/plugin.json` (stub; filled in Task 18)
- Create: `mcp-servers/dlpx-dc/package.json`
- Create: `mcp-servers/dlpx-dc/tsconfig.json`
- Create: `mcp-servers/dlpx-dc/vitest.config.ts`
- Create: `mcp-servers/dlpx-dc/.gitignore`

- [ ] **Step 1: Initialize git repo**

Run from repo root:
```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git init
git add docs/
git commit -m "chore: import approved design spec"
```

- [ ] **Step 2: Write top-level `.gitignore`**

Create `/Users/uzair.inamdar/Documents/dlpx-plugin/.gitignore`:
```
node_modules/
dist/
*.log
.DS_Store
.env
.env.local
```

- [ ] **Step 3: Write `mcp-servers/dlpx-dc/package.json`**

```json
{
  "name": "dlpx-dc-mcp",
  "version": "0.1.0",
  "description": "MCP server for Delphix dc CLI over SSH",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "dlpx-dc-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node dist/index.js"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ssh2": "^1.15.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ssh2": "^1.15.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Write `mcp-servers/dlpx-dc/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Write `mcp-servers/dlpx-dc/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 6: Write `mcp-servers/dlpx-dc/.gitignore`**

```
node_modules/
dist/
coverage/
```

- [ ] **Step 7: Write stub `.claude-plugin/plugin.json`**

Placeholder; Task 18 replaces this.
```json
{
  "name": "dlpx-plugin",
  "version": "0.1.0"
}
```

- [ ] **Step 8: Install deps**

```bash
cd mcp-servers/dlpx-dc && npm install
```
Expected: `package-lock.json` created, no errors.

- [ ] **Step 9: Verify tsc + vitest work**

```bash
cd mcp-servers/dlpx-dc && npx tsc --noEmit && npx vitest run
```
Expected: tsc exits 0; vitest reports `No test files found` and exits 0.

- [ ] **Step 10: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add .gitignore .claude-plugin/ mcp-servers/dlpx-dc/package.json \
        mcp-servers/dlpx-dc/package-lock.json mcp-servers/dlpx-dc/tsconfig.json \
        mcp-servers/dlpx-dc/vitest.config.ts mcp-servers/dlpx-dc/.gitignore
git commit -m "chore: scaffold dlpx-dc MCP server package"
```

---

### Task 2: Config loader

**Files:**
- Create: `mcp-servers/dlpx-dc/src/config.ts`
- Create: `mcp-servers/dlpx-dc/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.DLPX_LDAP_USER;
    delete process.env.DLPX_LDAP_PASSWORD;
    delete process.env.DLPX_COMMAND_TIMEOUT_SEC;
    delete process.env.DLPX_SSH_KEEPALIVE_SEC;
    delete process.env.USER;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("uses defaults when env is empty", () => {
    process.env.USER = "alice";
    const cfg = loadConfig();
    expect(cfg.ldapUser).toBe("alice");
    expect(cfg.ldapPassword).toBeUndefined();
    expect(cfg.commandTimeoutSec).toBe(1800);
    expect(cfg.sshKeepaliveSec).toBe(30);
  });

  it("honors env overrides", () => {
    process.env.DLPX_LDAP_USER = "bob";
    process.env.DLPX_LDAP_PASSWORD = "secret";
    process.env.DLPX_COMMAND_TIMEOUT_SEC = "60";
    process.env.DLPX_SSH_KEEPALIVE_SEC = "5";
    const cfg = loadConfig();
    expect(cfg).toEqual({
      ldapUser: "bob",
      ldapPassword: "secret",
      commandTimeoutSec: 60,
      sshKeepaliveSec: 5,
    });
  });

  it("throws when user cannot be resolved", () => {
    expect(() => loadConfig()).toThrow(/ldap user/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/config.test.ts
```
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 3: Implement `src/config.ts`**

```ts
export interface Config {
  ldapUser: string;
  ldapPassword?: string;
  commandTimeoutSec: number;
  sshKeepaliveSec: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return n;
}

export function loadConfig(): Config {
  const ldapUser = process.env.DLPX_LDAP_USER || process.env.USER;
  if (!ldapUser) {
    throw new Error(
      "could not resolve LDAP user: set DLPX_LDAP_USER or USER env var",
    );
  }
  return {
    ldapUser,
    ldapPassword: process.env.DLPX_LDAP_PASSWORD,
    commandTimeoutSec: intEnv("DLPX_COMMAND_TIMEOUT_SEC", 1800),
    sshKeepaliveSec: intEnv("DLPX_SSH_KEEPALIVE_SEC", 30),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/config.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/config.ts mcp-servers/dlpx-dc/tests/config.test.ts
git commit -m "feat(dlpx-dc): add config loader with env-var overrides"
```

---

### Task 3: Targets registry

**Files:**
- Create: `mcp-servers/dlpx-dc/src/targets.ts`
- Create: `mcp-servers/dlpx-dc/tests/targets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/targets.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/targets.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/targets.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/targets.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/targets.ts mcp-servers/dlpx-dc/tests/targets.test.ts
git commit -m "feat(dlpx-dc): add targets registry and support-assertion helper"
```

---

### Task 4: Result formatter

**Files:**
- Create: `mcp-servers/dlpx-dc/src/format.ts`
- Create: `mcp-servers/dlpx-dc/tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/format.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/format.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/format.ts`**

```ts
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

function block(label: string, body: string): string {
  const trimmed = body.replace(/\n+$/, "");
  return `--- ${label} ---\n${trimmed.length ? trimmed : "(empty)"}`;
}

export function formatExecResult(r: ExecResult): string {
  return `exit: ${r.code}\n${block("stdout", r.stdout)}\n${block("stderr", r.stderr)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/format.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/format.ts mcp-servers/dlpx-dc/tests/format.test.ts
git commit -m "feat(dlpx-dc): add shared ExecResult text formatter"
```

---

### Task 5: Mutex utility

**Files:**
- Create: `mcp-servers/dlpx-dc/src/util/mutex.ts`
- Create: `mcp-servers/dlpx-dc/tests/util/mutex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/util/mutex.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/util/mutex.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/util/mutex.ts`**

```ts
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(() => fn());
    this.tail = next.catch(() => undefined);
    return next;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/util/mutex.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/util/mutex.ts mcp-servers/dlpx-dc/tests/util/mutex.test.ts
git commit -m "feat(dlpx-dc): add promise-chain Mutex utility"
```

---

### Task 6: SshExec interface + ssh2-backed implementation

This task introduces the `SshExec` abstraction that the rest of the system depends on. The production implementation wraps `ssh2`; it is not unit-tested (it is exercised only by the manual smoke test). Tests in later tasks use an in-memory `SshExec` stub.

**Files:**
- Create: `mcp-servers/dlpx-dc/src/session/exec.ts`
- Create: `mcp-servers/dlpx-dc/src/session/ssh-session.ts`
- Create: `mcp-servers/dlpx-dc/src/util/shell-quote.ts`
- Create: `mcp-servers/dlpx-dc/tests/util/shell-quote.test.ts`

- [ ] **Step 1: Write the failing test for shell quoting**

Create `tests/util/shell-quote.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/util/shell-quote.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/util/shell-quote.ts`**

```ts
const SAFE = /^[A-Za-z0-9_\-.,:=/@+]+$/;

export function shellQuote(argv: string[]): string {
  return argv
    .map((a) => {
      if (a.length === 0) return "''";
      if (SAFE.test(a)) return a;
      return `'${a.replace(/'/g, `'\\''`)}'`;
    })
    .join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/util/shell-quote.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Write `src/session/exec.ts`**

```ts
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshExec {
  run(argv: string[]): Promise<ExecResult>;
  close(): Promise<void>;
}
```

- [ ] **Step 6: Write `src/session/ssh-session.ts`**

```ts
import { Client, type ClientChannel } from "ssh2";
import { shellQuote } from "../util/shell-quote.js";
import type { ExecResult, SshExec } from "./exec.js";

export interface SshSessionOptions {
  host: string;
  username: string;
  password: string;
  keepaliveIntervalSec: number;
  commandTimeoutSec: number;
}

export class SshSession implements SshExec {
  private client?: Client;

  constructor(private readonly opts: SshSessionOptions) {}

  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    return new Promise((resolve, reject) => {
      const c = new Client();
      c.on("ready", () => {
        this.client = c;
        resolve(c);
      });
      c.on("error", (err) => reject(err));
      c.connect({
        host: this.opts.host,
        username: this.opts.username,
        password: this.opts.password,
        keepaliveInterval: this.opts.keepaliveIntervalSec * 1000,
        readyTimeout: 20_000,
      });
    });
  }

  async run(argv: string[]): Promise<ExecResult> {
    const client = await this.connect();
    const command = shellQuote(argv);
    return new Promise<ExecResult>((resolve, reject) => {
      client.exec(command, (err, stream: ClientChannel) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        let code = 0;
        const timer = setTimeout(() => {
          stream.close();
          reject(
            new Error(
              `command timed out after ${this.opts.commandTimeoutSec}s: ${command}`,
            ),
          );
        }, this.opts.commandTimeoutSec * 1000);
        stream.on("close", (exit: number | null) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: exit ?? code });
        });
        stream.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
        stream.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
        stream.on("exit", (exit: number) => { code = exit; });
      });
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = undefined;
    }
  }
}
```

> **Implementation note (host keys):** The spec calls for TOFU against
> `~/.ssh/known_hosts`. `ssh2`'s default (no `hostVerifier`) accepts any host
> key — functionally no verification. For MVP this is acceptable given the
> three targets are internal VMs on the corporate network; proper TOFU (parse
> `~/.ssh/known_hosts`, match, append-on-first-use) is a planned hardening
> follow-up and is intentionally out of scope for this plan.

- [ ] **Step 7: Type-check the new files**

```bash
cd mcp-servers/dlpx-dc && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/util/shell-quote.ts \
        mcp-servers/dlpx-dc/tests/util/shell-quote.test.ts \
        mcp-servers/dlpx-dc/src/session/exec.ts \
        mcp-servers/dlpx-dc/src/session/ssh-session.ts
git commit -m "feat(dlpx-dc): add SshExec interface and ssh2-backed session"
```

---

### Task 7: Session manager (lazy per-target sessions + mutex)

**Files:**
- Create: `mcp-servers/dlpx-dc/src/session/manager.ts`
- Create: `mcp-servers/dlpx-dc/tests/session/manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/session/manager.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/session/manager.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/session/manager.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/session/manager.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/session/manager.ts \
        mcp-servers/dlpx-dc/tests/session/manager.test.ts
git commit -m "feat(dlpx-dc): add per-target session manager with mutex"
```

---

### Task 8: Elicitation abstraction + credentials loader

The MCP SDK's elicitation API is abstracted behind an `Elicitor` interface so tests don't need a live client. The production implementation (wired in Task 17) calls `server.server.elicitInput`.

**Files:**
- Create: `mcp-servers/dlpx-dc/src/auth/elicit.ts`
- Create: `mcp-servers/dlpx-dc/src/auth/credentials.ts`
- Create: `mcp-servers/dlpx-dc/tests/auth/credentials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/auth/credentials.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { Elicitor } from "../../src/auth/elicit.js";

function makeElicitor(answers: Record<string, string>): Elicitor {
  return {
    promptPassword: vi.fn(async () => answers.password ?? "pw"),
    promptOtp: vi.fn(async () => answers.otp ?? "000000"),
  };
}

describe("CredentialStore", () => {
  it("returns env password without prompting", async () => {
    const elicitor = makeElicitor({});
    const store = new CredentialStore("alice", "envpw", elicitor);
    expect(await store.getPassword()).toBe("envpw");
    expect(elicitor.promptPassword).not.toHaveBeenCalled();
  });

  it("prompts once when env is unset and caches the result", async () => {
    const elicitor = makeElicitor({ password: "prompted" });
    const store = new CredentialStore("alice", undefined, elicitor);
    expect(await store.getPassword()).toBe("prompted");
    expect(await store.getPassword()).toBe("prompted");
    expect(elicitor.promptPassword).toHaveBeenCalledTimes(1);
  });

  it("getOtp delegates to elicitor every call (OTPs are single-use)", async () => {
    const elicitor = makeElicitor({ otp: "123456" });
    const store = new CredentialStore("alice", "pw", elicitor);
    expect(await store.getOtp()).toBe("123456");
    expect(await store.getOtp()).toBe("123456");
    expect(elicitor.promptOtp).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/auth/credentials.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/auth/elicit.ts`**

```ts
export interface Elicitor {
  promptPassword(message: string): Promise<string>;
  promptOtp(message: string): Promise<string>;
}
```

- [ ] **Step 4: Implement `src/auth/credentials.ts`**

```ts
import type { Elicitor } from "./elicit.js";

export class CredentialStore {
  private cachedPassword?: string;

  constructor(
    public readonly user: string,
    envPassword: string | undefined,
    private readonly elicitor: Elicitor,
  ) {
    this.cachedPassword = envPassword;
  }

  async getPassword(): Promise<string> {
    if (this.cachedPassword !== undefined) return this.cachedPassword;
    const pw = await this.elicitor.promptPassword(
      `Enter LDAP password for ${this.user}`,
    );
    this.cachedPassword = pw;
    return pw;
  }

  async getOtp(): Promise<string> {
    return this.elicitor.promptOtp("Enter 6-digit OTP for dlpxdc dc login");
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/auth/credentials.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/auth/elicit.ts \
        mcp-servers/dlpx-dc/src/auth/credentials.ts \
        mcp-servers/dlpx-dc/tests/auth/credentials.test.ts
git commit -m "feat(dlpx-dc): add credential store with env+elicitation fallback"
```

---

### Task 9: dc login flow with expiry detection and retry

**Files:**
- Create: `mcp-servers/dlpx-dc/src/auth/dc-login.ts`
- Create: `mcp-servers/dlpx-dc/tests/auth/dc-login.test.ts`

The "login required" signature is captured in one place. Pattern matches on stderr substring (confirmed during smoke test — adjust the regex there if the real output differs).

- [ ] **Step 1: Write the failing test**

Create `tests/auth/dc-login.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import {
  isLoginRequiredError,
  runWithDcLogin,
} from "../../src/auth/dc-login.js";
import type { ExecResult } from "../../src/session/exec.js";
import { CredentialStore } from "../../src/auth/credentials.js";

function result(partial: Partial<ExecResult>): ExecResult {
  return { stdout: "", stderr: "", code: 0, ...partial };
}

describe("isLoginRequiredError", () => {
  it.each([
    { stderr: "Error: please run 'dc login' to authenticate", code: 1 },
    { stderr: "authentication token expired", code: 2 },
    { stderr: "dc: not logged in", code: 1 },
  ])("detects %j as login-required", (r) => {
    expect(isLoginRequiredError(result(r))).toBe(true);
  });

  it("ignores zero exit even if message matches", () => {
    expect(
      isLoginRequiredError(result({ stderr: "dc: not logged in", code: 0 })),
    ).toBe(false);
  });

  it("ignores other failures", () => {
    expect(
      isLoginRequiredError(result({ stderr: "some other error", code: 1 })),
    ).toBe(false);
  });
});

describe("runWithDcLogin", () => {
  const creds = () =>
    new CredentialStore("alice", "pw", {
      promptPassword: vi.fn(async () => "pw"),
      promptOtp: vi.fn(async () => "123456"),
    });

  it("returns on first-try success without invoking login", async () => {
    const run = vi.fn(async () => result({ code: 0, stdout: "ok" }));
    const out = await runWithDcLogin(run, creds(), ["dc", "list"]);
    expect(out.code).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(["dc", "list"]);
  });

  it("runs dc login and retries once on expiry", async () => {
    const run = vi
      .fn<(a: string[]) => Promise<ExecResult>>()
      .mockResolvedValueOnce(
        result({ code: 1, stderr: "authentication token expired" }),
      )
      .mockResolvedValueOnce(result({ code: 0, stdout: "logged in" }))
      .mockResolvedValueOnce(result({ code: 0, stdout: "ok" }));
    const out = await runWithDcLogin(run, creds(), ["dc", "list"]);
    expect(out.stdout).toBe("ok");
    expect(run).toHaveBeenNthCalledWith(1, ["dc", "list"]);
    expect(run.mock.calls[1][0][0]).toBe("dc");
    expect(run.mock.calls[1][0][1]).toBe("login");
    expect(run).toHaveBeenNthCalledWith(3, ["dc", "list"]);
  });

  it("surfaces error when dc login itself fails", async () => {
    const run = vi
      .fn<(a: string[]) => Promise<ExecResult>>()
      .mockResolvedValueOnce(result({ code: 1, stderr: "dc: not logged in" }))
      .mockResolvedValueOnce(result({ code: 1, stderr: "bad otp" }));
    await expect(
      runWithDcLogin(run, creds(), ["dc", "list"]),
    ).rejects.toThrow(/dc login failed/i);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not loop if retry also reports login-required", async () => {
    const run = vi
      .fn<(a: string[]) => Promise<ExecResult>>()
      .mockResolvedValueOnce(result({ code: 1, stderr: "dc: not logged in" }))
      .mockResolvedValueOnce(result({ code: 0, stdout: "logged in" }))
      .mockResolvedValueOnce(result({ code: 1, stderr: "dc: not logged in" }));
    const out = await runWithDcLogin(run, creds(), ["dc", "list"]);
    expect(out.code).toBe(1);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/auth/dc-login.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/auth/dc-login.ts`**

```ts
import type { ExecResult } from "../session/exec.js";
import type { CredentialStore } from "./credentials.js";

const LOGIN_REQUIRED_PATTERNS = [
  /please run ['"]?dc login['"]?/i,
  /authentication token expired/i,
  /not logged in/i,
  /login required/i,
  /session expired/i,
];

export function isLoginRequiredError(r: ExecResult): boolean {
  if (r.code === 0) return false;
  const haystack = `${r.stderr}\n${r.stdout}`;
  return LOGIN_REQUIRED_PATTERNS.some((p) => p.test(haystack));
}

export type RunFn = (argv: string[]) => Promise<ExecResult>;

export async function runWithDcLogin(
  run: RunFn,
  creds: CredentialStore,
  argv: string[],
): Promise<ExecResult> {
  const first = await run(argv);
  if (!isLoginRequiredError(first)) return first;

  const password = await creds.getPassword();
  const otp = await creds.getOtp();
  const login = await run([
    "dc",
    "login",
    "--user", creds.user,
    "--password", password,
    "--otp", otp,
  ]);
  if (login.code !== 0) {
    throw new Error(
      `dc login failed (exit ${login.code}): ${login.stderr.trim() || login.stdout.trim()}`,
    );
  }
  return run(argv);
}
```

> **Implementation note:** the exact `dc login` argv (flag names, whether the password goes via stdin, whether a PTY is required) is confirmed during the smoke test. If `dc login` rejects password/OTP on argv and needs stdin/PTY instead, update `runWithDcLogin` and the `SshSession.run` signature accordingly — keep the `isLoginRequiredError` contract stable.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/auth/dc-login.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/auth/dc-login.ts \
        mcp-servers/dlpx-dc/tests/auth/dc-login.test.ts
git commit -m "feat(dlpx-dc): detect dc login expiry and auto-retry once"
```

---

### Task 10: Tool runner helper (target-aware dispatch)

Consolidates the logic every tool needs: validate target is in the allowlist, run the argv through the session manager, auto-wrap with `runWithDcLogin` when the target requires it, and format the result.

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/runner.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/runner.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runOnTarget } from "../../src/tools/runner.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function makeStub(responder: (argv: string[]) => Promise<ExecResult>): SshExec {
  return {
    run: vi.fn(responder),
    close: vi.fn(async () => {}),
  };
}

function okResult(stdout: string): ExecResult {
  return { stdout, stderr: "", code: 0 };
}

function ctx(stub: SshExec) {
  const mgr = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { manager: mgr, creds };
}

describe("runOnTarget", () => {
  it("runs argv and returns formatted text for dcol1 (no login wrap)", async () => {
    const stub = makeStub(async () => okResult("hello"));
    const { manager, creds } = ctx(stub);
    const text = await runOnTarget({
      manager,
      creds,
      target: "dcol1",
      argv: ["dc", "list"],
    });
    expect(text).toContain("exit: 0");
    expect(text).toContain("hello");
    expect(stub.run).toHaveBeenCalledWith(["dc", "list"]);
  });

  it("wraps with dc login flow for dlpxdc", async () => {
    const calls: string[][] = [];
    const stub = makeStub(async (argv) => {
      calls.push(argv);
      if (calls.length === 1) {
        return { stdout: "", stderr: "dc: not logged in", code: 1 };
      }
      if (calls.length === 2) return okResult("logged in");
      return okResult("hello");
    });
    const { manager, creds } = ctx(stub);
    const text = await runOnTarget({
      manager,
      creds,
      target: "dlpxdc",
      argv: ["dc", "list"],
    });
    expect(text).toContain("hello");
    expect(calls.length).toBe(3);
    expect(calls[1][1]).toBe("login");
  });

  it("rejects disallowed targets", async () => {
    const stub = makeStub(async () => okResult(""));
    const { manager, creds } = ctx(stub);
    await expect(
      runOnTarget({
        manager,
        creds,
        target: "dcol1",
        argv: ["dc", "unarchive", "x"],
        allowed: ["dlpxdc"],
        operation: "unarchive",
      }),
    ).rejects.toThrow(/unarchive.*dcol1/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/runner.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/runner.ts`**

```ts
import { getTarget, assertTargetSupports, type TargetId } from "../targets.js";
import { SessionManager } from "../session/manager.js";
import { CredentialStore } from "../auth/credentials.js";
import { runWithDcLogin } from "../auth/dc-login.js";
import { formatExecResult } from "../format.js";

export interface RunOnTargetOptions {
  manager: SessionManager;
  creds: CredentialStore;
  target: TargetId;
  argv: string[];
  allowed?: readonly TargetId[];
  operation?: string;
}

export async function runOnTarget(opts: RunOnTargetOptions): Promise<string> {
  if (opts.allowed) {
    assertTargetSupports(
      opts.target,
      opts.allowed,
      opts.operation ?? "operation",
    );
  }
  const target = getTarget(opts.target);
  const run = (argv: string[]) => opts.manager.run(opts.target, argv);
  const result = target.requiresDcLogin
    ? await runWithDcLogin(run, opts.creds, opts.argv)
    : await run(opts.argv);
  return formatExecResult(result);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/runner.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/runner.ts \
        mcp-servers/dlpx-dc/tests/tools/runner.test.ts
git commit -m "feat(dlpx-dc): add runOnTarget helper with target validation"
```

---

### Task 11: Tool registry types and shared zod schema

The remaining tool tasks share a `ToolDef` shape and a `targetSchema` for the zod enum. Extracting them once avoids repetition.

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/types.ts`

- [ ] **Step 1: Write `src/tools/types.ts`**

```ts
import { z } from "zod";
import type { SessionManager } from "../session/manager.js";
import type { CredentialStore } from "../auth/credentials.js";

export interface ToolContext {
  manager: SessionManager;
  creds: CredentialStore;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: any) => Promise<string>;
}

export const targetSchema = z
  .enum(["dlpxdc", "dcol1", "dcol2"])
  .describe(
    "Which VM to run against. dlpxdc = dlpxdc.co (AWS), dcol1 = dcol1.delphix.com, dcol2 = dcol2.delphix.com.",
  );
```

- [ ] **Step 2: Type-check**

```bash
cd mcp-servers/dlpx-dc && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/types.ts
git commit -m "feat(dlpx-dc): add shared ToolDef and targetSchema"
```

---

### Task 12: `dlpx_run` passthrough tool

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/run.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/run.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createRunTool } from "../../src/tools/run.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx(responder: (argv: string[]) => Promise<ExecResult>) {
  const stub: SshExec = { run: vi.fn(responder), close: vi.fn(async () => {}) };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_run tool", () => {
  it("passes args through as a dc invocation", async () => {
    const { stub, manager, creds } = ctx(async () => ({
      stdout: "done", stderr: "", code: 0,
    }));
    const tool = createRunTool({ manager, creds });
    const text = await tool.handler({ target: "dcol1", args: ["list", "-o", "name,ip"] });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-o", "name,ip"]);
    expect(text).toContain("done");
  });

  it("rejects empty args", async () => {
    const { manager, creds } = ctx(async () => ({ stdout: "", stderr: "", code: 0 }));
    const tool = createRunTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", args: [] }),
    ).rejects.toThrow(/at least one/i);
  });

  it("has the expected metadata", () => {
    const { manager, creds } = ctx(async () => ({ stdout: "", stderr: "", code: 0 }));
    const tool = createRunTool({ manager, creds });
    expect(tool.name).toBe("dlpx_run");
    expect(tool.inputSchema).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/run.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/run.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createRunTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    args: z
      .array(z.string())
      .min(1)
      .describe("Argv passed after `dc`. Example: ['list', '-o', 'name,ip']."),
  });
  return {
    name: "dlpx_run",
    description:
      "Run an arbitrary `dc` command on the given VM. Escape hatch for subcommands that don't have a dedicated tool.",
    inputSchema,
    handler: async (raw) => {
      const { target, args } = inputSchema.parse(raw);
      if (args.length === 0) throw new Error("args must contain at least one element");
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        argv: ["dc", ...args],
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/run.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/run.ts \
        mcp-servers/dlpx-dc/tests/tools/run.test.ts
git commit -m "feat(dlpx-dc): add dlpx_run passthrough tool"
```

---

### Task 13: `dlpx_list` tool

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/list.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/list.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/list.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createListTool } from "../../src/tools/list.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_list tool", () => {
  it("runs `dc list` with no filters by default", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol2" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list"]);
  });

  it("appends vm name when provided", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", vm_name: "my-vm" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "my-vm"]);
  });

  it("joins columns with commas for -o", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({ target: "dcol1", columns: ["name", "ip", "owner"] });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "-o", "name,ip,owner"]);
  });

  it("combines vm name and columns", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createListTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      vm_name: "my-vm",
      columns: ["name", "ip"],
    });
    expect(stub.run).toHaveBeenCalledWith(["dc", "list", "my-vm", "-o", "name,ip"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/list.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/list.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createListTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    vm_name: z.string().optional().describe("Filter to a single VM by name."),
    columns: z
      .array(z.string())
      .optional()
      .describe("Columns to include, joined with commas and passed as `-o`."),
  });
  return {
    name: "dlpx_list",
    description: "List VMs currently provisioned on the target (wraps `dc list`).",
    inputSchema,
    handler: async (raw) => {
      const { target, vm_name, columns } = inputSchema.parse(raw);
      const argv = ["dc", "list"];
      if (vm_name) argv.push(vm_name);
      if (columns && columns.length > 0) argv.push("-o", columns.join(","));
      return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/list.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/list.ts \
        mcp-servers/dlpx-dc/tests/tools/list.test.ts
git commit -m "feat(dlpx-dc): add dlpx_list tool"
```

---

### Task 14: `dlpx_clone_latest` tool

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/clone-latest.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/clone-latest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/clone-latest.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createCloneLatestTool } from "../../src/tools/clone-latest.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_clone_latest tool", () => {
  it("runs `dc clone-latest <image> <vm>`", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await tool.handler({
      target: "dcol1",
      image_name: "ubuntu-22",
      vm_name: "my-vm",
    });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "clone-latest", "ubuntu-22", "my-vm",
    ]);
  });

  it("rejects empty image or vm name", async () => {
    const { manager, creds } = ctx();
    const tool = createCloneLatestTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", image_name: "", vm_name: "x" }),
    ).rejects.toThrow();
    await expect(
      tool.handler({ target: "dcol1", image_name: "x", vm_name: "" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/clone-latest.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/clone-latest.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createCloneLatestTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    image_name: z.string().min(1).describe("Image to clone from (e.g. ubuntu-22)."),
    vm_name: z.string().min(1).describe("Name for the new VM."),
  });
  return {
    name: "dlpx_clone_latest",
    description:
      "Provision a new VM from the latest of an image (wraps `dc clone-latest <image> <vm>`). Long-running: may take several minutes.",
    inputSchema,
    handler: async (raw) => {
      const { target, image_name, vm_name } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        argv: ["dc", "clone-latest", image_name, vm_name],
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/clone-latest.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/clone-latest.ts \
        mcp-servers/dlpx-dc/tests/tools/clone-latest.test.ts
git commit -m "feat(dlpx-dc): add dlpx_clone_latest tool"
```

---

### Task 15: `dlpx_expire` tool

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/expire.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/expire.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/expire.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createExpireTool } from "../../src/tools/expire.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_expire tool", () => {
  it("passes days as string and appends each vm name", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createExpireTool({ manager, creds });
    await tool.handler({ target: "dcol1", days: 7, vm_names: ["a", "b"] });
    expect(stub.run).toHaveBeenCalledWith(["dc", "expire", "7", "a", "b"]);
  });

  it("rejects non-positive days and empty vm list", async () => {
    const { manager, creds } = ctx();
    const tool = createExpireTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", days: 0, vm_names: ["a"] }),
    ).rejects.toThrow();
    await expect(
      tool.handler({ target: "dcol1", days: 5, vm_names: [] }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/expire.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/expire.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createExpireTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    days: z
      .number()
      .int()
      .positive()
      .describe("Number of days from now until the VM expires."),
    vm_names: z
      .array(z.string().min(1))
      .min(1)
      .describe("One or more VM names to update."),
  });
  return {
    name: "dlpx_expire",
    description:
      "Set the expiration (in days) for one or more VMs (wraps `dc expire <days> <vm...>`).",
    inputSchema,
    handler: async (raw) => {
      const { target, days, vm_names } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        argv: ["dc", "expire", String(days), ...vm_names],
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/expire.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/expire.ts \
        mcp-servers/dlpx-dc/tests/tools/expire.test.ts
git commit -m "feat(dlpx-dc): add dlpx_expire tool"
```

---

### Task 16: `dlpx_set_unregisters` tool (dcol1/dcol2 only)

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/set-unregisters.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/set-unregisters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/set-unregisters.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createSetUnregistersTool } from "../../src/tools/set-unregisters.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_set_unregisters tool", () => {
  it("builds the argv for dcol1", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createSetUnregistersTool({ manager, creds });
    await tool.handler({ target: "dcol1", days: 3, vm_names: ["a"] });
    expect(stub.run).toHaveBeenCalledWith([
      "dc", "set-unregisters", "3", "a",
    ]);
  });

  it("rejects dlpxdc target", async () => {
    const { manager, creds } = ctx();
    const tool = createSetUnregistersTool({ manager, creds });
    await expect(
      tool.handler({ target: "dlpxdc", days: 3, vm_names: ["a"] }),
    ).rejects.toThrow(/set-unregisters.*dlpxdc/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/set-unregisters.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/set-unregisters.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createSetUnregistersTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    days: z.number().int().positive(),
    vm_names: z.array(z.string().min(1)).min(1),
  });
  return {
    name: "dlpx_set_unregisters",
    description:
      "Schedule unregister/sleep in N days for one or more VMs (wraps `dc set-unregisters <days> <vm...>`). dcol1 and dcol2 only.",
    inputSchema,
    handler: async (raw) => {
      const { target, days, vm_names } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        allowed: ["dcol1", "dcol2"],
        operation: "set-unregisters",
        argv: ["dc", "set-unregisters", String(days), ...vm_names],
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/set-unregisters.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/set-unregisters.ts \
        mcp-servers/dlpx-dc/tests/tools/set-unregisters.test.ts
git commit -m "feat(dlpx-dc): add dlpx_set_unregisters tool (dcol1/dcol2 only)"
```

---

### Task 17: `dlpx_unarchive` tool (dlpxdc only)

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/unarchive.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/unarchive.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/unarchive.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createUnarchiveTool } from "../../src/tools/unarchive.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_unarchive tool", () => {
  it("builds the argv for dlpxdc", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await tool.handler({ target: "dlpxdc", vm_name: "my-vm" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "unarchive", "my-vm"]);
  });

  it("rejects dcol1 and dcol2 targets", async () => {
    const { manager, creds } = ctx();
    const tool = createUnarchiveTool({ manager, creds });
    await expect(
      tool.handler({ target: "dcol1", vm_name: "x" }),
    ).rejects.toThrow(/unarchive.*dcol1/i);
    await expect(
      tool.handler({ target: "dcol2", vm_name: "x" }),
    ).rejects.toThrow(/unarchive.*dcol2/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/unarchive.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/unarchive.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createUnarchiveTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    vm_name: z.string().min(1),
  });
  return {
    name: "dlpx_unarchive",
    description:
      "Unarchive a VM on dlpxdc.co (wraps `dc unarchive <vm>`). dlpxdc only.",
    inputSchema,
    handler: async (raw) => {
      const { target, vm_name } = inputSchema.parse(raw);
      return runOnTarget({
        manager: ctx.manager,
        creds: ctx.creds,
        target,
        allowed: ["dlpxdc"],
        operation: "unarchive",
        argv: ["dc", "unarchive", vm_name],
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/unarchive.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/unarchive.ts \
        mcp-servers/dlpx-dc/tests/tools/unarchive.test.ts
git commit -m "feat(dlpx-dc): add dlpx_unarchive tool (dlpxdc only)"
```

---

### Task 18: `dlpx_help` tool

**Files:**
- Create: `mcp-servers/dlpx-dc/src/tools/help.ts`
- Create: `mcp-servers/dlpx-dc/tests/tools/help.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/help.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createHelpTool } from "../../src/tools/help.js";
import { SessionManager } from "../../src/session/manager.js";
import { CredentialStore } from "../../src/auth/credentials.js";
import type { SshExec, ExecResult } from "../../src/session/exec.js";

function ctx() {
  const stub: SshExec = {
    run: vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "", code: 0 })),
    close: vi.fn(async () => {}),
  };
  const manager = new SessionManager(() => stub);
  const creds = new CredentialStore("alice", "pw", {
    promptPassword: vi.fn(async () => "pw"),
    promptOtp: vi.fn(async () => "123456"),
  });
  return { stub, manager, creds };
}

describe("dlpx_help tool", () => {
  it("runs `dc --help` when subcommand is omitted", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createHelpTool({ manager, creds });
    await tool.handler({ target: "dcol1" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "--help"]);
  });

  it("runs `dc <sub> --help` when subcommand is given", async () => {
    const { stub, manager, creds } = ctx();
    const tool = createHelpTool({ manager, creds });
    await tool.handler({ target: "dcol1", subcommand: "expire" });
    expect(stub.run).toHaveBeenCalledWith(["dc", "expire", "--help"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/help.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/help.ts`**

```ts
import { z } from "zod";
import { runOnTarget } from "./runner.js";
import { type ToolContext, type ToolDef, targetSchema } from "./types.js";

export function createHelpTool(ctx: ToolContext): ToolDef {
  const inputSchema = z.object({
    target: targetSchema,
    subcommand: z
      .string()
      .min(1)
      .optional()
      .describe("If given, shows help for that subcommand; otherwise top-level `dc --help`."),
  });
  return {
    name: "dlpx_help",
    description: "Show help text for `dc` or a specific subcommand.",
    inputSchema,
    handler: async (raw) => {
      const { target, subcommand } = inputSchema.parse(raw);
      const argv = subcommand ? ["dc", subcommand, "--help"] : ["dc", "--help"];
      return runOnTarget({ manager: ctx.manager, creds: ctx.creds, target, argv });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mcp-servers/dlpx-dc && npx vitest run tests/tools/help.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/tools/help.ts \
        mcp-servers/dlpx-dc/tests/tools/help.test.ts
git commit -m "feat(dlpx-dc): add dlpx_help tool"
```

---

### Task 19: MCP server entrypoint (wires everything, adds MCP elicitation)

**Files:**
- Create: `mcp-servers/dlpx-dc/src/index.ts`

This task has no unit test — it's integration glue; the smoke test (Task 21) exercises it end-to-end. It type-checks + boots cleanly.

- [ ] **Step 1: Write `src/index.ts`**

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { getTarget } from "./targets.js";
import { SessionManager } from "./session/manager.js";
import { SshSession } from "./session/ssh-session.js";
import { CredentialStore } from "./auth/credentials.js";
import type { Elicitor } from "./auth/elicit.js";
import type { SshExec, ExecResult } from "./session/exec.js";
import { createRunTool } from "./tools/run.js";
import { createListTool } from "./tools/list.js";
import { createCloneLatestTool } from "./tools/clone-latest.js";
import { createExpireTool } from "./tools/expire.js";
import { createSetUnregistersTool } from "./tools/set-unregisters.js";
import { createUnarchiveTool } from "./tools/unarchive.js";
import { createHelpTool } from "./tools/help.js";
import type { ToolDef } from "./tools/types.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: "dlpx-dc",
    version: "0.1.0",
  });

  const elicitor: Elicitor = {
    async promptPassword(message) {
      const res = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: "object",
          properties: {
            password: { type: "string", title: "LDAP password" },
          },
          required: ["password"],
        },
      });
      if (res.action !== "accept" || !res.content?.password) {
        throw new Error("password elicitation cancelled or empty");
      }
      return String(res.content.password);
    },
    async promptOtp(message) {
      const res = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: "object",
          properties: {
            otp: {
              type: "string",
              title: "6-digit OTP",
              minLength: 6,
              maxLength: 6,
            },
          },
          required: ["otp"],
        },
      });
      if (res.action !== "accept" || !res.content?.otp) {
        throw new Error("OTP elicitation cancelled or empty");
      }
      return String(res.content.otp);
    },
  };

  const creds = new CredentialStore(
    config.ldapUser,
    config.ldapPassword,
    elicitor,
  );

  // Password is resolved the first time a session needs it (via creds), so we
  // wrap SshSession behind a lazy adapter. This lets SessionManager's factory
  // stay synchronous while the actual SSH connect is async.
  class LazySshExec implements SshExec {
    private session?: SshSession;
    constructor(private readonly host: string) {}
    private async ensure(): Promise<SshSession> {
      if (!this.session) {
        this.session = new SshSession({
          host: this.host,
          username: config.ldapUser,
          password: await creds.getPassword(),
          keepaliveIntervalSec: config.sshKeepaliveSec,
          commandTimeoutSec: config.commandTimeoutSec,
        });
      }
      return this.session;
    }
    async run(argv: string[]): Promise<ExecResult> {
      return (await this.ensure()).run(argv);
    }
    async close(): Promise<void> {
      if (this.session) await this.session.close();
      this.session = undefined;
    }
  }

  const manager = new SessionManager(
    (id) => new LazySshExec(getTarget(id).host),
  );

  const toolCtx = { manager, creds };
  const tools: ToolDef[] = [
    createRunTool(toolCtx),
    createListTool(toolCtx),
    createCloneLatestTool(toolCtx),
    createExpireTool(toolCtx),
    createSetUnregistersTool(toolCtx),
    createUnarchiveTool(toolCtx),
    createHelpTool(toolCtx),
  ];

  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema.shape,
      async (args: unknown) => {
        try {
          const text = await tool.handler(args);
          return { content: [{ type: "text", text }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text", text: message }],
          };
        }
      },
    );
  }

  const shutdown = async () => {
    await manager.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
```

> **Implementation note:** If the installed `@modelcontextprotocol/sdk` exposes `server.elicitInput` or `server.requestElicit` directly instead of `server.server.elicitInput`, adjust the two elicitor calls accordingly. The rest of the wiring is unchanged.

- [ ] **Step 2: Build**

```bash
cd mcp-servers/dlpx-dc && npm run build
```
Expected: `dist/index.js` produced, no errors.

- [ ] **Step 3: Verify stdio handshake**

Run the server briefly and check it prints nothing fatal to stderr when given a minimal `initialize` request:
```bash
cd mcp-servers/dlpx-dc && \
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
  | DLPX_LDAP_USER=alice DLPX_LDAP_PASSWORD=x node dist/index.js
```
Expected: a single JSON-RPC response on stdout containing `"serverInfo"` with name `dlpx-dc`. Press Ctrl-C to exit.

- [ ] **Step 4: Run all unit tests**

```bash
cd mcp-servers/dlpx-dc && npm test
```
Expected: all previously-added tests still pass; nothing new to fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/src/index.ts
git commit -m "feat(dlpx-dc): wire MCP server entrypoint with elicitation"
```

---

### Task 20: Finalize `plugin.json` and install script

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Create: `scripts/build-mcp.sh`

- [ ] **Step 1: Replace `.claude-plugin/plugin.json` with the real manifest**

```json
{
  "name": "dlpx-plugin",
  "version": "0.1.0",
  "description": "Delphix infrastructure tooling for Claude Code",
  "author": "Delphix",
  "mcpServers": {
    "dlpx-dc": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-servers/dlpx-dc/dist/index.js"]
    }
  }
}
```

- [ ] **Step 2: Create `scripts/build-mcp.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../mcp-servers/dlpx-dc"
npm install
npm run build
```

Make it executable:
```bash
chmod +x /Users/uzair.inamdar/Documents/dlpx-plugin/scripts/build-mcp.sh
```

- [ ] **Step 3: Run it end-to-end**

```bash
/Users/uzair.inamdar/Documents/dlpx-plugin/scripts/build-mcp.sh
```
Expected: install + build succeed; `mcp-servers/dlpx-dc/dist/index.js` present.

- [ ] **Step 4: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add .claude-plugin/plugin.json scripts/build-mcp.sh
git commit -m "feat: register dlpx-dc MCP in plugin manifest + build script"
```

---

### Task 21: Manual smoke test script

**Files:**
- Create: `mcp-servers/dlpx-dc/scripts/smoke.ts`

This script is run by an engineer with real LDAP credentials against a real VM. It is not part of CI. It verifies:
- SSH connect with password auth.
- `dc list` on dcol1 returns something.
- `dc list` on dlpxdc triggers login elicitation (here, a stdin prompt) on first call.
- OTP retry works when the token expires.

- [ ] **Step 1: Write `mcp-servers/dlpx-dc/scripts/smoke.ts`**

```ts
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../src/config.js";
import { getTarget } from "../src/targets.js";
import { SshSession } from "../src/session/ssh-session.js";
import { SessionManager } from "../src/session/manager.js";
import { CredentialStore } from "../src/auth/credentials.js";
import { runWithDcLogin } from "../src/auth/dc-login.js";

async function main() {
  const cfg = loadConfig();
  const rl = readline.createInterface({ input, output });

  const elicitor = {
    async promptPassword(msg: string) {
      return rl.question(`${msg}: `);
    },
    async promptOtp(msg: string) {
      return rl.question(`${msg}: `);
    },
  };
  const creds = new CredentialStore(cfg.ldapUser, cfg.ldapPassword, elicitor);

  const manager = new SessionManager((id) => {
    const t = getTarget(id);
    return {
      session: undefined as SshSession | undefined,
      async run(argv: string[]) {
        if (!this.session) {
          this.session = new SshSession({
            host: t.host,
            username: cfg.ldapUser,
            password: await creds.getPassword(),
            keepaliveIntervalSec: cfg.sshKeepaliveSec,
            commandTimeoutSec: cfg.commandTimeoutSec,
          });
        }
        return this.session.run(argv);
      },
      async close() {
        await this.session?.close();
      },
    };
  });

  console.log("--- dcol1 dc list ---");
  const r1 = await manager.run("dcol1", ["dc", "list"]);
  console.log(r1);

  console.log("--- dlpxdc dc list (with login retry) ---");
  const r2 = await runWithDcLogin(
    (argv) => manager.run("dlpxdc", argv),
    creds,
    ["dc", "list"],
  );
  console.log(r2);

  await manager.closeAll();
  rl.close();
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add a `scripts` section usage note to the package**

Edit `mcp-servers/dlpx-dc/package.json` — add under `scripts`:
```json
"smoke": "tsx scripts/smoke.ts"
```
Install `tsx` as a dev dependency:
```bash
cd mcp-servers/dlpx-dc && npm install -D tsx
```

- [ ] **Step 3: Run the smoke test manually (engineer action)**

```bash
cd mcp-servers/dlpx-dc
export DLPX_LDAP_USER=<your-ldap-user>
# leave DLPX_LDAP_PASSWORD unset to be prompted
npm run smoke
```
Expected: prompts for password, runs `dc list` on dcol1 successfully, then runs `dc list` on dlpxdc — triggers OTP prompt on first attempt or after expiry, re-runs the command, prints its output. If the "login required" regex doesn't match the real `dc` stderr, adjust `LOGIN_REQUIRED_PATTERNS` in `src/auth/dc-login.ts` and re-run.

- [ ] **Step 4: Run all unit tests one more time**

```bash
cd mcp-servers/dlpx-dc && npm test
```
Expected: green across every test file added in Tasks 2–18.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzair.inamdar/Documents/dlpx-plugin
git add mcp-servers/dlpx-dc/scripts/smoke.ts mcp-servers/dlpx-dc/package.json \
        mcp-servers/dlpx-dc/package-lock.json
git commit -m "chore(dlpx-dc): add manual smoke-test script"
```

---

## Verification checklist (run after Task 21)

- [ ] `npm test` in `mcp-servers/dlpx-dc` is green.
- [ ] `npm run build` in `mcp-servers/dlpx-dc` produces `dist/index.js`.
- [ ] `scripts/build-mcp.sh` runs clean from repo root.
- [ ] Manual smoke (Task 21 Step 3) exercises all three VMs at least once.
- [ ] `git log --oneline` shows one commit per task (roughly 21 commits).
