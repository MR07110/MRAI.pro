// Client-side skills catalog for the composer's "/" slash-command menu. Fetched once (lazily, on first
// use) and cached in memory for the rest of the session — the catalog rarely changes while chatting.
export interface SkillEntry {
  name: string;
  category: string;
  description: string;
}

let cache: SkillEntry[] | null = null;
let inflight: Promise<SkillEntry[]> | null = null;

export async function fetchSkillsCatalog(): Promise<SkillEntry[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/skills", { cache: "force-cache" })
    .then((r) => r.json())
    .then((j) => {
      const list: SkillEntry[] = Array.isArray(j?.skills)
        ? j.skills.map((s: any) => ({ name: String(s.name || ""), category: String(s.category || ""), description: String(s.description || "") }))
        : [];
      cache = list;
      return list;
    })
    .catch(() => [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Already-loaded catalog, if any (for a synchronous first render before the fetch resolves). */
export function peekSkillsCatalog(): SkillEntry[] | null {
  return cache;
}

function score(s: SkillEntry, q: string): number {
  const name = s.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80 - name.length * 0.1;
  if (name.includes(q)) return 50 - name.length * 0.1;
  if (s.category.toLowerCase().includes(q)) return 20;
  if (s.description.toLowerCase().includes(q)) return 10;
  return 0;
}

/** Top matches for the partial text typed after "/", best first. Empty query -> first N alphabetically. */
export function filterSkills(list: SkillEntry[], query: string, limit = 8): SkillEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  return list
    .map((s) => ({ s, n: score(s, q) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}

// ---- Two-level "/category/skill" picker: category names first (cheap), then one category's skills,
// fetched lazily and cached per category — the same progressive-loading endpoints the Skills settings
// panel uses, so typing "/" never pulls the whole 3000+ catalog just to show the top-level menu. ----

let catCache: string[] | null = null;
let catInflight: Promise<string[]> | null = null;

export async function fetchCategoryNames(): Promise<string[]> {
  if (catCache) return catCache;
  if (catInflight) return catInflight;
  const p: Promise<string[]> = fetch("/api/skills?categories=1", { cache: "force-cache" })
    .then((r) => r.json())
    .then((j) => {
      const list: string[] = Array.isArray(j?.categories) ? j.categories.map(String) : [];
      catCache = list;
      return list;
    })
    .catch(() => [])
    .finally(() => {
      catInflight = null;
    });
  catInflight = p;
  return p;
}

export function peekCategoryNames(): string[] | null {
  return catCache;
}

const categoryCache = new Map<string, SkillEntry[]>();
const categoryInflight = new Map<string, Promise<SkillEntry[]>>();

export async function fetchSkillsInCategory(category: string): Promise<SkillEntry[]> {
  const hit = categoryCache.get(category);
  if (hit) return hit;
  const pending = categoryInflight.get(category);
  if (pending) return pending;
  const p = fetch(`/api/skills?category=${encodeURIComponent(category)}`, { cache: "force-cache" })
    .then((r) => r.json())
    .then((j) => {
      const list: SkillEntry[] = Array.isArray(j?.skills)
        ? j.skills.map((s: any) => ({ name: String(s.name || ""), category: String(s.category || category), description: String(s.description || "") }))
        : [];
      categoryCache.set(category, list);
      return list;
    })
    .catch(() => [] as SkillEntry[])
    .finally(() => {
      categoryInflight.delete(category);
    });
  categoryInflight.set(category, p);
  return p;
}

export function peekSkillsInCategory(category: string): SkillEntry[] | null {
  return categoryCache.get(category) || null;
}

/** Top matching category names, best first. Empty query -> all, alphabetical. */
export function filterCategoryNames(names: string[], query: string, limit = 12): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...names].sort((a, b) => a.localeCompare(b)).slice(0, limit);
  return names
    .filter((n) => n.toLowerCase().includes(q))
    .sort((a, b) => {
      const aw = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bw = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aw - bw || a.localeCompare(b);
    })
    .slice(0, limit);
}
