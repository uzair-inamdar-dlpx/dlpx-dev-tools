# dlpx-plugin

A [Claude Code](https://claude.com/claude-code) plugin marketplace for Delphix developers. Packages
dev-workflow skills and an MCP server that drives the internal `dc` CLI, plus a couple of upstream
plugins that the Delphix workflow leans on.

> Personal side project — not an official Delphix repository. Built independently so other Delphix
> devs can install it from a single marketplace entry.

## What's inside

The marketplace (`dlpx-dev-tools`) is declared in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
and exposes four plugins:

| Plugin | Source | Purpose |
| --- | --- | --- |
| [`dlpx`](./plugins/dlpx) | local | Delphix dev-workflow skills: `issue-commit`, `publish-review`, `triage-bug` |
| [`dlpx-dc`](./plugins/dlpx-dc) | local | MCP server that drives the Delphix `dc` CLI over SSH on `dlpxdc.co`, `dcol1.delphix.com`, `dcol2.delphix.com` |
| `atlassian` | [atlassian/atlassian-mcp-server](https://github.com/atlassian/atlassian-mcp-server) | Jira + Confluence MCP (required by the `dlpx` skills) |
| `superpowers` | [obra/superpowers](https://github.com/obra/superpowers) | Brainstorming, TDD, debugging, and skill-authoring skills |

## Installing

### Prerequisites

- A Delphix LDAP account.
- SSH access to `dlpxdc.co`, `dcol1.delphix.com`, and/or `dcol2.delphix.com` (VPN if your network requires it).
- An SSH key loaded in `ssh-agent` for those hosts is recommended — `dlpx-dc` will use it silently. Without an agent, it falls back to asking for your LDAP password.
- Node.js 20+ — required to build the `dlpx-dc` MCP server.

### Clone and build

The `dlpx-dc` MCP server ships as TypeScript source and is compiled locally;
dependencies (`@modelcontextprotocol/sdk`, `ssh2`, `zod`) are installed into
`node_modules/` next to the compiled output, so there's no prebuilt standalone
artifact. Clone the repo and run the build script once:

```
git clone https://github.com/uzair-inamdar/dlpx-plugin.git
cd dlpx-plugin
./build.sh
```

Re-run `./build.sh` after pulling changes.

### Register the marketplace and install plugins

In Claude Code, add the marketplace from your local checkout, then install:

```
/plugin marketplace add /absolute/path/to/dlpx-plugin
/plugin install dlpx@dlpx-dev-tools
/plugin install dlpx-dc@dlpx-dev-tools
/plugin install atlassian@dlpx-dev-tools     # required by the dlpx skills
/plugin install superpowers@dlpx-dev-tools   # optional
```

The `dlpx` skills hard-require an Atlassian MCP — either the marketplace `atlassian` plugin or the
claude.ai Atlassian Rovo integration.

## Plugins

### `dlpx` — dev-workflow skills

Three skills, each triggered by natural-language requests in chat:

- **`issue-commit`** — commit staged changes for one or more Jira issues in Delphix style (`<JIRA-ID> <summary>`), syncing with the remote branch first.
- **`publish-review`** — publish the current branch as a PR using the Delphix `git review` wrapper, with the PR description auto-composed to match the Delphix template (Problem/Solution for bugs, Feature/Implementation details otherwise).
- **`triage-bug`** — investigate a Jira bug and produce a structured triage report. Investigation only; no code changes, branches, or commits.

### `dlpx-dc` — `dc` CLI over SSH

A TypeScript MCP server (stdio transport) that wraps the Delphix `dc` CLI. It keeps one SSH session
pooled per target host, serializes commands through a mutex, and handles LDAP + OTP login via MCP
elicitation.

#### Tools

| Tool | Targets | Notes |
| --- | --- | --- |
| `dlpx_run` | all | arbitrary `dc` subcommand |
| `dlpx_list` | all | list VMs, with filtering/sorting |
| `dlpx_clone_latest` | all | clone from a group's latest snapshot |
| `dlpx_expire` | all | set VM expiration days |
| `dlpx_groups` | all | manage VM groups |
| `dlpx_help` | all | `dc` help passthrough |
| `dlpx_set_unregisters` | `dcol1`, `dcol2` | extend un-register window |
| `dlpx_unarchive` | `dlpxdc` | unarchive from AWS |
| `dlpx_register` | `dcol1`, `dcol2` | register a VM to an ESX host and power it on |
| `dlpx_set_auth` | — | change the SSH auth mode (`auto`/`agent`/`password`) at runtime; resets live sessions |

The `target` parameter on every tool selects the host: `dlpxdc` (`dlpxdc.co`), `dcol1`
(`dcol1.delphix.com`), or `dcol2` (`dcol2.delphix.com`).

#### Authentication

- **SSH**: agent-first by default. If `SSH_AUTH_SOCK` points at an agent with a key authorized on
  the target host, `dlpx-dc` uses publickey auth via the agent. If that's unavailable or the server
  rejects the agent's keys, it falls back to LDAP password auth (see below). Your key material
  never leaves the agent.
- **`DLPX_SSH_AUTH`**: pins the SSH auth mode at plugin launch. Values:
  - `auto` (default) — agent first, LDAP password fallback.
  - `agent` — agent only. Fails fast if the agent can't auth (no password prompt). Useful when you
    want to catch a misconfigured agent early instead of sliding into a surprise password prompt.
  - `password` — LDAP password only; skip the agent entirely. Useful when debugging or when your
    agent is offering the wrong key.
  The mode is also mutable at runtime via the `dlpx_set_auth` tool (calling it closes live SSH
  sessions so the next command reconnects with the new mode). Restart reverts to `DLPX_SSH_AUTH`.
- **LDAP username**: defaults to `$USER`. Override with `DLPX_LDAP_USER` if your LDAP login differs
  from your local username.
- **LDAP password**: needed for `dc login` on `dlpxdc.co`, and also used for SSH in `auto` or
  `password` mode. The server prompts via MCP elicitation (Claude Code pops up a password input)
  the first time it's needed, and caches it in memory for the server process's lifetime. Pre-seed
  `DLPX_LDAP_PASSWORD` in the plugin's environment to skip the prompt.
- **OTP**: prompted freshly every time `dc login` runs — never cached. Only `dlpxdc.co` requires
  `dc login` (triggered on auth failure and retried once); `dcol1` and `dcol2` commands skip it.
- **Timeouts / keepalive**: `DLPX_COMMAND_TIMEOUT_SEC` (default `1800`) — raise for long clones.
  `DLPX_SSH_KEEPALIVE_SEC` (default `30`).

#### Building from source

`./build.sh` at the repo root runs `npm install && npm run build` for the
server and is the only step required for normal installs. When hacking on the
server you can work in the package directly:

```
cd plugins/dlpx-dc/mcp-servers/dlpx-dc
npm install
npm run build
npm test          # vitest
npm run smoke     # manual end-to-end smoke test against a real host
```

## Repo layout

```
.claude-plugin/marketplace.json   # marketplace manifest
build.sh                          # one-shot: installs deps + compiles MCP server
plugins/
  dlpx/                           # skills plugin
    .claude-plugin/plugin.json
    skills/{issue-commit,publish-review,triage-bug}/SKILL.md
  dlpx-dc/                        # MCP server plugin
    .claude-plugin/plugin.json
    mcp-servers/dlpx-dc/          # TypeScript MCP server source
```
