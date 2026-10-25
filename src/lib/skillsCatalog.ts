// Client-side skills catalog shared by the composer's "/" picker and Settings → Skills.
//
// One in-memory cache for the whole page session: once a category is loaded here, nothing refetches it just
// because a component remounted (closing/reopening Settings, switching tabs, opening the "/" menu). Only a
// real change on the computer — caught by the cheap background poll at the bottom — updates it again.
export interface SkillEntry {
  name: string;
  category: string;
  description: string;
}

type Listener = () => void;

// ---------------------------------------------------------------------------------------------------
// Full catalog (kept for callers that genuinely want every skill at once)
// ---------------------------------------------------------------------------------------------------
let cache: SkillEntry[] | null = null;
let inflight: Promise<SkillEntry[]> | null = null;

export async function fetchSkillsCatalog(): Promise<SkillEntry[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/skills", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      const list: SkillEntry[] = Array.isArray(j?.skills)
        ? j.skills.map((s: any) => ({ name: String(s.name || ""), category: String(s.category || ""), description: String(s.description || "") }))
        : [];
      if (list.length) cache = list;
      return list;
    })
    .catch(() => [] as SkillEntry[])
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

// ---------------------------------------------------------------------------------------------------
// Shared warm cache: category names + one category's skills at a time (never the full 3000+ in one go)
// ---------------------------------------------------------------------------------------------------
export interface SkillsMeta {
  /** Where the catalog came from: this process's filesystem, the owner's computer over HTTP, or nowhere. */
  source: "local" | "remote" | "none" | "";
  root: string;
}

let catCache: string[] | null = null;
let stamps: Record<string, number> = {};
let meta: SkillsMeta = { source: "", root: "" };
let failed = false; // the very first load could not reach the computer at all
const categoryCache = new Map<string, SkillEntry[]>();
let catInflight: Promise<string[]> | null = null;
const categoryInflight = new Map<string, Promise<SkillEntry[]>>();

const listeners = new Set<Listener>();
/** Called whenever the cache changes (a category or a skill appeared, or the status changed). */
export function onSkillsCacheChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notifyChange() {
  listeners.forEach((fn) => fn());
}

/** Network: category names + change stamps. Never replaces a good cache with an empty/unreachable answer. */
async function loadCategories(): Promise<string[]> {
  try {
    const r = await fetch("/api/skills?categories=1", { cache: "no-store" });
    const j = await r.json();
    const list: string[] = Array.isArray(j?.categories) ? j.categories.map(String) : [];
    if (!j?.ok || (j.source === "none" && !list.length)) throw new Error("unreachable");
    catCache = list;
    stamps = j.stamps && typeof j.stamps === "object" ? j.stamps : {};
    meta = { source: j.source || "", root: j.root || "" };
    failed = false;
    return list;
  } catch (e) {
    if (!catCache) failed = true;
    throw e;
  }
}

export async function fetchCategoryNames(): Promise<string[]> {
  if (catCache) return catCache;
  if (catInflight) return catInflight;
  catInflight = loadCategories()
    .catch(() => [] as string[])
    .finally(() => {
      catInflight = null;
    });
  return catInflight;
}

export function peekCategoryNames(): string[] | null {
  return catCache;
}

async function loadCategory(category: string): Promise<SkillEntry[]> {
  const r = await fetch(`/api/skills?category=${encodeURIComponent(category)}`, { cache: "no-store" });
  const j = await r.json();
  if (!Array.isArray(j?.skills)) throw new Error("bad response");
  const list: SkillEntry[] = j.skills.map((s: any) => ({
    name: String(s.name || ""),
    category: String(s.category || category),
    description: String(s.description || ""),
  }));
  categoryCache.set(category, list);
  return list;
}

export async function fetchSkillsInCategory(category: string): Promise<SkillEntry[]> {
  const hit = categoryCache.get(category);
  if (hit) return hit;
  const pending = categoryInflight.get(category);
  if (pending) return pending;
  const p = loadCategory(category)
    .catch(() => [] as SkillEntry[]) // a failed load is not cached, so the next attempt retries it
    .finally(() => {
      categoryInflight.delete(category);
    });
  categoryInflight.set(category, p);
  return p;
}

export function peekSkillsInCategory(category: string): SkillEntry[] | null {
  return categoryCache.get(category) || null;
}

export function peekSkillsMeta(): SkillsMeta {
  return meta;
}

/** True when nothing could be loaded at all and the computer looks unreachable. */
export function skillsLoadFailed(): boolean {
  return failed && !catCache;
}

let prefetching = false;
/**
 * Warms the whole cache, a few categories at a time (never the full catalog in one request). Called as soon as
 * Settings opens, whichever tab is showing, so Skills is already there by the time it is visited. Safe to call
 * repeatedly: anything already cached is skipped, so reopening Settings costs nothing.
 */
export function prefetchAllSkills(): void {
  if (prefetching) return;
  prefetching = true;
  (async () => {
    const cats = await fetchCategoryNames();
    notifyChange();
    const queue = cats.filter((c) => !categoryCache.has(c));
    const worker = async () => {
      for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
        await fetchSkillsInCategory(c);
        notifyChange(); // one category's worth of progress at a time — smooth, not one big jump
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  })()
    .catch(() => {})
    .finally(() => {
      prefetching = false;
      notifyChange();
    });
}

/** Retry after "could not reach your computer". */
export function retrySkills(): void {
  failed = false;
  notifyChange();
  prefetchAllSkills();
}

function sameSkills(a: SkillEntry[], b: SkillEntry[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Map(a.map((s) => [s.name, s.description]));
  return b.every((s) => seen.get(s.name) === s.description);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollRefs = 0;
let ticking = false;
let visListener: (() => void) | null = null;

async function tick() {
  if (ticking || (typeof document !== "undefined" && document.hidden)) return;
  if (!catCache) return; // nothing loaded yet — prefetchAllSkills owns the first load
  ticking = true;
  try {
    const prevCats = catCache;
    const prevStamps = stamps;
    const fresh = await loadCategories(); // cheap: names + stamps only
    let changed = fresh.length !== prevCats.length || fresh.some((c) => !prevCats.includes(c));
    for (const c of [...categoryCache.keys()]) {
      if (!fresh.includes(c)) {
        categoryCache.delete(c);
        changed = true;
      }
    }
    // Only categories that are new, never loaded, or whose folder changed are re-read.
    for (const c of fresh) {
      if (categoryCache.has(c) && stamps[c] === prevStamps[c]) continue;
      try {
        const before = categoryCache.get(c);
        const after = await loadCategory(c);
        if (!before || !sameSkills(before, after)) changed = true;
      } catch {
        /* try again next tick */
      }
    }
    if (changed) notifyChange();
  } catch {
    /* a transient failure just means we try again next tick */
  } finally {
    ticking = false;
  }
}

/**
 * Watches the computer for newly added skills/categories while at least one component cares (Settings open,
 * or the "/" menu open). Checks a tiny stamp request every few seconds and re-reads only what changed;
 * existing skills are left untouched (no flicker) so the UI can fade just the new ones in. Reference-counted:
 * polling only stops once every caller has stopped.
 */
export function watchForNewSkills(intervalMs = 4000): () => void {
  pollRefs++;
  if (!pollTimer) {
    pollTimer = setInterval(tick, intervalMs);
    if (typeof document !== "undefined") {
      visListener = () => {
        if (!document.hidden) tick();
      };
      document.addEventListener("visibilitychange", visListener);
    }
    tick();
  }
  return () => {
    pollRefs = Math.max(0, pollRefs - 1);
    if (pollRefs === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      if (visListener && typeof document !== "undefined") document.removeEventListener("visibilitychange", visListener);
      visListener = null;
    }
  };
}
