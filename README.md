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
- An SSH key loaded in `ssh-agent` or configured for those hosts in `~/.ssh/config` — `dlpx-dc` does not use password SSH.
- Node.js 20+ is **only** needed if you want to rebuild the MCP server from source; the repo ships a prebuilt `dist/`, so the default install has no Node requirement.

### Add the marketplace and install plugins

```
/plugin marketplace add uzair-inamdar-dlpx/dlpx-dev-tools
/plugin install dlpx
/plugin install dlpx-dc
/plugin install atlassian        # required by the dlpx skills
/plugin install superpowers      # optional
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

The `target` parameter on every tool selects the host: `dlpxdc` (`dlpxdc.co`), `dcol1`
(`dcol1.delphix.com`), or `dcol2` (`dcol2.delphix.com`).

#### Authentication

- **SSH**: key-based only. Make sure the key you use for these hosts is loaded in `ssh-agent` or
  configured in `~/.ssh/config` — there is no password-SSH fallback.
- **LDAP username**: defaults to `$USER`. Override with `DLPX_LDAP_USER` if your LDAP login differs
  from your local username.
- **LDAP password**: on the first tool call that needs it, the server prompts you via MCP
  elicitation (Claude Code pops up a password input). It caches the password in memory for the
  server process's lifetime, so you'll only type it once per session. To skip the prompt entirely,
  pre-seed `DLPX_LDAP_PASSWORD` in the plugin's environment.
- **OTP**: prompted freshly every time `dc login` runs — never cached. Only `dlpxdc.co` requires
  `dc login` (triggered on auth failure and retried once); `dcol1` and `dcol2` commands skip it.
- **Timeouts / keepalive**: `DLPX_COMMAND_TIMEOUT_SEC` (default `1800`) — raise for long clones.
  `DLPX_SSH_KEEPALIVE_SEC` (default `30`).

#### Building from source

The repo checks in a prebuilt `dist/`, so you only need to build if you're modifying the server.

```
./plugins/dlpx-dc/scripts/build-mcp.sh
```

Or manually:

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
plugins/
  dlpx/                           # skills plugin
    .claude-plugin/plugin.json
    skills/{issue-commit,publish-review,triage-bug}/SKILL.md
  dlpx-dc/                        # MCP server plugin
    .claude-plugin/plugin.json
    mcp-servers/dlpx-dc/          # TypeScript MCP server source
    scripts/build-mcp.sh
```
