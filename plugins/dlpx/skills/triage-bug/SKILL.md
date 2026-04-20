---
name: triage-bug
description: Investigate and triage a bug from a Jira ticket without making code changes. Use whenever the user wants to analyze, investigate, triage, diagnose, or just understand a bug — phrases like "triage DLPX-1234", "look at this ticket", "what's going on with this bug", "investigate this issue", "can you take a look at this Jira ticket", or the user dropping a raw Jira URL / ID. Produces a structured triage report (root cause hypothesis, affected code, severity, suggested fix approach) but never edits, branches, or commits. Requires the Atlassian MCP.
argument-hint: <jira-issue-id>
---

> **Investigation only** — no branches, code changes, tests, or commits. This skill produces a triage report to inform a subsequent fix. If the user asks to fix during or after triage, suggest a manual fix informed by the report (or point at a future `fix-bug` skill when one exists).

The LLM's default mode is "helpful assistant who fixes things." That's wrong here — triage and implementation are separate activities because a report the user reads first is almost always a better fix than a rushed patch. Keep hands off the code.

### Step 0: Verify the Atlassian MCP is available

This skill needs Jira access to fetch the ticket. Check for either of the known tool-prefix paths before doing anything else:

- `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, `getJiraIssue`, `searchJiraIssuesUsingJql` (marketplace `atlassian` plugin)
- `mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources`, `getJiraIssue`, `searchJiraIssuesUsingJql` (claude.ai Atlassian Rovo integration)

If neither set is present, stop and tell the user:

> The Atlassian MCP is required for the `triage-bug` skill. Install the `atlassian` plugin from this marketplace (`/plugin install atlassian`) or enable the Atlassian Rovo integration in Claude.ai, then rerun.

Do **not** try to `WebFetch` the Jira URL as a fallback. Delphix Jira is on an authenticated instance and WebFetch will return a login page or fail outright — better to stop cleanly than waste a turn on a broken path.

In the rest of this skill, use whichever Atlassian prefix is actually present.

### Step 1: Gather Jira context (parallel)

In one turn, fetch what's needed to frame the investigation:

1. `getAccessibleAtlassianResources` (no args) → use the first result's `id` as `cloudId`.
2. In parallel:
   - `getJiraIssue` for the provided ID → captures the ticket's summary, description, priority, reporter, labels, components, attachments, and any linked tickets.
   - `searchJiraIssuesUsingJql` with key terms pulled from the ticket's summary / description (limit 5) → surfaces duplicates, prior fix attempts, or related tickets. Useful JQL shape: `text ~ "<key term>" AND project = <project-key> AND resolution = "Fixed" ORDER BY updated DESC`.

Present the user with a brief one-paragraph summary of the ticket (title, priority, reporter, gist) before continuing. This is a cheap checkpoint that catches "wrong ticket ID" mistakes and confirms you're looking at the same issue the user has in mind.

### Step 2: Locate the bug

Use the bug description, components, labels, stack traces, and error strings to find affected code. **For broad searches, dispatch an `Agent` with `subagent_type: "Explore"`** to keep the main context clean. Stop a strategy once you have high-confidence matches. Max 3 investigation passes per tier before moving on.

**Tier 1 — Direct pointers (start here).**
- Stack traces in the ticket → extract file paths and function names; verify them against current code with `Read` (line numbers shift; the path is usually still right).
- Error messages or exact UI strings → `Grep` the repo for literal matches. Escape regex metacharacters; long strings rarely collide.

These two are universal — they work the same in any repo.

**Tier 2 — Repo-aware structural navigation.** Different repos have different shapes; discover, don't assume.
- Read the repo's guidance files if present: `CLAUDE.md`, `AGENTS.md`, top-level `README.md`, or any `ARCHITECTURE.md`. These usually describe the layout and tell you where to look for what.
- Identify the repo shape from manifests:
  - JS/TS monorepos: `package.json` (+ `workspaces`), `pnpm-workspace.yaml`, `nx.json`, `lerna.json`, `turbo.json`.
  - Single-package JS/TS: `package.json`, `tsconfig.json` (`paths` section).
  - Go: `go.mod`, internal package layout under `cmd/` and `internal/`.
  - Python: `pyproject.toml`, `setup.py`, `src/` vs flat layouts.
  - Rust: `Cargo.toml` (+ `[workspace]`).
- If the repo has a top-level `plugins/` or `packages/` directory, map which package the ticket's components / labels / filenames point to before diving in.
- For an unfamiliar repo where guidance files are sparse, **dispatch an Explore subagent** with the ticket summary. Ask it to return "most likely area(s) of the codebase and why" in under 200 words. This bounds the main-context burn while letting the skill handle any repo shape.

**Tier 3 — Broad search (if Tier 1–2 weren't enough).**
- Translation keys, CSS classes, config keys → `Grep` across relevant file types.
- Git log signal: `git log -S "<snippet>"` to find when a symbol first appeared or was touched; `git log --grep "<term>"` for semantic matches in commit messages. A recently-touched file is a common regression source.
- Cross-repo investigation: if symptoms plainly point outside this repo (UI bug caused by a backend API change, etc.), **flag it in the report and stop** — don't wander. The user can rerun the skill in the right repo.

If you've exhausted all three tiers without a confident match, say so in the report under "Root cause analysis" with `Confidence: Low` and list what would unblock the investigation (a reproduction, access to another repo, more ticket detail).

### Step 3: Assess

Classify before writing the report. These labels are what a reviewer will skim first.

- **Bug type:** UI rendering | data / state | API integration | routing | auth / permissions | performance | race condition | configuration | MCP tool behavior | SSH session | build / tooling.
- **Confidence:** High (root cause confirmed) | Medium (strong hypothesis) | Low (needs reproduction or more investigation).
- **Blast radius:** Isolated (single function / component) | Moderate (feature area) | Wide (cross-cutting or multi-package).

If the bug requires investigation in a sibling repo (backend service, shared library, etc.) to reach root cause, flag it under "Next steps" rather than speculating. Calibrate confidence honestly — a confident-but-wrong triage wastes more time than a Low-confidence one that names its unknowns.

### Step 4: Present the triage report

Use this template. Every section stays; sections with no findings get a short "None found" / "Not applicable" line rather than being deleted, so readers can skim a consistent shape.

```
## Triage Report: <JIRA-ID> — <Summary>

### Ticket overview
<Brief summary, priority, reporter>

### Duplicates / related issues
<Related tickets found, or "None found">

### Root cause analysis
**Hypothesis:** <What's causing the bug and why>
**Confidence:** High | Medium | Low — <reason>
**Bug type:** <classification from Step 3>

### Affected code
| File | Lines | Role |
|------|-------|------|
| `path/to/file.ts` | L42–58 | <what this code does in the bug> |

### Recent changes (potential regression source)
<Relevant `git log` output, or "No recent changes">

### Severity
- **Priority:** <from ticket>
- **Blast radius:** Isolated | Moderate | Wide
- **User impact:** <who is affected and how>

### Suggested fix approach
<Specific changes and locations — concrete enough that a developer can start without rereading the report>

### Risk factors
<Side effects or areas needing care, or "None identified">

### Test coverage
- **Existing:** <Yes/No — what's covered>
- **Gaps:** <What's missing>

### Next steps
<e.g. "Implement the suggested fix, then run `dlpx:issue-commit <JIRA-ID>` to commit it",
or "Needs reproduction first — steps: ...",
or "Needs investigation in <other-repo> before proceeding">
```

After delivering the report, stop. Do not offer to implement the fix, do not start editing files. If the user follows up with "go ahead and fix it", point them at a manual fix workflow (make the edits, run `dlpx:issue-commit` to commit, `dlpx:publish-review` to open a PR) — the separation between investigation and implementation is deliberate.
