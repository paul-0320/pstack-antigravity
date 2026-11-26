---
trigger: model_decision
description: "Read ONLY when a pstack skill (/poteto-mode, /arena, /interrogate, /pstack-swarm, /architect, /setup-pstack, etc.) is active in this conversation. Defines pstack per-role models and Antigravity worker execution rules."
---

# pstack Model and Worker Rules (Antigravity)

**Scope.** This file uses `trigger: model_decision` so Antigravity loads it only when a pstack skill is active. Do not apply it to unrelated chats.

## Configuration lookup order (drop-in override)

1. **User override (highest priority):** Read `~/.gemini/config/pstack-models.md` if it exists. `/setup-pstack` writes your personal model choices there — outside the plugin directory — so reinstalling or updating this plugin never overwrites your configuration.
2. **Plugin defaults (fallback):** For any role without a line in `~/.gemini/config/pstack-models.md`, use the default role lines below.

Never edit this plugin file directly to save personal model preferences; run `/setup-pstack` or edit `~/.gemini/config/pstack-models.md` instead.

## Default role lines

Format: `<role>: <model-slug>[, <model-slug>...]`. `inherit-parent` and `auto` run the role on the current Antigravity session model (or omit `model` on a `swarm` worker). Tool and path mappings live in `docs/harness/antigravity.md` inside this plugin.

```
# pstack default model configuration (pure Antigravity baseline).
# Run /setup-pstack to detect your entitled models (`swarm{action:"models", all:true}` / `agy models`)
# and write personalized multi-vendor lines to ~/.gemini/config/pstack-models.md.
# defaults: 3
# budget: large (xhigh)
design and plan (architect, multi-phase-plan): inherit-parent
judgment and prose: inherit-parent
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
pstack-swarm workers: inherit-parent
arena runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent
arena cross-judge pool: auto
```

- **Zero-config baseline.** Out of the box, every role uses `inherit-parent` / `auto` so the plugin works on any Antigravity account regardless of model entitlements. Run `/setup-pstack` to pin specific Gemini, Claude, or GPT slugs available in your account for multi-vendor panels (`arena`, `interrogate`, and cross-vendor judging).
- **Effort ceiling.** No role runs above `xhigh`.
- **Cross-judge selection.** For `arena cross-judge pool`, pick the first detected model from a vendor family different from the parent session's model. If the value is `auto`, query `swarm{action:"models", all:true}` and pick the highest-effort detected slug from another vendor (at or below `xhigh`). If only one vendor family is available in the account, fall back to a fresh `swarm` worker on the session model and note `single-vendor fallback` in the report.
- **Invalid or unentitled slugs.** Never invent a slug. If `swarm` rejects a configured slug, fall back to the closest detected slug in the same family from `swarm{action:"models", all:true}`, or omit `model` (`inherit-parent`), and state the fallback.

## Running workers in Antigravity

### Built-in `swarm` (model-pinned workers, isolated workspaces, and panels)

Use Antigravity's built-in `swarm` tool whenever a role needs a specific model slug, parallel fan-out (`/pstack-swarm`, `/arena`, `/interrogate`), or an isolated workspace. Built-in `swarm` workers do not automatically load `agents/poteto-agent.md`, so include the plugin's `poteto-mode` file paths in the first line of the brief:

```text
swarm{action:"title", title:"<task title>"}
swarm{action:"add", name:"<worker-name>", model:"<slug-or-omit-for-inherit-parent>", workspace:"share"|"branch"|"inherit", brief:"Read <pstack>/skills/poteto-mode/worker.md, <pstack>/skills/poteto-mode/SKILL.md, and <pstack>/docs/harness/antigravity.md in full before any other work, and read <pstack>/skills/principle-<name>/SKILL.md whenever you apply a principle.\n<goal and task>"}
```

- Use `workspace:"share"` for code-writing workers that need an isolated working copy sharing the repository, or `workspace:"branch"` for full clone isolation (such as competing `arena` or `interrogate` candidates).
- Use `workspace:"inherit"` for read-only reviewers and verifiers, explicitly instruct them not to create or edit files, and check `git status` afterward.
- Coordinate live workers with `post_message`, `read_board`, and `swarm_wait`. Land a worker's changes before calling `swarm{action:"kill", name:"<worker-name>"}`, because `kill` removes its workspace.

### Helper subagents (`invoke_subagent`)

| Purpose | Call |
| --- | --- |
| Playbook delegate following `poteto-mode` | `invoke_subagent(TypeName: "poteto-agent", Role: "<2-5 word role>", Prompt: "Read <pstack>/skills/poteto-mode/worker.md and <pstack>/docs/harness/antigravity.md before anything else.\n...", Workspace: "inherit"\|"share"\|"branch")` |
| Comment removal (`/no-comments`) | `invoke_subagent(TypeName: "comment-sicko", ...)` |
| Lightweight read-only research | `invoke_subagent(TypeName: "research", ...)` |
| Browser verification (`/visual-parity`, UI proof) | `invoke_subagent(TypeName: "browser", Model: "flash", ...)` |
| Diagram or image generation (`/teach`) | `invoke_subagent(TypeName: "image-generator", ...)` |

After calling `invoke_subagent`, stop calling tools and wait for the completion notification. Continue an active subagent with `send_message`, or stop one with `manage_subagents(Action: "kill", ConversationIds: [...])`.
