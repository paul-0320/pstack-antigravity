#!/usr/bin/env node
// Deterministic generator: upstream/pstack + overlay (+ optional --extra-overlay) -> pstack/ (Antigravity plugin)
// Modeled after cursor/plugins/scripts/generate-pstack-harness-trees.mjs with zero npm dependencies.
//
// Usage:
//   node scripts/build-antigravity-pstack.mjs [--check] [--extra-overlay <dir>] [--out <dir>] [--default-code-seat <text>]

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = join(ROOT, "upstream", "pstack");
const OVERLAY = join(ROOT, "overlay");
const ADAPTER = "docs/harness/antigravity.md";
const UPSTREAM_GITHUB = "https://github.com/cursor/plugins";
const COMMAND = "node scripts/build-antigravity-pstack.mjs";

function parseArgs(argv) {
  const opts = {
    check: false,
    extraOverlay: null,
    outDir: join(ROOT, "pstack"),
    defaultCodeSeat: "your configured role model in `~/.gemini/config/pstack-models.md`",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") {
      opts.check = true;
    } else if (arg === "--extra-overlay") {
      opts.extraOverlay = resolve(argv[++i] ?? "");
    } else if (arg === "--out") {
      opts.outDir = resolve(argv[++i] ?? "");
    } else if (arg === "--default-code-seat") {
      opts.defaultCodeSeat = argv[++i] ?? opts.defaultCodeSeat;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

const OPTS = parseArgs(process.argv.slice(2));

const EXCLUDED_TOP_LEVEL = new Set([
  ".cursor-plugin",
  ".gitignore",
  "automations",
]);
const EXCLUDED_PATHS = new Set([
  "docs/harness/claude-code.md",
]);

const REWRITE_EXEMPT = new Set([
  ADAPTER,
  "rules/pstack-models.md",
  "skills/setup-pstack/SKILL.md",
  "README.md",
]);

const ADAPTER_WRAP_EXEMPT = new Set([
  "setup-pstack",
]);

const LINK_RE = /\]\(([^)\s]+)\)/g;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Every Cursor-specific token remaining after mechanical rewrites must have an explicit row in docs/harness/antigravity.md.
const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "`claude-`", re: /\bclaude-[a-z]+-\d/ },
  { key: "`gemini-`", re: /\bgemini-\d/ },
  { key: "`grok-`", re: /\bgrok-\d/ },
  { key: "`gpt-`", re: /\bgpt-\d/ },
  { key: "`inherit-parent`", re: /inherit-parent/ },
  { key: "`pstack-models.mdc`", re: /pstack-models\.mdc/ },
  { key: "`.cursor/skills/`", re: /\.cursor\/skills/ },
  { key: "`~/.cursor/plugins/`", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: "`.cursor/rules/*.mdc`", re: /\.cursor\/rules|always-applied rule/ },
  { key: "`agent-transcripts`", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "`.cursor/worktrees/`", re: /\.cursor\/worktrees/ },
  { key: "`/loop`", re: /`\/loop`/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool|cursor-team-kit|control-ui|control-cli/ },
];
const ROUTE_KEY = "Run another pstack skill";

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      if (name === ".DS_Store" || name === "node_modules") return [];
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

function readEntry(fullPath) {
  const st = statSync(fullPath);
  return {
    bytes: readFileSync(fullPath),
    executable: (st.mode & 0o111) !== 0,
  };
}

function toPosix(p) {
  return p.split("\\").join("/");
}

function stripFencedCode(md) {
  let out = "";
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  for (const line of md.split("\n")) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      const ch = m[1][0];
      const len = m[1].length;
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
        fenceLen = len;
      } else if (ch === fenceChar && len >= fenceLen) {
        inFence = false;
      }
      out += "\n";
      continue;
    }
    out += (inFence ? "" : line) + "\n";
  }
  return out;
}

// Deterministic, context-safe mechanical rewrites from Cursor names to Antigravity equivalents.
function applyMechanicalRewrites(relPath, text) {
  if (REWRITE_EXEMPT.has(relPath)) return text;
  let out = text;

  // 1. Rename /swarm skill to /pstack-swarm (collides with Antigravity built-in /swarm).
  if (relPath === "skills/pstack-swarm/SKILL.md") {
    out = out.replace(/^name:\s*swarm\s*$/m, "name: pstack-swarm");
    out = out.replace(/`swarm workers`/g, "`pstack-swarm workers`");
  }
  out = out.replace(/(\.\.\/|\.\/|skills\/)swarm(\/|(?=\)))/g, "$1pstack-swarm$2");
  out = out.replace(/(^|[\s`("'])\/swarm(?=$|[\s`.,;:)?"'])/gm, "$1/pstack-swarm");
  out = out.replace(/the \*\*swarm\*\* skill/g, "the **pstack-swarm** skill");
  out = out.replace(/Fan-out → \*\*swarm\*\*/g, "Fan-out → **pstack-swarm**");
  out = out.replace(/Routed workflow skills \(`interrogate`, `swarm`\)/g, "Routed workflow skills (`interrogate`, `pstack-swarm`)");
  out = out.replace(/`arena`, `swarm`, `interrogate`/g, "`arena`, `pstack-swarm`, `interrogate`");
  out = out.replace(/`arena`, `interrogate`, `swarm`/g, "`arena`, `interrogate`, `pstack-swarm`");

  // 2. Exact 1:1 tool, path, and config file rewrites.
  out = out.replace(/`AskQuestion`|\bAskQuestion\b/g, "`ask_question`");
  out = out.replace(/~\/\.cursor\/rules\/pstack-models\.mdc/g, "~/.gemini/config/pstack-models.md");
  out = out.replace(/`pstack-models\.mdc`/g, "`pstack-models.md`");
  out = out.replace(/~\/\.cursor\/skills\//g, "~/.gemini/config/skills/");
  out = out.replace(/\.cursor\/skills\//g, ".agents/skills/");
  out = out.replace(/~\/\.cursor\/plugins\//g, "~/.gemini/config/plugins/");
  out = out.replace(/\.cursor-plugin\/plugin\.json/g, "plugin.json");
  out = out.replace(/\.cursor\/worktrees\//g, "~/.gemini/antigravity/worktrees/");

  // 3. Unambiguous subagent calls.
  out = out.replace(
    /Spawn `Task` with `subagent_type: "comment-sicko"`/g,
    'Spawn `invoke_subagent(TypeName: "comment-sicko")`',
  );
  out = out.replace(
    /Spawn one Task subagent with `subagent_type: generalPurpose` and `readonly: true`/g,
    'Spawn one read-only subagent with `invoke_subagent(TypeName: "research")`',
  );

  // 4. Built-in skill & loop rewrites.
  out = out.replace(
    /Use the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)\./g,
    "Use Antigravity's built-in **agy-customizations** skill (and **plugin** skill when shipping a plugin) for authoring SKILL.md files.",
  );
  out = out.replace(/Cursor's built-in `create-skill` skill/g, "Antigravity's built-in `agy-customizations` skill");
  out = out.replace(/Cursor's built-in `create-skill`/g, "Antigravity's built-in `agy-customizations`");
  out = out.replace(/`create-skill`/g, "`agy-customizations`");
  out = out.replace(/\bcreate-skill\b/g, "agy-customizations");
  out = out.replace(
    /^- `\/loop` is Cursor's built-in wake mechanism, not a pstack skill\./gm,
    "- The `schedule` tool is Antigravity's built-in wake mechanism, not a pstack skill.",
  );
  out = out.replace(/Give `\/loop` /g, "Give the `schedule` tool ");
  out = out.replace(/gives `\/loop` /g, "gives the `schedule` tool ");
  out = out.replace(/give `\/loop` /g, "give the `schedule` tool ");
  out = out.replace(/`\/loop` per component/g, "Loop each component with the `schedule` tool");
  out = out.replace(/`\/loop`/g, "the `schedule` tool");
  out = out.replace(/ \/loop until done\./g, " use the schedule tool to recheck until done.");

  // 5. Transcript path guidance (Antigravity stores one folder per conversation).
  out = out.replace(
    /Transcripts live at `~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl`, where `<slug>` is the workspace path with the leading slash dropped and each "\/" turned into "-" \(so `\/Users\/you\/proj` becomes `Users-you-proj`\)\. Every line is one chat message\./g,
    "Transcripts live at `~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` and `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`, one folder per conversation. Find this workspace's chats with `find ~/.gemini/antigravity/brain ~/.gemini/antigravity-cli/brain -type f -path '*/.system_generated/logs/transcript.jsonl' -print0 2>/dev/null | xargs -0 grep -l -F -- <workspace-path>`. Every line is one chat message.",
  );
  out = out.replace(
    /Don't glob across `~\/\.cursor\/projects\/\*\/`\./g,
    "Don't read chats outside this workspace's matching transcript list.",
  );
  out = out.replace(
    /Do not glob across `~\/\.cursor\/projects\/\*\/`\./g,
    "Do not read chats outside this workspace's matching transcript list.",
  );

  // 6. Code playbook default seat phrase (configurable for local profiles via --default-code-seat).
  out = out.replace(
    /\(default `claude-opus-5-5-xhigh-fast`\)/g,
    `(default ${OPTS.defaultCodeSeat})`,
  );

  // 7. Replace Claude Code install paragraphs in guide/help with Antigravity equivalents.
  if (relPath === "docs/guide/01-setup.md") {
    out = out.replace(
      /## Install the plugin[\s\S]*?The \[Claude Code adapter\]\(\.\.\/harness\/claude-code\.md\) covers the other differences\./,
      [
        "## Install the plugin",
        "",
        "In a terminal, clone the Antigravity port repository and install the plugin:",
        "",
        "```bash",
        "git clone https://github.com/paul-0320/pstack-antigravity.git",
        "agy plugin validate ./pstack-antigravity/pstack --strict",
        "agy plugin install ./pstack-antigravity/pstack",
        "agy plugin list",
        "```",
        "",
        "Antigravity does not prefix plugin commands, so each command in this guide keeps its plain name (such as `/setup-pstack` and `/poteto-mode`, with `/swarm` renamed to `/pstack-swarm`). `/setup-pstack` writes your model choices to `~/.gemini/config/pstack-models.md` outside the plugin folder so updates preserve your settings. The [Antigravity adapter](../harness/antigravity.md) covers every Cursor-to-Antigravity mapping.",
      ].join("\n"),
    );
  }
  if (relPath === "skills/poteto-help/SKILL.md") {
    out = out.replace(
      /pstack is built for Cursor, and it also installs in Claude Code[\s\S]*?skipped with a one-line note\./,
      "pstack is built for Cursor, and this copy is ported to Antigravity. Here each command keeps its plain name, such as `/poteto-mode` or `/pstack-swarm`. The [Antigravity adapter](../../docs/harness/antigravity.md) maps every remaining Cursor name, and any step that needs a Cursor-only feature (such as Bugbot or Cursor Automations) is skipped with a one-line note (`Skipped in Antigravity: <step>. <reason>.`).",
    );
  }

  return out;
}

function resolveUpstreamRel(fromRel, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const normalizedFrom = fromRel.replace(/^skills\/pstack-swarm\//, "skills/swarm/");
  const resolved = posix.join(posix.dirname(normalizedFrom), target).replace(/\/$/, "");
  if (!resolved || resolved.startsWith("..")) return undefined;
  return existsSync(join(UPSTREAM, resolved)) ? resolved : undefined;
}

function hasPath(files, rel) {
  return files.has(rel) || [...files.keys()].some((k) => k.startsWith(`${rel}/`));
}

function buildTree() {
  if (!existsSync(UPSTREAM)) {
    throw new Error(`Missing upstream directory: ${UPSTREAM}`);
  }

  const files = new Map();
  const extraOverlayFiles = new Set();

  // 1. Copy canonical upstream files, excluding Cursor-only directories and applying mechanical Antigravity rewrites.
  for (const full of walk(UPSTREAM)) {
    const rawRel = toPosix(relative(UPSTREAM, full));
    const top = rawRel.split("/")[0];
    if (EXCLUDED_TOP_LEVEL.has(top) || EXCLUDED_PATHS.has(rawRel)) continue;

    const rel = rawRel.startsWith("skills/swarm/")
      ? `skills/pstack-swarm/${rawRel.slice("skills/swarm/".length)}`
      : rawRel;

    const entry = readEntry(full);
    if (rel.endsWith(".md")) {
      const rewritten = applyMechanicalRewrites(rel, entry.bytes.toString("utf8"));
      entry.bytes = Buffer.from(rewritten, "utf8");
    }
    files.set(rel, entry);
  }

  // 2. Apply built-in overlay files on top.
  for (const full of walk(OVERLAY)) {
    const rel = toPosix(relative(OVERLAY, full));
    const entry = readEntry(full);
    if (rel.endsWith(".sh")) entry.executable = true;
    files.set(rel, entry);
  }

  // 3. Apply optional user/local --extra-overlay files on top.
  if (OPTS.extraOverlay) {
    if (!existsSync(OPTS.extraOverlay)) {
      throw new Error(`Extra overlay directory does not exist: ${OPTS.extraOverlay}`);
    }
    for (const full of walk(OPTS.extraOverlay)) {
      const rel = toPosix(relative(OPTS.extraOverlay, full));
      const entry = readEntry(full);
      if (rel.endsWith(".sh")) entry.executable = true;
      files.set(rel, entry);
      extraOverlayFiles.add(rel);
    }
  }

  // 4. Inject Cursor-only warning in make-bot-ui/SKILL.md without duplicating upstream prose.
  const makeBotPath = "skills/make-bot-ui/SKILL.md";
  if (files.has(makeBotPath) && !extraOverlayFiles.has(makeBotPath)) {
    const note =
      "> **Not supported in Antigravity.** This skill depends on Cursor Cloud Automations (routines, `update_state`, `SendToUser`, `api2.cursor.sh` webhooks). For scheduled background jobs in Antigravity, use the built-in `automation` skill. The upstream text is kept below for reference.";
    const text = files.get(makeBotPath).bytes.toString("utf8");
    if (!text.includes("Not supported in Antigravity")) {
      files.get(makeBotPath).bytes = Buffer.from(
        text.replace(/^(# .*)\n+/m, `$1\n\n${note}\n\n`),
        "utf8",
      );
    }
  }

  // 5. Discover skills and validate Agent Skills naming + remaining Cursor term coverage against docs/harness/antigravity.md.
  const skillNames = [...new Set(
    [...files.keys()]
      .filter((k) => /^skills\/[^/]+\/SKILL\.md$/.test(k))
      .map((k) => k.split("/")[1]),
  )].sort();

  const problems = [];
  const termUsers = new Map();
  const wrapSkills = new Set();

  for (const skill of skillNames) {
    const skillMdPath = `skills/${skill}/SKILL.md`;
    const skillMdText = files.get(skillMdPath).bytes.toString("utf8");

    const frontmatter = skillMdText.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const fmName = frontmatter.match(/^name:(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (fmName !== skill) {
      problems.push(`${skillMdPath} has frontmatter name ${JSON.stringify(fmName ?? "")}, expected ${skill}`);
    }
    if (!SKILL_NAME_RE.test(skill) || skill.length > 64) {
      problems.push(`skills/${skill} violates lowercase-hyphen <=64 char skill naming`);
    }

    if (ADAPTER_WRAP_EXEMPT.has(skill) || extraOverlayFiles.has(skillMdPath)) continue;

    const others = skillNames.filter((n) => n !== skill).join("|");
    const routeRe = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
    const linksToSkill = (line, name) => line.includes(`(../${name}/`);

    const used = new Set();
    for (const [path, entry] of files) {
      if (!path.startsWith(`skills/${skill}/`) || !path.endsWith(".md")) continue;
      if (extraOverlayFiles.has(path)) continue;
      const text = entry.bytes.toString("utf8");
      for (const term of TERMS) {
        if (term.re.test(text)) used.add(term.key);
      }
      for (const line of text.split("\n")) {
        if ([...line.matchAll(routeRe)].some(({ groups }) => !linksToSkill(line, groups.bold ?? groups.command))) {
          used.add(ROUTE_KEY);
          break;
        }
      }
    }

    if (used.size > 0) {
      if (!/^# /m.test(skillMdText)) {
        problems.push(`${skillMdPath} uses Cursor terms (${[...used].join(", ")}) but has no H1 heading`);
      } else {
        wrapSkills.add(skill);
      }
      for (const key of used) {
        termUsers.set(key, [...(termUsers.get(key) ?? []), skill]);
      }
    }
  }

  const adapterText = files.get(ADAPTER)?.bytes.toString("utf8") ?? "";
  if (!adapterText) problems.push(`Missing adapter file ${ADAPTER}`);
  if (!OPTS.extraOverlay) {
    for (const [key, users] of termUsers) {
      if (!adapterText.includes(key)) {
        problems.push(`Antigravity adapter (${ADAPTER}) is missing a row for ${key}, used by: ${users.join(", ")}`);
      }
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }

  // 6. Inject Antigravity adapter line only into skills that still reference context-dependent Cursor terms.
  const adapterLine =
    `In Antigravity, read [the Antigravity adapter](../../${ADAPTER}) once per session before following this skill. ` +
    "It maps remaining Cursor tool names, paths, and model rules to Antigravity.";

  for (const skill of wrapSkills) {
    const path = `skills/${skill}/SKILL.md`;
    const text = files.get(path).bytes.toString("utf8");
    if (!text.includes(`../../${ADAPTER}`)) {
      files.get(path).bytes = Buffer.from(
        text.replace(/^(# .*)\n+/m, `$1\n\n${adapterLine}\n\n`),
        "utf8",
      );
    }
  }

  // 7. Rewrite relative links targeting excluded upstream paths (e.g. automations/benny) to upstream GitHub URLs.
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const text = entry.bytes.toString("utf8").replace(LINK_RE, (fullMatch, href) => {
      const target = href.replace(/[#?].*/, "");
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return fullMatch;
      const inTree = posix.join(posix.dirname(path), target).replace(/\/$/, "");
      if (inTree && !inTree.startsWith("..") && hasPath(files, inTree)) return fullMatch;
      const upstreamTarget = resolveUpstreamRel(path, href);
      if (!upstreamTarget) return fullMatch;
      const kind = statSync(join(UPSTREAM, upstreamTarget)).isDirectory() ? "tree" : "blob";
      const suffix = href.search(/[#?]/) >= 0 ? href.slice(href.search(/[#?]/)) : "";
      return `](${UPSTREAM_GITHUB}/${kind}/main/pstack/${upstreamTarget}${suffix})`;
    });
    entry.bytes = Buffer.from(text, "utf8");
  }

  // 8. Verify no dangling relative links remain outside code fences.
  const dangling = [];
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const stripped = stripFencedCode(entry.bytes.toString("utf8"));
    for (const [, href] of stripped.matchAll(LINK_RE)) {
      const target = href.replace(/[#?].*/, "");
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
      if (target.startsWith("/")) continue;
      const resolved = posix.join(posix.dirname(path), target).replace(/\/$/, "");
      if (resolved.startsWith("..") || !hasPath(files, resolved)) {
        dangling.push(`${path} -> ${href} (resolved: ${resolved})`);
      }
    }
  }
  if (dangling.length > 0) {
    for (const d of dangling) console.error(`FAIL dangling link: ${d}`);
    process.exit(1);
  }

  return { files, skillCount: skillNames.length, wrappedCount: wrapSkills.size };
}

const { files, skillCount, wrappedCount } = buildTree();

if (OPTS.check) {
  const onDisk = new Map(
    existsSync(OPTS.outDir)
      ? walk(OPTS.outDir).map((full) => [toPosix(relative(OPTS.outDir, full)), readEntry(full)])
      : [],
  );
  const allKeys = [...new Set([...files.keys(), ...onDisk.keys()])].sort();
  const drifted = allKeys.filter((k) => {
    const want = files.get(k);
    const have = onDisk.get(k);
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  if (drifted.length > 0) {
    for (const d of drifted.slice(0, 30)) console.error(`DRIFT ${d}`);
    console.error(`Output directory is out of date (${drifted.length} files). Run \`${COMMAND}\` and commit.`);
    process.exit(1);
  }
  console.log(`OK ${OPTS.outDir} is up to date (${files.size} files, ${skillCount} skills, ${wrappedCount} with adapter pointer).`);
} else {
  rmSync(OPTS.outDir, { recursive: true, force: true });
  for (const [rel, { bytes, executable }] of files) {
    const dest = join(OPTS.outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    chmodSync(dest, executable ? 0o755 : 0o644);
  }
  console.log(`Built ${OPTS.outDir} (${files.size} files, ${skillCount} skills, ${wrappedCount} with adapter pointer).`);
}
