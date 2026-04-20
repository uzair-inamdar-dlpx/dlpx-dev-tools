---
name: issue-commit
description: Commit staged changes for a Jira issue in Delphix style, syncing with remote first. Use this skill whenever the user wants to commit work tied to a Jira ticket — e.g. "commit for DLPX-1234", "make a commit for this ticket", "commit my changes for the issue", or "ready to commit". Requires the Atlassian MCP.
argument-hint: <jira-issue-id> [<jira-issue-id>...]
---

### Step 0: Verify the Atlassian MCP is available

This skill hard-requires an Atlassian MCP because it fetches Jira issue summaries directly. Before doing anything else, confirm that Jira tools are reachable.

Check for either of the known tool-prefix paths:

- `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` and `mcp__plugin_atlassian_atlassian__getJiraIssue` (marketplace `atlassian` plugin)
- `mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources` and `mcp__claude_ai_Atlassian_Rovo__getJiraIssue` (claude.ai Atlassian Rovo integration)

If neither pair is present, stop and tell the user:

> The Atlassian MCP is required for the `issue-commit` skill. Install the `atlassian` plugin from this marketplace (`/plugin install atlassian`) or enable the Atlassian Rovo integration in Claude.ai, then rerun.

Make no git or Jira calls until the check passes. In the rest of this skill, use whichever prefix is actually present.

### Step 1: Fetch the Jira issue title

Call `getAccessibleAtlassianResources` (no arguments needed) and use the `id` field from the first result as `cloudId`.

Then call `getJiraIssue` for **each** provided issue ID using that `cloudId`. Extract the `summary` field from each — these become the commit title(s).

If any issue is not found or any MCP call fails, stop and report the error. Do not proceed with the commit.

### Step 2: Determine branch state relative to its remote tracking branch

Check whether local is ahead, behind, or in sync with the remote:

```bash
git log origin/<branch>..HEAD --oneline   # commits local has that remote doesn't
git log HEAD..origin/<branch> --oneline   # commits remote has that local doesn't
```

### Step 3: Sync with remote if needed

Based on the results from Step 2, determine which scenario applies:

**Local is only ahead of remote** — no sync needed. Proceed to Step 4.

**Local is behind remote, or local and remote have diverged** (both have commits the other doesn't) — stash any uncommitted changes, rebase, then restore:

```bash
git stash
git pull --rebase origin <branch-name>
git stash pop
```

The rebase places local commits on top of the remote commits. In most cases this resolves cleanly.

**If the rebase hits a conflict:** stop and present the user with a plan describing which files conflict and how you intend to resolve each one. Do not auto-resolve without the user's approval. General guidance:

- Prefer the remote (incoming) version for dependency files like `package.json` or `yarn.lock` unless the conflict is in logic you authored.
- For source files, explain both sides to the user and propose a resolution.
- Once the user approves, resolve the conflicts, `git add` the resolved files, and run `git rebase --continue`.

**If `git stash pop` hits a conflict:** follow the same approach — present the conflicts and proposed resolution to the user before proceeding.

### Step 4: Stage and commit with the correct message format

Show the user a summary of what will be staged (`git status --short`) and stage the relevant files. When in doubt, ask the user which files to include rather than staging everything blindly.

Determine the commit message format using the following decision tree. "Matches a provided issue ID" means the commit subject begins with a token matching the generic issue-ID regex `[A-Z][A-Z0-9]+-\d+` that equals one of the IDs passed to the skill.

1. **No commits ahead of remote** — this is the first/initial commit.
   Use the format: `<Jira issue ID> <Jira issue summary>`
   e.g. `DLPX-17183 Add foundational AI context, skills, agents, etc. to dlpx-plugin repository`
   This format matters because the org squashes all PR commits on merge — the first commit becomes the permanent `git log` entry, and Delphix style is what we want landing there.

   **Multiple issues:** When multiple issue IDs are provided, use a separate `-m` for each issue. Each `-m` becomes its own paragraph in the commit message; the first one is the subject line, so ordering matters:

   ```bash
   git commit -m "DLPX-111 First issue summary" -m "DLPX-222 Second issue summary"
   ```

2. **Commits ahead of remote, and at least one commit message starts with any of the provided issue IDs** — this is a follow-on commit for the same issue(s).
   Use a short, descriptive message that summarizes the diff. Do **not** repeat the `<issue ID> <summary>` format.

3. **Commits ahead of remote, but no commit message contains any of the provided issue IDs** — the issue IDs don't match any existing work on this branch.
   Stop and ask the user what they want to do. Do not assume.

### Step 5: Publish for review

Ask the user if they'd like to publish the PR for review using the `dlpx:publish-review` skill. If yes, hand off to it — `publish-review` takes it from here (rebase-sync, PR description, `git review`). If no, stop cleanly; the commit is complete either way.
