import fs from "fs";
import os from "os";
import path from "path";
import { serverFetch } from "@/lib/serverAuth";

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

let _remoteCache: { at: number; list: SkillMeta[] } | null = null;

/** Same catalog, fetched from the owner's real computer over HTTP (the Python server). */
async function listSkillsRemote(): Promise<SkillMeta[]> {
  if (_remoteCache && Date.now() - _remoteCache.at < 15000) return _remoteCache.list;
  const res = await serverFetch(undefined, "/skills", { method: "GET", timeoutMs: 10000 });
  const list: SkillMeta[] = (Array.isArray(res?.skills) ? res.skills : []).map((s: any) => ({
    name: String(s.name || ""),
    description: String(s.description || ""),
    dir: String(s.dir || ""),
    skillMd: path.join(String(s.dir || ""), "SKILL.md"),
    category: String(s.category || ""),
  }));
  _remoteCache = { at: Date.now(), list };
  return list;
}

/**
 * The skills catalog, resolved for wherever this process runs: the local filesystem when the skills
 * folder is reachable here (the normal self-hosted deployment), otherwise fetched from the owner's real
 * computer over HTTP — so a frontend hosted elsewhere (e.g. Vercel) still sees the real skills library.
 */
export async function getSkillsAsync(): Promise<SkillMeta[]> {
  const local = listSkills();
  if (local.length) return local;
  try {
    return await listSkillsRemote();
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
  // Data only (not behavioural instruction — that lives in the visible system prompt): the list of skills
  // currently installed, plus the Python to run skill scripts. How to use skills is set in Settings → General.
  const lines = [
    SKILLS_MARKER,
    `AVAILABLE SKILLS (${list.length}) — load by name with \`Skill\`, or find more with \`search_skills\`. Skill scripts run with: ${SKILLS_PYTHON}`,
  ];
  for (const [c, names] of [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- ${c}: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

/** Appends the skills section to the end of the system prompt (when there are skills). */
export function withSkillsCatalog(system: string, skills?: SkillMeta[]): string {
  const section = buildSkillsPromptSection(skills);
  if (!section) return system;
  if (system.includes(SKILLS_MARKER)) return system;
  return system.trimEnd() + "\n\n" + section;
}
