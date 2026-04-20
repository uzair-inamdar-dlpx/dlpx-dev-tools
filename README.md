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
| [`dlpx-dc-mcp`](./plugins/dlpx-dc-mcp) | local | MCP server that drives the Delphix `dc` CLI over SSH on `dlpxdc.co`, `dcol1.delphix.com`, `dcol2.delphix.com` |
| `atlassian` | [atlassian/atlassian-mcp-server](https://github.com/atlassian/atlassian-mcp-server) | Jira + Confluence MCP (required by the `dlpx` skills) |
| `superpowers` | [obra/superpowers](https://github.com/obra/superpowers) | Brainstorming, TDD, debugging, and skill-authoring skills |

## Installing

Add the marketplace to Claude Code, then install the plugins you want:

```
/plugin marketplace add uzair-inamdar-dlpx/dlpx-dev-tools
/plugin install dlpx
/plugin install dlpx-dc-mcp
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

### `dlpx-dc-mcp` — `dc` CLI over SSH

An MCP server (Node 20+, TypeScript, stdio transport) that exposes the Delphix `dc` CLI as tools:
`dlpx_run`, `dlpx_list`, `dlpx_clone_latest`, `dlpx_expire`, `dlpx_set_unregisters`,
`dlpx_unarchive`, `dlpx_groups`, `dlpx_help`. Handles LDAP + OTP login via MCP elicitation and keeps
an SSH session pooled per target host.

Build before first use (the plugin manifest points at `dist/index.js`):

```
./plugins/dlpx-dc-mcp/scripts/build-mcp.sh
```

Or manually:

```
cd plugins/dlpx-dc-mcp/mcp-servers/dlpx-dc
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
  dlpx-dc-mcp/                    # MCP server plugin
    .claude-plugin/plugin.json
    mcp-servers/dlpx-dc/          # TypeScript MCP server source
    scripts/build-mcp.sh
docs/                             # plans, design notes
```
