import fs from "fs";
import os from "os";
import path from "path";

function resolveSkillsDir(): string {
  if (process.env.MRAI_SKILLS_DIR) return process.env.MRAI_SKILLS_DIR;
  const candidates = [
    path.join(os.homedir(), "MR", "mrai", "skills"),
    path.join(process.cwd(), "skills"),
    path.join(process.cwd(), "..", "skills"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return path.resolve(c);
    } catch {}
  }
  return path.join(process.cwd(), "skills");
}

/** Runtime skills root. Absolute so model can run scripts/. */
export const SKILLS_DIR = resolveSkillsDir();

/** Python venv with document packages (openpyxl, pdfplumber, …). */
export const SKILLS_PYTHON =
  process.env.MRAI_SKILLS_PYTHON ||
  (fs.existsSync(path.join(os.homedir(), "MR", "mrai", ".venv-skills", "bin", "python"))
    ? path.join(os.homedir(), "MR", "mrai", ".venv-skills", "bin", "python")
    : "python3");

export interface SkillMeta {
  name: string;
  description: string;
  dir: string;
  skillMd: string;
  /** Category folder name (empty = uncategorised skill at the root). */
  category: string;
}

function parseFrontmatter(raw: string): { name?: string; description?: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  let key = "";
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1].toLowerCase();
      let v = kv[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[key] = v;
    } else if (key && line.match(/^\s+/) && out[key] !== undefined) {
      out[key] += " " + line.trim();
    }
  }
  return { name: out.name, description: out.description };
}

function readHead(p: string, n = 8192): string {
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.alloc(n);
    const len = fs.readSync(fd, buf, 0, n, 0);
    return buf.toString("utf8", 0, len);
  } finally {
    fs.closeSync(fd);
  }
}

function readSkill(dir: string, category: string, fallbackName: string): SkillMeta | null {
  const skillMd = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillMd)) return null;
  const fm = parseFrontmatter(readHead(skillMd));
  const name = (fm.name || fallbackName).trim();
  const description = (fm.description || "").trim() || `Skill: ${name}`;
  return { name, description, dir, skillMd, category };
}

const hidden = (n: string) => n.startsWith("_") || n.startsWith(".");
let _cache: { at: number; list: SkillMeta[] } | null = null;

/**
 * Reads the skills root on disk. Layout: <root>/<category>/<skill>/SKILL.md
 * (the old flat <root>/<skill>/SKILL.md layout also works). Cached for 15 seconds.
 */
export function listSkills(): SkillMeta[] {
  if (_cache && Date.now() - _cache.at < 15000) return _cache.list;
  try {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    const out: SkillMeta[] = [];
    for (const e of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!e.isDirectory() || hidden(e.name)) continue;
      const dir = path.join(SKILLS_DIR, e.name);
      const flat = readSkill(dir, "", e.name);
      if (flat) {
        out.push(flat);
        continue;
      }
      for (const c of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!c.isDirectory() || hidden(c.name)) continue;
        const m = readSkill(path.join(dir, c.name), e.name, c.name);
        if (m) out.push(m);
      }
    }
    out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    _cache = { at: Date.now(), list: out };
    return out;
  } catch {
    return [];
  }
}

/** Where the agent keeps its work and deliverables (the owner's computer: ~/MR/mrai/work). */
export const WORK_DIR = process.env.MRAI_WORK_DIR || path.join(os.homedir(), "MR", "mrai", "work");

const SKILLS_MARKER = "SKILLS (expert playbooks)";

/** Compact catalog for the system prompt: category -> skill names (descriptions live in INDEX.md / search_skills). */
export function buildSkillsPromptSection(skills?: SkillMeta[]): string {
  const list = skills ?? listSkills();
  if (list.length === 0) return "";
  const cats = new Map<string, string[]>();
  for (const s of list) {
    const c = s.category || "(uncategorised)";
    if (!cats.has(c)) cats.set(c, []);
    cats.get(c)!.push(s.name);
  }
  const lines = [
    SKILLS_MARKER,
    "## Skills",
    "Skills are expert, battle-tested playbooks stored on this computer. They make you far more capable: each one encodes the correct way to do a specialised task, plus ready-to-run scripts. Use them proactively — this is a core part of how you work, not an optional extra.",
    "",
    "HOW TO USE THEM (do this on your own, without being asked):",
    "1. For EVERY request, first decide — silently — whether a skill could help. Any task touching files or formats (Word/Excel/PowerPoint/PDF/CSV/images), UI or design, web/back-end/APIs, databases, DevOps/cloud, testing, debugging, code quality, security, git, data, research, SEO, marketing, automation, documents, or anything that looks like specialised/expert work: assume a skill probably exists.",
    "2. If a skill plausibly fits, LOAD it before doing the work — do not wait for the user to mention skills. Pick the best match from the catalog below and open it with the `Skill` tool.",
    "3. If you are not sure which one fits, call `search_skills` with a few keywords FIRST, read the matches, then load the most specific skill. When several could apply, prefer the most specific over the general one.",
    "4. Read the loaded SKILL.md in full and follow its instructions exactly, step by step. A skill may point to other files or skills — open and read those too, as it says.",
    "5. Run a skill's bundled scripts by their absolute path (the `Skill` tool prints the skill's base directory; its relative paths are relative to that). Use the Python below for scripts that need document libraries.",
    "6. Do the search/load quietly as part of working — no need to announce it or ask permission. Just use the skill and get the task done well.",
    "",
    "RULES:",
    "- Never claim you followed a skill you did not actually load and read.",
    "- Do not load skills for plain casual conversation (greetings, small talk).",
    "- When the user types /skill-name or names a skill, load exactly that one.",
    "- If no skill fits, proceed with your own best judgement — but check first.",
    `- Python with document libraries (openpyxl, pdfplumber, python-docx, pptx, ...): ${SKILLS_PYTHON}`,
    `- Save deliverables under ${WORK_DIR}`,
    "",
    `Available skills (${list.length}) by category — load any of these by name with the \`Skill\` tool, or call \`search_skills\` to find more by keyword:`,
  ];
  for (const [c, names] of [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- ${c}: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

/** Appends the skills section to the end of the system prompt (when there are skills). */
export function withSkillsCatalog(system: string): string {
  const section = buildSkillsPromptSection();
  if (!section) return system;
  if (system.includes(SKILLS_MARKER)) return system;
  return system.trimEnd() + "\n\n" + section;
}
