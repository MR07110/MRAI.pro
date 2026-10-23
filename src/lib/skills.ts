import fs from "fs";
import path from "path";

function resolveSkillsDir(): string {
  if (process.env.MRAI_SKILLS_DIR) return process.env.MRAI_SKILLS_DIR;
  const candidates = [
    "/home/muhamad/MR/mrai/skills",
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
  (fs.existsSync("/home/muhamad/MR/mrai/.venv-skills/bin/python")
    ? "/home/muhamad/MR/mrai/.venv-skills/bin/python"
    : "python3");

export interface SkillMeta {
  name: string;
  description: string;
  dir: string;
  skillMd: string;
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

/** Diskdagi skills/ papkasini o'qiydi. Faqat SKILL.md bor papkalar. */
export function listSkills(): SkillMeta[] {
  try {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const out: SkillMeta[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(SKILLS_DIR, e.name);
      const skillMd = path.join(dir, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      const raw = fs.readFileSync(skillMd, "utf8");
      const fm = parseFrontmatter(raw);
      const name = (fm.name || e.name).trim();
      const description = (fm.description || "").trim() || `Skill: ${name}`;
      out.push({ name, description, dir, skillMd });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  } catch {
    return [];
  }
}

/** System promptga qo'shiladigan qisqa katalog (to'liq SKILL.md emas). */
export function buildSkillsPromptSection(skills?: SkillMeta[]): string {
  const list = skills ?? listSkills();
  if (list.length === 0) return "";
  const lines = [
    "SKILLS (ixtiyoriy qobiliyatlar)",
    "Maxsus ish (Word, Excel, PDF, PowerPoint, UI dizayn, MCP, test, skill yozish) uchun avval tegishli skillning SKILL.md faylini Read bilan o'qing, keyin undagi ko'rsatmalarga amal qiling. Skriptlar skill papkasiga nisbatan — ishga tushirishdan oldin cd qiling yoki absolyut yo'l bering.",
    `Skills ildiz: ${SKILLS_DIR}`,
    `Hujjat skriptlari uchun Python: ${SKILLS_PYTHON}`,
    `Chiqish papkasi: /home/muhamad/MR/mrai/workspace/outputs`,
    "",
    "Mavjud skilllar:",
  ];
  for (const s of list) {
    // description uzun bo'lsa qisqartirish — 120B routing chalkashmasin
    const desc = s.description.length > 220 ? s.description.slice(0, 217) + "…" : s.description;
    lines.push(`- ${s.name}: ${desc}`);
    lines.push(`  path: ${s.skillMd}`);
  }
  lines.push("");
  lines.push(
    "Foydalanuvchi ‘/skill-name’ yoki ‘X skillini o\'qi’ desa, path dagi SKILL.md ni Read qiling. Oddiy suhbatda skill chaqirmang."
  );
  return lines.join("\n");
}

/** System prompt oxiriga skills bo'limini qo'shadi (agar bo'sh bo'lmasa). */
export function withSkillsCatalog(system: string): string {
  const section = buildSkillsPromptSection();
  if (!section) return system;
  if (system.includes("SKILLS (ixtiyoriy qobiliyatlar)")) return system;
  return system.trimEnd() + "\n\n" + section;
}
