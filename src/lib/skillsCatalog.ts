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
