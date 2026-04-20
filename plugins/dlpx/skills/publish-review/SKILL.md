---
name: publish-review
description: Publish the current branch as a PR for code review using the Delphix `git review` wrapper, with an auto-composed PR description. Use this skill whenever the user wants to publish their changes for review, open a PR, submit for code review, or run `git review` — even if they phrase it as "publish", "submit", "push for review", "ready for review", or "create a PR". Composes a PR description that matches the Delphix template and passes it via `--description`, so no editor opens. Requires the Atlassian MCP (to read Jira ticket types) and `git review` on PATH.
---

### Step 0: Verify prerequisites

Two checks, both before any git or Jira call.

**1. `git review` must be on PATH.** Run:

```bash
git review -h
```

If the command isn't found (non-zero exit or "unknown command" output), stop and tell the user:

> Publishing requires the Delphix `git review`. Install git-utils before continuing.

**2. The Atlassian MCP must be available.** The PR description template's section headers depend on Jira ticket type, so the skill reads `fields.issuetype.name` for each issue referenced on the branch. Check for either of:

- `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` and `mcp__plugin_atlassian_atlassian__getJiraIssue` (marketplace `atlassian` plugin)
- `mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources` and `mcp__claude_ai_Atlassian_Rovo__getJiraIssue` (claude.ai Atlassian Rovo integration)

If neither pair is present, stop and tell the user:

> The Atlassian MCP is required to compose the PR description (the template needs each ticket's type). Install the `atlassian` plugin from this marketplace (`/plugin install atlassian`) or enable the Atlassian Rovo integration in Claude.ai, then rerun.

Failing loudly up front is better than producing half a PR and dying midway. In the rest of this skill, use whichever Atlassian prefix is actually present.

### Step 1: Check the first commit message format

The org squashes all commits on merge, so the first commit on the branch becomes the permanent `git log` entry. It must follow Delphix style:

```
<Jira issue ID> <Jira issue summary>
```

e.g. `DLPX-17183 Add foundational AI context, skills, agents, etc. to dlpx-plugin repository`

Inspect the first commit:

```bash
git log origin/main..HEAD --oneline
```

Match its subject against the regex `^[A-Z][A-Z0-9]+-\d+ .+` (generalized so DLPX-, ENG-, etc. all match).

**If it matches**, proceed. **If it doesn't**, warn the user and ask how they want to proceed. Present three options:

1. Amend the first commit manually (`git commit --amend`) with a Delphix-style subject, then continue.
2. Rerun `dlpx:issue-commit` with a Jira ID to produce a correctly-formatted first commit.
3. Publish anyway, acknowledging that squash-on-merge will land the malformed subject in the permanent `git log`.

Do not auto-amend. Do not proceed silently.

### Step 2: Sync with remote

Check whether local is ahead, behind, or in sync:

```bash
git fetch origin <branch-name> # update origin/<branch-name> without merging
git log origin/<branch>..HEAD --oneline   # commits local has that remote doesn't
git log HEAD..origin/<branch> --oneline   # commits remote has that local doesn't
```

**Local is only ahead of remote** — no sync needed. Proceed to Step 3.

**Local is behind or diverged** — stash any uncommitted changes, rebase, then restore:

```bash
git stash
git pull --rebase origin <branch-name>
git stash pop
```

**If the rebase hits a conflict:** stop and present the user with a plan describing which files conflict and how you intend to resolve each one. Do not auto-resolve without the user's approval. Prefer the remote (incoming) version for dependency files like `package.json` or `yarn.lock` unless the conflict is in logic you authored. For source files, explain both sides to the user and propose a resolution. Once approved, resolve, `git add` the resolved files, and run `git rebase --continue`.

**If `git stash pop` hits a conflict:** follow the same approach — present the plan before proceeding.

### Step 3: Compose the PR description

Follow the Delphix PR description template. The section headers depend on Jira ticket type.

**Gather ticket type(s).** Parse Jira IDs out of commit subjects on the branch:

```bash
git log origin/main..HEAD --format="%s"
```

For each unique ID matching `[A-Z][A-Z0-9]+-\d+`, call `getAccessibleAtlassianResources` (to get the `cloudId`), then `getJiraIssue` with that ID. Read `fields.issuetype.name`.

**Pick the template variant.**

If the ticket type is `Bug`:

```markdown
## Problem
<what was broken and why — from commit bodies and, if needed, the Jira issue description>

## Solution
<what this change does to fix it — summarized from commits + diff>

## Testing

```

If the ticket type is anything else (Story, Task, Epic, Improvement, …):

```markdown
## Feature
<what new capability this adds>

## Implementation details
<how the change works, summarized from commits + diff>

## Testing

```

**Mixed ticket types in one PR.** If the commits reference both bug and non-bug tickets, default to the non-bug headers (`## Feature` / `## Implementation details`) and mention both ticket IDs in the section body. Ask the user to confirm if this feels wrong.

**Rules.**

- **Leave `## Testing` empty.** The header stays; the body is blank. The author fills it in manually. Do not fabricate test steps, do not write "TBD", do not paste CI output. The header being present is a cue to the reviewer that testing belongs here.
- **Inputs for the prose.** Use `git log origin/main..HEAD --format="%s%n%n%b"` for commit-derived "what & why", `git diff --stat origin/main..HEAD` for files-touched scope, and the Jira issue's `summary` + `description` for ticket context. Keep each section tight — a few sentences or a short bullet list, not a wall of text.
- **User confirmation.** Show the composed description in chat and confirm before publishing. Let the user edit inline if they want changes.

### Step 4: Invoke `git review`

Default invocation:

```bash
git review --description "<composed description>" -t
```

- `--description` pre-fills the PR body, so the editor never opens.
- `-t` transitions the linked Jira bug to "In Review" — the standard Delphix workflow when opening a PR.

**Optional flags.** `git review` exposes a number of flags that tailor the PR. Recognize natural-language asks from the user and map them to the right flag:

| Flag | What it does | Add when the user says… |
|---|---|---|
| `-d`, `--draft` | **Toggles** draft mode. The default comes from `git config`, usually `True` (draft). Passing this flag flips it. | "open as non-draft", "ready for review, not a draft", "don't make it a draft" |
| `-u`, `--update-title` | Update the PR title to match the most recent commit's subject. | "use the latest commit as the title", "update the PR title" |
| `-r <N>`, `--rid <N>` | Update PR number `<N>` instead of creating a new one. | "update PR 12345", "push this to the existing PR" |
| `-p <ref>`, `--parent <ref>` | Set the parent branch, PR number, or git SHA (for stacked PRs). | "this stacks on top of PR 9999", "parent is branch X" |
| `--labels <csv>` | Add labels. Existing labels are preserved. | "add the `needs-review` label", "label it `bug,frontend`" |
| `--auto-merge` | Enable auto-merge when checks pass. If the PR is a draft, also marks it ready for review. | "auto-merge when checks pass", "enable automerge" |
| `-v`, `--no-verify` | Skip local lint/style checks before posting. | "skip lint", "no-verify" — *confirm with the user; this is usually a smell.* |
| `--jenkins-url <url>` | Override the Jenkins instance for CI. | "use the staging Jenkins", "jenkins URL is X" |
| `-j`, `--jira-bug` | Create a Jira bug if the commit doesn't already link one. | "create a Jira bug for this". Rarely needed after `dlpx:issue-commit`, which always links a Jira ID. |
| `-t`, `--transition-bug` | Move the linked Jira bug to "In Review". | *Default-on in this skill.* Remove with "don't transition the bug". |
| `-o`, `--open` | Open the PR URL in a browser after posting. | "open it in the browser" — otherwise the URL is returned in chat, which is usually fine. |

When the user combines asks ("publish with auto-merge and the `needs-review` label, don't transition the bug"), build the invocation accordingly — remove defaults they opted out of, add the flags they opted in to.

### Step 5: Report back

`git review` prints the temporary branch name (e.g. `dlpx/pr/<username>/<uuid>`) and the PR URL. Share both with the user. `git review` also appends the PR URL to the first commit message — do not add it manually.
