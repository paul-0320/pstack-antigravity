---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available Antigravity models and writes your user drop-in override file at ~/.gemini/config/pstack-models.md. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.gemini/config/pstack-models.md`, a user-owned drop-in override file outside the plugin directory that overrides the plugin's default role lines in `rules/pstack-models.md`. Keeping user choices outside `~/.gemini/config/plugins/pstack/` prevents plugin reinstalls or `git pull` updates from overwriting your configuration.

## Steps

### 1. Detect available models

1. Call `swarm{action:"models", all:true}` to enumerate every model slug that built-in `swarm` workers accept in this session. That is the dependable source.
2. Optionally run `agy models` via `run_command` to cross-check entitled models.
3. If neither returns slugs, ask the user to paste the model slugs available in their account.

Never write a real slug you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not listed as model slugs.

### 2. Load current state and propose defaults

Check whether `~/.gemini/config/pstack-models.md` already exists.

- **If it exists:** Read its `# budget` line and role lines as the current choices. Drop retired role names not listed in step 5 (such as `hardest tasks`, `architect runners`, `reflect tooling`, or `why investigators`), and migrate any `swarm workers` line to `pstack-swarm workers`. Note any dropped or migrated lines.
- **If it does not exist:** Build initial proposals from the detected models in step 1:
  - Identify the strongest available slug (at or below `xhigh`) per vendor family in the detected set (for example, Gemini such as `gemini-4-neon-xhigh`, Claude such as `claude-opus-5-5-high`, and GPT if present).
  - For single-seat roles (`design and plan`, `feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `pstack-swarm workers`), propose either the top detected coding slug or `inherit-parent`.
  - For `judgment and prose`, propose `inherit-parent`.
  - For panel roles (`arena runners`, `interrogate reviewers`), propose one top detected slug per available vendor family (at least 2 entries; repeat or include `inherit-parent` if only one vendor is entitled).
  - For `arena cross-judge pool`, propose detected slugs from each available vendor family ordered by capability so Arena can always pick a vendor different from the parent session.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use `ask_question` with these exact options, naming the current budget if `~/.gemini/config/pstack-models.md` already records one (or noting that `large` matches the skill defaults):

- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply the budget.** Keep any role the user explicitly customized by family or alias (`inherit-parent`, `auto`) on re-runs. Move each real slug's effort token on the ladder `xhigh` > `high` > `medium` > `low`: `large` keeps the top effort (capped at `xhigh`), `medium` lowers one step, and `small` lowers two steps. If the shifted slug is not in the detected set, pick the highest detected slug in the same family at or below the target effort, or mark the role as needing a choice. Never append `-fast` unless that exact slug appears in the detected set. `inherit-parent` and `auto` do not change.

**(c) Show the roles and confirm.** Show every role with its proposed model, mark any unavailable slug as needing a choice, and list any lines dropped or migrated in step 2. Ask via `ask_question` whether to accept as-is or adjust specific roles, offering the detected slugs (at `xhigh` or below) plus `inherit-parent` and `auto`. Note that panel roles spawn one `swarm` worker per listed entry, while `arena cross-judge pool` picks the first entry from a vendor different from the parent session (`inherit-parent` and `auto` never act as a cross-vendor judge).

### 4. Validate

Every real slug written must appear in the step 1 detected set and sit at `xhigh` or below. `inherit-parent` and `auto` always pass. If any chosen slug is unavailable, stop and ask again.

### 5. Write the user override file

Write `~/.gemini/config/pstack-models.md` (creating `~/.gemini/config/` if needed). Overwrite the entire file so re-runs are idempotent. Do not modify `<pstack>/rules/pstack-models.md`.

Shape:

```markdown
# pstack user model overrides (Antigravity)
# Lives outside ~/.gemini/config/plugins/pstack/ so plugin updates keep your choices.
# Delete a line to fall back to the plugin default in rules/pstack-models.md.
# `inherit-parent` or `auto`: runs on the parent session model (omit `model` on `swarm`).
# defaults: 3
# budget: large (xhigh)
design and plan (architect, multi-phase-plan): <slug-or-inherit-parent>
judgment and prose: inherit-parent
feature, refactoring: <slug-or-inherit-parent>
bug-fix: <slug-or-inherit-parent>
perf-issue: <slug-or-inherit-parent>
hillclimb: <slug-or-inherit-parent>
pstack-swarm workers: <slug-or-inherit-parent>
arena runners: <slug-1>, <slug-2>
interrogate reviewers: <slug-1>, <slug-2>
arena cross-judge pool: <slug-1>, <slug-2>
```

### 6. Confirm

Tell the user that `~/.gemini/config/pstack-models.md` was written and applies on the next pstack skill invocation or new session. Re-running `/setup-pstack` updates it.

### 7. Offer a verification skill (optional)

Check whether the active project already has a `verify-*` skill or verification harness. If not, offer once: "Want a project-local verification skill so agents can drive the app like a user and prove changes work? I can generate one with `/create-verification-skill`." On yes, read `../create-verification-skill/SKILL.md` relative to this skill and follow it. On no, move on.

### 8. Offer a formal verification skill (optional)

Check whether the active project already has a formal verification skill. If not, offer once: "Want a formal verification skill so agents can prove a key property holds across all cases in scope? I can generate one with `/create-formal-verification-skill`." On yes, read `../create-formal-verification-skill/SKILL.md` relative to this skill and follow it. On no, move on.
