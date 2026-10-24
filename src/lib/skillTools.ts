// Claude-style skills: the model loads a skill on demand (progressive disclosure) instead of having every
// playbook in its prompt. `Skill` loads one skill's full instructions, `search_skills` finds the right one.
import fs from "fs";
import path from "path";
import type { ToolDef } from "@/lib/agentTools";
import { listSkills, SKILLS_DIR, SKILLS_PYTHON, WORK_DIR, type SkillMeta } from "@/lib/skills";

const BODY_LIMIT = 60000;
const FILES_LIMIT = 60;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Resolves "pdf", "/pdf", "documents/pdf" or a close spelling to a skill. */
export function findSkill(query: string, list: SkillMeta[] = listSkills()): { skill?: SkillMeta; candidates: SkillMeta[] } {
  const raw = String(query || "").trim().replace(/^\//, "");
  if (!raw) return { candidates: [] };
  const q = norm(raw);
  const exact = list.filter((s) => s.name.toLowerCase() === raw.toLowerCase() || norm(s.name) === q || norm(`${s.category}/${s.name}`) === q);
  if (exact.length >= 1) return { skill: exact[0], candidates: exact };
  const pref = list.filter((s) => norm(s.name).startsWith(q));
  if (pref.length === 1) return { skill: pref[0], candidates: pref };
  const inc = list.filter((s) => norm(s.name).includes(q));
  if (inc.length === 1) return { skill: inc[0], candidates: inc };
  return { candidates: (pref.length ? pref : inc).slice(0, 8) };
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trimStart();
}

function bundledFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (out.length >= FILES_LIMIT || depth > 3) return;
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const e of ents) {
      if (out.length >= FILES_LIMIT) return;
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "__pycache__") continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (!(depth === 0 && e.name === "SKILL.md")) out.push(path.relative(dir, full));
    }
  };
  walk(dir, 0);
  return out;
}

/** The text handed to the model when a skill is loaded. */
export function loadSkillText(skill: SkillMeta, args?: string): string {
  let body = "";
  try {
    body = stripFrontmatter(fs.readFileSync(skill.skillMd, "utf8"));
  } catch (e: any) {
    return `Could not read ${skill.skillMd}: ${e?.message || e}`;
  }
  let note = "";
  if (body.length > BODY_LIMIT) {
    body = body.slice(0, BODY_LIMIT);
    note = `\n\n[Instructions truncated at ${BODY_LIMIT} characters. Read the rest of ${skill.skillMd} with Bash.]`;
  }
  const files = bundledFiles(skill.dir);
  const parts = [
    `Loaded skill: ${skill.name}${skill.category ? ` (${skill.category})` : ""}`,
    `Base directory: ${skill.dir}`,
    `Relative paths below are relative to the base directory. Python with document libraries: ${SKILLS_PYTHON}. Save deliverables under ${WORK_DIR}.`,
    "",
    body + note,
  ];
  if (files.length) parts.push("", "Bundled files (read or run them by absolute path when the instructions say so):", ...files.map((f) => `- ${f}`));
  if (args && args.trim()) parts.push("", `ARGUMENTS: ${args.trim()}`);
  return parts.join("\n");
}

function score(s: SkillMeta, tokens: string[]): number {
  const name = norm(s.name);
  const cat = norm(s.category);
  const desc = s.description.toLowerCase();
  let n = 0;
  for (const t of tokens) {
    if (name === t) n += 10;
    else if (name.includes(t)) n += 5;
    if (cat.includes(t)) n += 2;
    if (desc.includes(t)) n += 1;
  }
  return n;
}

export function searchSkills(query: string, limit = 8): SkillMeta[] {
  const tokens = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (!tokens.length) return [];
  return listSkills()
    .map((s) => ({ s, n: score(s, tokens) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}

export function buildSkillTools(): ToolDef[] {
  if (listSkills().length === 0) return [];
  return [
    {
      name: "Skill",
      label: "Skill",
      readOnly: true,
      description:
        "Load an expert skill's full instructions by name. Use it on your own initiative, without being asked: call it BEFORE starting any task a skill covers (documents, design, web/back-end, databases, testing, debugging, security, git, data, research, ...), then follow the instructions exactly. The result lists the skill's base directory and bundled files. If you are unsure of the name, call search_skills first.",
      parameters: {
        type: "object",
        properties: {
          skill: { type: "string", description: "Skill name, e.g. \"pdf\" or \"documents/pdf\"" },
          args: { type: "string", description: "Optional arguments or the user's request for the skill" },
        },
        required: ["skill"],
      },
      run: async (a) => {
        const { skill, candidates } = findSkill(String(a?.skill || ""));
        if (!skill) {
          const hint = candidates.length
            ? `Did you mean: ${candidates.map((c) => c.name).join(", ")}?`
            : "Use search_skills to find the right one.";
          return { output: `Unknown skill: ${a?.skill}. ${hint}`, isError: true };
        }
        return { output: loadSkillText(skill, a?.args) };
      },
    },
    {
      name: "search_skills",
      label: "Search skills",
      readOnly: true,
      description: "Search the skills library by keywords (task, file type, technology). Do this proactively whenever you are unsure which skill fits a request — before answering. Returns the best matching skill names with one-line descriptions; then load one with Skill.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Keywords, e.g. \"excel spreadsheet formulas\"" } },
        required: ["query"],
      },
      run: async (a) => {
        const hits = searchSkills(String(a?.query || ""));
        if (!hits.length) return { output: `No skills match "${a?.query}". Try other keywords.` };
        return {
          output: hits.map((s) => `- ${s.category ? s.category + "/" : ""}${s.name}: ${s.description.replace(/\s+/g, " ").slice(0, 200)}`).join("\n"),
        };
      },
    },
  ];
}

export { SKILLS_DIR };
