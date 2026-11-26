# pstack (Unofficial Antigravity Port)

> **Unofficial community port.** Upstream [pstack](https://github.com/cursor/plugins/tree/main/pstack) is created and maintained by [Lauren Tan (poteto)](https://x.com/poteto) under the [MIT License](./LICENSE). This directory is generated from upstream pstack `0.15.48` for Google Antigravity (`agy`), because upstream does not ship an Antigravity harness target.

## What this plugin ships

- **59 skills** (including `/poteto-mode`, `/architect`, `/arena`, `/interrogate`, `/pstack-swarm`, `/setup-pstack`, `/reframe`, `/sharpen`, `/how`, `/why`, `/unslop`, `/no-comments`, and all 24 `principle-*` skills)
- **2 subagents** ([`poteto-agent`](./agents/poteto-agent.md) and [`comment-sicko`](./agents/comment-sicko.md))
- **1 on-demand model rule** ([`rules/pstack-models.md`](./rules/pstack-models.md), `trigger: model_decision`)
- **1 Antigravity adapter** ([`docs/harness/antigravity.md`](./docs/harness/antigravity.md)) and the full [pstack guide](./docs/guide/README.md)

## Pure Antigravity baseline

This port requires **only Antigravity (`agy`)** — no external CLI wrappers, no hardcoded home paths, and no Cursor-only plugins.

- Parallel workers and multi-vendor panels run natively through Antigravity's built-in `swarm` tool and `invoke_subagent`.
- Upstream `/swarm` is renamed to `/pstack-swarm` to avoid colliding with Antigravity's built-in `/swarm` command.
- Cursor-only features (Cursor Automations, Bugbot, `cursor-team-kit`, Cloud Agents) are mapped to Antigravity equivalents or skipped with a one-line note per [`docs/harness/antigravity.md`](./docs/harness/antigravity.md).

## Install

```bash
git clone https://github.com/paul-0320/pstack-antigravity.git
agy plugin validate ./pstack-antigravity/pstack --strict
agy plugin install ./pstack-antigravity/pstack
agy plugin list
```

You can also validate the hosted tree before cloning:

```bash
agy plugin validate https://github.com/paul-0320/pstack-antigravity/tree/main/pstack --strict
```

## Quick start

1. Run [`/setup-pstack`](./skills/setup-pstack/SKILL.md) to detect the models entitled in your Antigravity account (`swarm{action:"models", all:true}` / `agy models`) and pick a reasoning budget (`large`, `medium`, or `small`).
2. Run [`/poteto-mode`](./skills/poteto-mode/SKILL.md) before any non-trivial engineering task.
3. New to pstack? Read the [pstack guide](./docs/guide/README.md) or run [`/poteto-help`](./skills/poteto-help/SKILL.md).

### Model configuration (drop-in override)

`/setup-pstack` writes your personal role-to-model choices to `~/.gemini/config/pstack-models.md`, outside the plugin directory. Reinstalling or updating `pstack` never overwrites your model configuration. Without that file, every role falls back safely to `inherit-parent` / `auto` in [`rules/pstack-models.md`](./rules/pstack-models.md).

## License

MIT — Copyright (c) 2026 Lauren Tan (upstream `pstack`). See [`LICENSE`](./LICENSE).
