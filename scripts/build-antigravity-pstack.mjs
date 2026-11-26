#!/usr/bin/env node
// Deterministic generator: upstream/pstack + overlay -> pstack/ (Antigravity plugin)
// Modeled after cursor/plugins/scripts/generate-pstack-harness-trees.mjs with zero npm deps.

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
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = join(ROOT, "upstream", "pstack");
const OVERLAY = join(ROOT, "overlay");
const OUT = join(ROOT, "pstack");
const ADAPTER = "docs/harness/antigravity.md";
const UPSTREAM_GITHUB = "https://github.com/cursor/plugins";
const COMMAND = "node scripts/build-antigravity-pstack.mjs";

const EXCLUDED_TOP_LEVEL = new Set([
  ".cursor-plugin",
  ".gitignore",
  "automations",
]);
const EXCLUDED_PATHS = new Set([
  "docs/harness/claude-code.md",
]);

const SWARM_RENAME_EXEMPT = new Set([
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

// Every Cursor-specific token checked across skills must have an explicit entry in docs/harness/antigravity.md.
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

function rewriteSwarmRefs(relPath, text) {
  if (SWARM_RENAME_EXEMPT.has(relPath)) return text;
  let out = text;

  if (relPath === "skills/pstack-swarm/SKILL.md") {
    out = out.replace(/^name:\s*swarm\s*$/m, "name: pstack-swarm");
    out = out.replace(/`swarm workers`/g, "`pstack-swarm workers`");
  }

  // Link paths pointing at skills/swarm
  out = out.replace(/(\.\.\/|\.\/|skills\/)swarm(\/|(?=\)))/g, "$1pstack-swarm$2");
  // Slash command references (including `/swarm,`, `` `/swarm ...` ``)
  out = out.replace(/(^|[\s`("'])\/swarm(?=$|[\s`.,;:)?"'])/gm, "$1/pstack-swarm");
  // Bold skill routing references
  out = out.replace(/the \*\*swarm\*\* skill/g, "the **pstack-swarm** skill");
  out = out.replace(/Fan-out → \*\*swarm\*\*/g, "Fan-out → **pstack-swarm**");
  out = out.replace(/Routed workflow skills \(`interrogate`, `swarm`\)/g, "Routed workflow skills (`interrogate`, `pstack-swarm`)");
  out = out.replace(/`arena`, `swarm`, `interrogate`/g, "`arena`, `pstack-swarm`, `interrogate`");
  out = out.replace(/`arena`, `interrogate`, `swarm`/g, "`arena`, `interrogate`, `pstack-swarm`");
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

  // 1. Copy canonical upstream files, excluding Cursor-only directories and renaming skills/swarm -> skills/pstack-swarm.
  for (const full of walk(UPSTREAM)) {
    const rawRel = toPosix(relative(UPSTREAM, full));
    const top = rawRel.split("/")[0];
    if (EXCLUDED_TOP_LEVEL.has(top) || EXCLUDED_PATHS.has(rawRel)) continue;

    const rel = rawRel.startsWith("skills/swarm/")
      ? `skills/pstack-swarm/${rawRel.slice("skills/swarm/".length)}`
      : rawRel;

    const entry = readEntry(full);
    if (rel.endsWith(".md")) {
      const rewritten = rewriteSwarmRefs(rel, entry.bytes.toString("utf8"));
      entry.bytes = Buffer.from(rewritten, "utf8");
    }
    files.set(rel, entry);
  }

  // 2. Apply overlay files on top.
  for (const full of walk(OVERLAY)) {
    const rel = toPosix(relative(OVERLAY, full));
    const entry = readEntry(full);
    if (rel.endsWith(".sh")) entry.executable = true;
    files.set(rel, entry);
  }

  // 3. Inject Cursor-only warning in make-bot-ui/SKILL.md without duplicating upstream prose.
  const makeBotPath = "skills/make-bot-ui/SKILL.md";
  if (files.has(makeBotPath)) {
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

  // 4. Discover skills and validate Agent Skills naming + Cursor term coverage against docs/harness/antigravity.md.
  const skillNames = [...new Set(
    [...files.keys()]
      .filter((k) => /^skills\/[^/]+\/SKILL\.md$/.test(k))
      .map((k) => k.split("/")[1]),
  )].sort();

  const othersCache = new Map();
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

    if (ADAPTER_WRAP_EXEMPT.has(skill)) continue;

    const others = skillNames.filter((n) => n !== skill).join("|");
    othersCache.set(skill, others);
    const routeRe = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
    const linksToSkill = (line, name) => line.includes(`(../${name}/`);

    const used = new Set();
    for (const [path, entry] of files) {
      if (!path.startsWith(`skills/${skill}/`) || !path.endsWith(".md")) continue;
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
  for (const [key, users] of termUsers) {
    if (!adapterText.includes(key)) {
      problems.push(`Antigravity adapter (${ADAPTER}) is missing a row for ${key}, used by: ${users.join(", ")}`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }

  // 5. Inject Antigravity adapter line into every skill that references Cursor terms.
  const adapterLine =
    `In Antigravity, read [the Antigravity adapter](../../${ADAPTER}) once per session before following this skill. ` +
    "It maps Cursor tool names, paths, and model rules to Antigravity.";

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

  // 6. Rewrite relative links targeting excluded upstream paths (e.g. automations/benny) to upstream GitHub URLs.
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

  // 7. Verify no dangling relative links remain outside code fences.
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

if (process.argv.includes("--check")) {
  const onDisk = new Map(
    existsSync(OUT)
      ? walk(OUT).map((full) => [toPosix(relative(OUT, full)), readEntry(full)])
      : [],
  );
  const allKeys = [...new Set([...files.keys(), ...onDisk.keys()])].sort();
  const drifted = allKeys.filter((k) => {
    const want = files.get(k);
    const have = onDisk.get(k);
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  if (drifted.length > 0) {
    for (const d of drifted.slice(0, 30)) console.error(`DRIFT pstack/${d}`);
    console.error(`pstack/ is out of date (${drifted.length} files). Run \`${COMMAND}\` and commit.`);
    process.exit(1);
  }
  console.log(`OK pstack/ is up to date (${files.size} files, ${skillCount} skills, ${wrappedCount} with adapter pointer).`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [rel, { bytes, executable }] of files) {
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    chmodSync(dest, executable ? 0o755 : 0o644);
  }
  console.log(`Built pstack/ (${files.size} files, ${skillCount} skills, ${wrappedCount} with adapter pointer).`);
}
