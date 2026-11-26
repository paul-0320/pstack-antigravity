# pstack-antigravity

> **Unofficial Antigravity port** of [pstack](https://github.com/cursor/plugins/tree/main/pstack) (`0.15.48`, MIT, [Lauren Tan / poteto](https://x.com/poteto)). Upstream `pstack` supports Cursor and Claude Code, not Google Antigravity (`agy`). This repository builds and verifies a clean, relocatable Antigravity plugin from upstream sources.

## Highlights

- **Pure Antigravity baseline:** Requires only Antigravity (`agy`). Multi-agent workflows and multi-vendor panels run natively through Antigravity's built-in `swarm` tool and `invoke_subagent` — no external CLI wrappers or hardcoded home paths.
- **No `/swarm` command collision:** Renames upstream `/swarm` to `/pstack-swarm` so it does not collide with Antigravity's built-in `/swarm`.
- **Update-safe model config (drop-in override):** `/setup-pstack` detects models entitled in your account (`swarm{action:"models", all:true}` / `agy models`) and writes your preferences to `~/.gemini/config/pstack-models.md`, outside the plugin directory. Reinstalling or updating `pstack` preserves your choices.
- **Reproducible upstream sync:** `upstream/pstack/` stays unmodified on the `upstream` vendor branch, while `overlay/` holds only 8 Antigravity-specific files. `scripts/build-antigravity-pstack.mjs` deterministically builds `pstack/` and fails if an upstream release adds an unmapped Cursor tool name or dangling link.

## Install

```bash
git clone https://github.com/paul-0320/pstack-antigravity.git
agy plugin validate ./pstack-antigravity/pstack --strict
agy plugin install ./pstack-antigravity/pstack
agy plugin list
```

Validate the hosted plugin before cloning:

```bash
agy plugin validate https://github.com/paul-0320/pstack-antigravity/tree/main/pstack --strict
```

## Quick start

1. Run `/setup-pstack` in Antigravity to detect your available models and write `~/.gemini/config/pstack-models.md`.
2. Start any non-trivial task with `/poteto-mode`.
3. See [`pstack/docs/harness/antigravity.md`](./pstack/docs/harness/antigravity.md) for the complete Cursor-to-Antigravity mapping and [`pstack/docs/guide/README.md`](./pstack/docs/guide/README.md) for the walkthrough guide.

## Repository layout

```text
.
├── upstream/
│   ├── UPSTREAM.json                   # Upstream commit and version record
│   └── pstack/                         # Unmodified upstream pstack (tracked on `upstream` branch)
├── overlay/                            # Minimal Antigravity-native overrides (8 files)
├── scripts/
│   ├── build-antigravity-pstack.mjs    # Deterministic generator (`--check` in CI)
│   ├── lint-port.mjs                   # Packaging linter (paths, leaks, manifest, invariants)
│   └── sync-upstream.sh                # Pulls new upstream releases onto `upstream` branch
├── pstack/                             # Generated, ready-to-install Antigravity plugin
└── .github/workflows/
    ├── ci.yml                          # Drift check + packaging linter + bash syntax check
    └── sync-upstream.yml               # Daily automated upstream check -> rebuild -> PR (or Issue on mapping gap)
```

## Syncing a new upstream release

### Automatic (GitHub Actions)

`.github/workflows/sync-upstream.yml` checks `cursor/plugins/pstack` every day at `03:00 UTC` (and on manual **Run workflow**):

- If upstream changed and `build-antigravity-pstack.mjs` + `lint-port.mjs` pass, it opens a pull request updating `upstream/pstack/`, `overlay/plugin.json`, and `pstack/`.
- If upstream introduced an unmapped Cursor tool name or broken link, it opens an issue with the exact failing check so the adapter can be updated before merging.

### Manual (local vendor branch)

```bash
./scripts/sync-upstream.sh
# Inspect diff, commit on `upstream`, then merge into `main`:
git add upstream && git commit -m "chore(upstream): sync cursor/plugins pstack <version>"
git checkout main && git merge upstream
# Update `version` in overlay/plugin.json to `<upstream>+agy.1`, then rebuild and verify:
node scripts/build-antigravity-pstack.mjs
node scripts/lint-port.mjs --with-agy
```

## Custom local overlay builds

If you maintain local workflow overrides on top of this port, pass `--extra-overlay` and `--out` to build directly into your Antigravity plugins folder without forking the generated tree:

```bash
node scripts/build-antigravity-pstack.mjs \
  --extra-overlay ~/.gemini/config/my-pstack-overlay \
  --out ~/.gemini/config/plugins/pstack
agy plugin validate ~/.gemini/config/plugins/pstack --strict
```

## Attribution and license

- Upstream `pstack` is licensed under the [MIT License](./LICENSE), Copyright (c) 2026 Lauren Tan.
- Antigravity port automation and overlay files in this repository are likewise licensed under the [MIT License](./LICENSE).
- This project is independent and is not affiliated with or endorsed by Cursor, Lauren Tan, or Google.
