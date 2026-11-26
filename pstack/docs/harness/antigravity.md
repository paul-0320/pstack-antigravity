# pstack in Antigravity

This plugin is an unofficial Antigravity port of [upstream pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT, Lauren Tan). Most skills keep upstream Cursor terminology so updates stay traceable and easy to regenerate. Read this file once per session, then map every Cursor name in a skill using the tables below.

`<pstack>` means the installed plugin directory (by default `~/.gemini/config/plugins/pstack`). Resolve bundled skills and guides relative to `<pstack>` and never assume a hardcoded home path. If a Cursor field has no row below, drop it and note that you dropped it. Never pass a field or value that an Antigravity tool schema rejects.

## Tools

| Upstream Cursor | Antigravity |
| --- | --- |
| `Task` | Use Antigravity's built-in `swarm` tool (`swarm{action:"add", name, model, workspace:"share"\|"branch"\|"inherit", brief}`) for isolated parallel workers and model-pinned seats, or `invoke_subagent` (`poteto-agent`, `comment-sicko`, `research`, `browser`, `image-generator`) for helper delegates. |
| `AskQuestion` | `ask_question`. Set `is_multi_select: true` where multiple choices are allowed. In headless `agy -p` runs, ask in plain text. |
| Open a todolist, or copy steps into the todolist tool (`todolist`) | Use `update_steps` when available, or write a task-list markdown artifact in the conversation's artifact directory (`~/.gemini/antigravity/brain/<conversation-id>/`) or `scratch/` with `write_file` and update it with `edit_file`. |
| Run another pstack skill (`/name` or "the **name** skill") | `read_file` `<pstack>/skills/<name>/SKILL.md` and follow it. Antigravity does not prefix plugin commands, so tell the user `/<name>`. Note that upstream `/swarm` is renamed to `/pstack-swarm` (`skills/pstack-swarm/SKILL.md`) to avoid colliding with Antigravity's built-in `/swarm`. |
| `Grep`, `Glob` | `run_command` with `grep -rn` or `find` (`rg` / `fd` optional). |
| `Read`, `Edit`, `Write`, `Bash`, web lookups | `read_file`, `edit_file`, `write_file`, `run_command` (manage long-running tasks with `manage_task`), `search_web`. |
| `/loop` | `schedule` tool (`DurationSeconds` for a one-shot timer or `CronExpression` for a recurring cron, never both). For a recurring background job that starts a fresh conversation each run, use Antigravity's built-in `automation` skill. |

## Subagent fields

| Upstream Cursor | Antigravity |
| --- | --- |
| `subagent_type: generalPurpose` | `invoke_subagent(TypeName: "poteto-agent")` for playbook delegates, or a built-in `swarm` worker (`swarm{action:"add", ...}`). |
| `poteto-agent`, `comment-sicko` | `invoke_subagent(TypeName: "poteto-agent")`, `invoke_subagent(TypeName: "comment-sicko")`. Both are defined in `<pstack>/agents/`. |
| The `model:` line in `poteto-agent` | `agents/poteto-agent.md` sets `model: inherit`. To pin a specific model slug (for example in `arena`, `interrogate`, or `pstack-swarm`), use a built-in `swarm` worker with `model: "<slug>"`. |
| `readonly: true` | `swarm{action:"add", workspace:"inherit", ...}` with a brief stating "do not create, edit, or delete files" (verify `git status` afterward), or `invoke_subagent(TypeName: "research")`. |
| `readonly: false` | `swarm{action:"add", workspace:"share", ...}` or `invoke_subagent(TypeName: "poteto-agent", Workspace: "share")`. |
| `environment: "cloud"` | An isolated workspace: `swarm` or `invoke_subagent` with `workspace:"branch"` (a full clone including uncommitted changes). Name the branch or commit the worker should check out. |
| `environment: "local"` | `workspace:"inherit"`. |
| `cloud_base_branch: <b>` | Instruct the worker in its brief to check out `<b>` first. |
| `run_in_background: true` | Omit. Both built-in `swarm` workers and `invoke_subagent` run in the background by default; stop calling tools and wait for completion notifications. |
| `resume` | Spawn a fresh worker with the prior result pasted into its brief. To continue a live worker, use `send_message` (subagent) or `post_message` (swarm). |
| `file_attachments` | List the file paths in the brief. For the `browser` subagent, stage files under `<artifact-dir>/browser_sandbox/references/`. |
| Project worker (Cursor Projects) | A built-in `swarm` worker. |

## Models

Antigravity natively exposes multiple model families (such as Gemini, Claude, and GPT models depending on account entitlement) through built-in `swarm`. Discover available slugs with `swarm{action:"models", all:true}` or `agy models`. Never pass a slug that is not in the detected set.

| Upstream Cursor | Antigravity |
| --- | --- |
| `pstack-models.mdc` (`~/.cursor/rules/pstack-models.mdc`) | Read user overrides from `~/.gemini/config/pstack-models.md` first (written by `/setup-pstack`, outside the plugin folder so plugin updates never overwrite user choices). Fall back to `<pstack>/rules/pstack-models.md` (`trigger: model_decision`) for any role without a user override line. |
| `claude-` slugs (such as `claude-opus-5-5-xhigh-fast`, `claude-opus-5-5-high-fast`, `claude-fable-5-2-high`) | Use the role's configured model from `~/.gemini/config/pstack-models.md` or `<pstack>/rules/pstack-models.md`. When mapping directly to Antigravity models, drop `-fast` and pick the highest available matching family slug at or below `xhigh` from `swarm{action:"models", all:true}`. If unavailable, fall back to another detected slug or omit `model` (`inherit-parent`) and say so. |
| `gemini-`, `grok-`, `gpt-` slugs | Pass the matching detected Antigravity slug to `swarm{action:"add", model:"<slug>"}`. If a family is not entitled in `swarm{action:"models", all:true}`, substitute another detected vendor family or drop the seat (keeping at least two runners in `arena` / `interrogate`) and note the substitution. |
| `auto` or `inherit-parent` | Run the role on the parent session model directly, or omit `model` on a `swarm` worker so it inherits the parent session model. |
| `swarm workers` role line | Read the `pstack-swarm workers` line (and also honor a legacy `swarm workers` line if present in a user override). |

## Paths

| Upstream Cursor | Antigravity |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.agents/skills/` (workspace), `~/.gemini/config/skills/` (global). |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `~/.gemini/config/plugins/`, `plugin.json` at the plugin root. |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` or `GEMINI.md`, or plugin `rules/` files with valid frontmatter (`trigger: model_decision` or `always_on`). |
| `agent-transcripts` (`~/.cursor/projects/<slug>/agent-transcripts/`) | `~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` and `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`. Antigravity stores one folder per conversation rather than per workspace, so find this workspace's transcripts with `find ~/.gemini/antigravity/brain ~/.gemini/antigravity-cli/brain -type f -path '*/.system_generated/logs/transcript.jsonl' -print0 2>/dev/null \| xargs -0 grep -l -F -- <workspace-path>`. Never read unrelated chats. |
| `.cursor/worktrees/` | `~/.gemini/antigravity/worktrees/` and `git worktree list`. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists locally. Read the local copy and do not fetch it. Give the user the upstream URL when they ask for an upstream reference. |

## Cursor-only features

Antigravity has no Cursor Automations webhooks, Bugbot service, Cursor cloud agents, Cursor Custom Mode, Agents Window, or `cursor-team-kit`. When a step needs one with no mapping below, add one line to your reply — `Skipped in Antigravity: <step>. <reason>.` — and continue to the next step. Do not stop, ask, or retry. If a later step needs what the skipped step produced, leave a placeholder and name it in that line.

| Upstream Cursor | Antigravity |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, `SendToUser` secret requests | Not supported. Use the built-in `automation` skill for recurring background jobs, or the `schedule` tool for an in-conversation wake. |
| Bugbot | Treat existing Bugbot PR comments as ordinary GitHub review threads via `gh`. Skip any step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | Use an isolated `workspace:"branch"` worker. Skip steps that require the Cursor cloud dashboard itself. |
| `cursor-team-kit` `/deslop` | Use the **unslop** skill for prose plus `/no-comments` (`invoke_subagent(TypeName: "comment-sicko")`) for comments. |
| `cursor-team-kit` `control-ui` | Use `invoke_subagent(TypeName: "browser", Model: "flash")` to drive the app in a browser and record evidence. |
| `cursor-team-kit` `control-cli` | Not supported. Drive the CLI with `run_command` and record the exact command, stdout, stderr, and exit code. |
| Cursor built-in `create-skill` | Use Antigravity's built-in `agy-customizations` skill (and `plugin` skill when authoring a plugin). |
| Cursor Custom Mode, Plan Mode | A custom main agent (`mainAgent: true` agent file started with `agy --agent <name>`), and `agy --mode plan`. |
| Built-in PR tool | Use the forge CLI named by the step, such as `gh pr create` (not a skip; write no skip line). |
