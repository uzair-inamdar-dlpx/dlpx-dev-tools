# dlpx-dc MCP Server — Design

**Status:** approved design, ready for implementation plan
**Date:** 2026-04-17
**Owner:** uzair.inamdar@perforce.com

## Purpose

Give engineers an MCP server that drives Delphix's internal `dc` tool on three
VMs — `dlpxdc.co` (AWS), `dcol1.delphix.com`, `dcol2.delphix.com` — so they can
provision, list, and manage infrastructure namespaces from Claude Code instead
of SSHing in by hand. The server ships as `dlpx-dc-mcp`, the first plugin in
the `dlpx-dev-tools` Claude Code marketplace; future Delphix plugins (skills,
additional MCP servers) will land as sibling plugins in the same marketplace.

## Scope

In scope:

- Per-engineer, local-only MCP server (stdio transport).
- Wrappers around the most common `dc` subcommands plus a generic passthrough.
- Persistent SSH session per VM, reused across tool calls.
- LDAP password via env var with interactive-prompt fallback.
- On-demand OTP prompt for `dc login` against the AWS VM, with automatic retry
  on expired-login errors.

Out of scope:

- Multi-user / shared deployment.
- Storing the TOTP seed or any form of non-interactive OTP.
- Parsing `dc` output into structured shapes. All tools return raw text.
- Async / streaming tool results. All tools block until completion.
- Extra destructive-op gating beyond the MCP client's tool-approval prompt.

## Architecture

### Marketplace and plugin layout

```
dlpx-plugin/                               # repo root = marketplace root
├── .claude-plugin/
│   └── marketplace.json                   # marketplace catalog
├── plugins/
│   └── dlpx-dc-mcp/                       # the MCP-carrying plugin
│       ├── .claude-plugin/
│       │   └── plugin.json                # registers the MCP server
│       ├── scripts/
│       │   └── build-mcp.sh               # npm install + build
│       └── mcp-servers/
│           └── dlpx-dc/
│               ├── package.json
│               ├── tsconfig.json
│               ├── src/
│               │   ├── index.ts            # MCP server entrypoint (stdio)
│               │   ├── config.ts           # env-var loading + defaults
│               │   ├── targets.ts          # VM registry + per-target flags
│               │   ├── session/
│               │   │   ├── manager.ts      # per-VM session map + mutex
│               │   │   └── ssh-session.ts  # single SSH connection + exec wrapper
│               │   ├── auth/
│               │   │   ├── credentials.ts  # env-var → prompt fallback
│               │   │   └── dc-login.ts     # AWS login flow + expiry detection
│               │   └── tools/
│               │       ├── clone-latest.ts
│               │       ├── list.ts
│               │       ├── expire.ts
│               │       ├── set-unregisters.ts
│               │       ├── unarchive.ts
│               │       ├── help.ts
│               │       └── run.ts          # generic passthrough
│               └── tests/
└── docs/                                   # design + planning docs
```

The plugin name (`dlpx-dc-mcp`) is what users install; the MCP server instance
name (`dlpx-dc`, the key under `mcpServers` in `plugin.json`) is the functional
identifier Claude Code exposes at runtime, matching the `mcp-servers/dlpx-dc/`
source directory.

### Runtime

- Node ≥ 20, TypeScript.
- `@modelcontextprotocol/sdk` for the MCP wire protocol.
- `ssh2` for SSH connections (supports password auth directly; no `sshpass`).
- Transport: stdio. Claude Code launches the server as a subprocess.

### Process model

Single process, single engineer. The server holds up to three live SSH
sessions (one per target), created lazily on first use. No per-caller auth —
the process itself is the trust boundary.

## Tool surface

| Tool | Wraps | Arguments |
|---|---|---|
| `dlpx_clone_latest` | `dc clone-latest <image> <vm>` | `target`, `image_name`, `vm_name` |
| `dlpx_list` | `dc list [<vm>] [-o cols]` | `target`, `vm_name?`, `columns?: string[]` |
| `dlpx_expire` | `dc expire <days> <vm...>` | `target`, `days: integer`, `vm_names: string[]` |
| `dlpx_set_unregisters` | `dc set-unregisters <days> <vm...>` | `target` (dcol1/dcol2 only), `days: integer`, `vm_names: string[]` |
| `dlpx_unarchive` | `dc unarchive <vm>` | `target` (dlpxdc only), `vm_name` |
| `dlpx_help` | `dc [<subcmd>] --help` | `target`, `subcommand?` |
| `dlpx_run` | arbitrary `dc ...` passthrough | `target`, `args: string[]` |

`target` is `"dlpxdc" | "dcol1" | "dcol2"`. Every tool requires it explicitly —
no default. Target-validation (`set-unregisters` rejects `dlpxdc`,
`unarchive` rejects `dcol1`/`dcol2`) happens in the tool handler before SSH
runs.

`dlpx_list` joins the `columns` array with commas and passes it as `-o <joined>`.

### Return shape

Each tool returns a single text content block composed of:

```
exit: <code>
--- stdout ---
<stdout or empty>
--- stderr ---
<stderr or empty>
```

No parsing, no structured fields. The model reads it the way an engineer reads
a terminal.

## SSH session & auth

### Targets registry

```ts
const TARGETS = {
  dlpxdc: { host: "dlpxdc.co",          requiresDcLogin: true  },
  dcol1:  { host: "dcol1.delphix.com",  requiresDcLogin: false },
  dcol2:  { host: "dcol2.delphix.com",  requiresDcLogin: false },
};
```

### Session manager

- `Map<TargetId, SshSession | null>` held in-process for the MCP's lifetime.
- Each `SshSession` wraps one `ssh2.Client`, tracks whether `dc login` has run
  recently (AWS only), and has a `Mutex` so tool calls against the same VM
  serialize. Different targets run in parallel.
- Host-key verification uses `~/.ssh/known_hosts` with trust-on-first-use —
  the same behavior as the OpenSSH default.
- Keepalives every `DLPX_SSH_KEEPALIVE_SEC` (default 30s).
- On unexpected disconnect, the next tool call transparently reconnects.

### Credentials

Loaded on demand (first SSH connect or first OTP prompt):

1. `DLPX_LDAP_USER` env var, falling back to `$USER` / `os.userInfo().username`.
2. `DLPX_LDAP_PASSWORD` env var, falling back to a one-shot interactive prompt
   via MCP elicitation. The value is held in memory for the process lifetime
   and never written to disk, logs, or error messages.

### `dc login` flow (dlpxdc only)

Every `dc` invocation on `dlpxdc` is wrapped:

1. Run `dc <subcommand> ...`.
2. If stdout / stderr / exit-code matches a known "login required or expired"
   signature, trigger the login flow:
   - Prompt the engineer for a fresh 6-digit OTP via MCP elicitation.
   - Run `dc login`, piping in the LDAP password and the OTP.
   - Retry the original command **once**.
3. Return the final result. If the retry still reports login-required, surface
   the error — do not loop.

The exact "login-required" signature (stderr substring / exit code) is
confirmed during implementation by running `dc` with an expired session. It
lives in one constant in `dc-login.ts`.

### Command execution

- Each `dc` invocation is a separate `exec` channel — no interactive shell, no
  PTY unless `dc login` requires one for OTP entry (investigate and handle in
  `dc-login.ts`).
- Args are passed as a single argv-quoted string so shell metacharacters in VM
  names or image names can't inject.
- `stdout`, `stderr`, and exit code are captured and returned.
- Each tool blocks until completion or `DLPX_COMMAND_TIMEOUT_SEC` (default
  1800s = 30 min), whichever comes first.

## Configuration

All configuration is via env vars read at startup:

| Var | Default | Purpose |
|---|---|---|
| `DLPX_LDAP_USER` | `$USER` | LDAP username used for SSH and `dc login` |
| `DLPX_LDAP_PASSWORD` | *(prompt)* | LDAP password; prompted via elicitation if unset |
| `DLPX_COMMAND_TIMEOUT_SEC` | `1800` | Per-tool `dc` timeout |
| `DLPX_SSH_KEEPALIVE_SEC` | `30` | SSH keepalive interval |

No config file. The three VM hostnames are hardcoded in `targets.ts` — editing
that file is the supported way to add/remove targets.

## Error handling

- Tool handlers return text containing exit code + stderr for non-zero `dc`
  exits — the model reads the output and decides what to do.
- Hard errors surface as MCP tool errors so Claude Code shows them
  prominently:
  - SSH auth failure (bad password).
  - Host unreachable / connection timeout.
  - Command timeout (`DLPX_COMMAND_TIMEOUT_SEC` exceeded).
  - Repeated login failure (retry loop exhausted).
  - Target-validation errors (`unarchive` on a non-AWS VM, etc.).
- The password must never appear in logs, error messages, or tool results.
  `credentials.ts` is the only module that touches it directly.

## Testing

- **Unit tests** (Vitest), covering:
  - `SessionManager` lazy-init and per-target mutex.
  - `dc login` retry logic against a mocked SSH exec — success on first try,
    success after retry, failure after retry.
  - Credential loader order (env → prompt fallback).
  - Target-validation rules for each tool.
  - Tool-arg → argv quoting (shell-metachar safety).
- **Manual integration smoke test**: a single script (`scripts/smoke.ts`) an
  engineer runs against real VMs to verify end-to-end. Not part of CI — it
  needs real LDAP creds and OTPs.
- No attempt to mock the full SSH protocol. `ssh2` is trusted.

## Packaging & distribution

The repo is a Claude Code **marketplace** (`dlpx-dev-tools`) that currently
ships one plugin, `dlpx-dc-mcp`. Users install it with:

```
/plugin marketplace add <git-url-or-local-path>
/plugin install dlpx-dc-mcp@dlpx-dev-tools
```

`.claude-plugin/marketplace.json` at the repo root catalogs the plugin via a
relative path:

```json
{
  "name": "dlpx-dev-tools",
  "owner": { "name": "Delphix" },
  "plugins": [
    {
      "name": "dlpx-dc-mcp",
      "source": "./plugins/dlpx-dc-mcp",
      "description": "MCP server that drives the Delphix `dc` CLI over SSH"
    }
  ]
}
```

`plugins/dlpx-dc-mcp/.claude-plugin/plugin.json` registers the MCP under
`mcpServers`:

```json
{
  "name": "dlpx-dc-mcp",
  "mcpServers": {
    "dlpx-dc": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-servers/dlpx-dc/dist/index.js"]
    }
  }
}
```

`plugins/dlpx-dc-mcp/mcp-servers/dlpx-dc` is a standalone Node package with its
own `package.json`. `npm install && npm run build` inside it produces
`dist/index.js`. `plugins/dlpx-dc-mcp/scripts/build-mcp.sh` wraps that so
engineers don't have to know about the build step.

## Open items resolved at implementation time

These are small enough to confirm during the plan / code, not the design:

- Exact "login required / expired" signature from `dc` on dlpxdc.
- Whether `dc login` needs a PTY to accept the OTP, or whether stdin piping
  works.
- Default columns for `dlpx_list` if the engineer omits `columns`.
