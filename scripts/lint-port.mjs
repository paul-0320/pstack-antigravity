#!/usr/bin/env node
// Packaging linter for the Antigravity pstack port.
// Catches portability defects, hardcoded machine paths, external wrapper paths,
// leftover mechanical Cursor/Claude Code strings, unported agents, and broken metadata.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "pstack");
const OVERLAY = join(ROOT, "overlay");
const ADAPTER_REL = "pstack/docs/harness/antigravity.md";

const BINARY_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf", ".zip"]);

const FORBIDDEN_PATTERNS = [
  { label: "macOS user home path", re: /\/Users\/(?!you\/|user\/|username\/|alice\/|bob\/)[A-Za-z0-9._-]+\// },
  { label: "Linux user home path", re: /\/home\/(?!you\/|user\/|username\/|alice\/|bob\/)[A-Za-z0-9._-]+\// },
  { label: "Windows user home path", re: /[A-Za-z]:\\Users\\(?!you\\|user\\|username\\)[A-Za-z0-9._-]+\\/i },
  { label: "external local bin wrapper path", re: /~\/\.gemini\/bin\/|~\/\.claude\/scripts\// },
  { label: "personal email address", re: /[A-Za-z0-9._%+-]+@(?:gmail|naver|daum|hanmail|kakao)\.com/i },
];

// Mechanical 1:1 patterns that must not survive in pstack/ outside docs/harness/antigravity.md.
const LEFTOVER_CURSOR_PATTERNS = [
  { label: "unreplaced AskQuestion", re: /\bAskQuestion\b/ },
  { label: "unreplaced .cursor/skills/", re: /\.cursor\/skills\// },
  { label: "unreplaced ~/.cursor/plugins/", re: /~\/\.cursor\/plugins\// },
  { label: "unreplaced .cursor/worktrees/", re: /\.cursor\/worktrees\// },
  { label: "unreplaced pstack-models.mdc", re: /pstack-models\.mdc/ },
  { label: "leftover Claude Code install guidance", re: /\bClaude Code\b/ },
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      if (name === ".DS_Store" || name === ".git" || name === "node_modules") return [];
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

function isBinary(path) {
  const lower = path.toLowerCase();
  return [...BINARY_EXTS].some((ext) => lower.endsWith(ext));
}

const failures = [];
const fail = (msg) => failures.push(msg);

// 1. Scan pstack/, overlay/, and root README.md for non-relocatable paths or personal leaks.
const scanTargets = [
  ...walk(PLUGIN),
  ...walk(OVERLAY),
  ...(existsSync(join(ROOT, "README.md")) ? [join(ROOT, "README.md")] : []),
];

for (const full of scanTargets) {
  if (isBinary(full)) continue;
  const rel = relative(ROOT, full);
  const text = readFileSync(full, "utf8");
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    const match = text.match(re);
    if (match) {
      fail(`portability/leak (${label}) in ${rel}: matched ${JSON.stringify(match[0])}`);
    }
  }
  if (rel.startsWith("pstack/") && rel.endsWith(".md") && rel !== ADAPTER_REL) {
    for (const { label, re } of LEFTOVER_CURSOR_PATTERNS) {
      const match = text.match(re);
      if (match) {
        fail(`${label} in ${rel}: matched ${JSON.stringify(match[0])}`);
      }
    }
  }
}

// 2. Manifest checks (pstack/plugin.json).
const manifestPath = join(PLUGIN, "plugin.json");
if (!existsSync(manifestPath)) {
  fail("missing pstack/plugin.json");
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    fail(`invalid JSON in pstack/plugin.json: ${err.message}`);
  }
  if (manifest) {
    if (manifest.name !== "pstack") fail(`plugin.json name must be "pstack", got ${JSON.stringify(manifest.name)}`);
    if (manifest.license !== "MIT") fail(`plugin.json license must be "MIT", got ${JSON.stringify(manifest.license)}`);
    if (!/^\d+\.\d+\.\d+\+agy\.\d+$/.test(manifest.version ?? "")) {
      fail(`plugin.json version ${JSON.stringify(manifest.version)} must match <upstream>+agy.<rev> (SemVer build metadata, not pre-release)`);
    }
    if (!manifest.logo || !existsSync(join(PLUGIN, manifest.logo))) {
      fail(`plugin.json logo missing on disk: ${JSON.stringify(manifest.logo)}`);
    }
    if (typeof manifest.repository !== "string" || !manifest.repository.includes("paul-0320")) {
      fail(`plugin.json repository should point to paul-0320 fork, got ${JSON.stringify(manifest.repository)}`);
    }
  }
}

// 3. License and attribution checks.
const licensePath = join(PLUGIN, "LICENSE");
if (!existsSync(licensePath)) {
  fail("missing pstack/LICENSE");
} else {
  const lic = readFileSync(licensePath, "utf8");
  if (!lic.includes("MIT License") || !lic.includes("Lauren Tan")) {
    fail("pstack/LICENSE must preserve Lauren Tan's MIT copyright notice");
  }
}

const readmePath = join(PLUGIN, "README.md");
if (!existsSync(readmePath)) {
  fail("missing pstack/README.md");
} else {
  const rm = readFileSync(readmePath, "utf8");
  if (/^i'm \[poteto\]/im.test(rm)) {
    fail("pstack/README.md still uses upstream author's first-person voice");
  }
  if (!/unofficial/i.test(rm) || !rm.includes("Lauren Tan")) {
    fail("pstack/README.md must declare unofficial port status and credit Lauren Tan");
  }
}

// 4. Antigravity runtime invariants.
if (existsSync(join(PLUGIN, "skills", "swarm"))) {
  fail("pstack/skills/swarm exists (collides with Antigravity built-in /swarm); must be renamed to skills/pstack-swarm");
}
for (const full of walk(join(PLUGIN, "skills"))) {
  if (!full.endsWith(".md")) continue;
  const rel = relative(ROOT, full);
  if (/(^|[\s`("'])\/swarm(?=$|[\s`.,;:)?"'])/m.test(readFileSync(full, "utf8"))) {
    fail(`unrenamed /swarm command reference in ${rel}`);
  }
}

const pstackSwarmPath = join(PLUGIN, "skills", "pstack-swarm", "SKILL.md");
if (!existsSync(pstackSwarmPath)) {
  fail("missing pstack/skills/pstack-swarm/SKILL.md");
} else if (!/^name:\s*pstack-swarm\s*$/m.test(readFileSync(pstackSwarmPath, "utf8"))) {
  fail("pstack/skills/pstack-swarm/SKILL.md frontmatter must declare name: pstack-swarm");
}

const rulePath = join(PLUGIN, "rules", "pstack-models.md");
if (!existsSync(rulePath)) {
  fail("missing pstack/rules/pstack-models.md");
} else {
  const rule = readFileSync(rulePath, "utf8");
  if (!/^---\n[\s\S]*?trigger:\s*model_decision[\s\S]*?\n---/.test(rule)) {
    fail("pstack/rules/pstack-models.md must declare trigger: model_decision frontmatter");
  }
  if (!rule.includes("~/.gemini/config/pstack-models.md")) {
    fail("pstack/rules/pstack-models.md must reference drop-in override ~/.gemini/config/pstack-models.md");
  }
}

// Dynamically validate EVERY agent file under pstack/agents/ so newly added upstream agents cannot slip past CI.
const agentFiles = walk(join(PLUGIN, "agents")).filter((f) => f.endsWith(".md"));
if (agentFiles.length === 0) {
  fail("no agent files found in pstack/agents/");
}
for (const full of agentFiles) {
  const rel = relative(ROOT, full);
  const text = readFileSync(full, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  if (!fm) {
    fail(`${rel} missing YAML frontmatter`);
    continue;
  }
  if (!/^subagent:\s*true\s*$/m.test(fm)) {
    fail(`${rel} missing Antigravity frontmatter 'subagent: true' (add an Antigravity overlay in overlay/agents/)`);
  }
  if (!/^model:\s*(?:inherit|flash|flash_lite|pro)\s*$/m.test(fm)) {
    fail(`${rel} has invalid Antigravity agent model tier in frontmatter (must be inherit/flash/flash_lite/pro)`);
  }
  if (!/^tools:\s*\[/m.test(fm)) {
    fail(`${rel} missing Antigravity 'tools: [...]' frontmatter`);
  }
}

const auditScript = join(PLUGIN, "skills", "poteto-mode", "scripts", "worktree-audit.sh");
if (!existsSync(auditScript)) {
  fail("missing worktree-audit.sh");
} else {
  if ((statSync(auditScript).mode & 0o111) === 0) fail("worktree-audit.sh is not executable");
  try {
    execFileSync("bash", ["-n", auditScript], { stdio: "pipe" });
  } catch (err) {
    fail(`worktree-audit.sh failed bash -n: ${err.stderr?.toString() ?? err.message}`);
  }
}

// 5. Optional Antigravity CLI strict validation.
if (process.argv.includes("--with-agy")) {
  try {
    execFileSync("agy", ["plugin", "validate", PLUGIN, "--strict"], { stdio: "inherit" });
  } catch {
    fail("agy plugin validate ./pstack --strict failed");
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`LINT FAIL: ${f}`);
  process.exit(1);
}

console.log(`LINT PASS (${scanTargets.length} files scanned, ${agentFiles.length} agents checked, 0 leaks, all Antigravity invariants verified).`);
