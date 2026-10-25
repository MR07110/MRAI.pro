"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { Empty, SectionHead, ui } from "./ui";

type Skill = {
  name: string;
  category?: string;
  description: string;
  dir: string;
  skillMd: string;
};

export default function SkillsPanel() {
  // Category names arrive first (near-instant), then each category's own skills load one at a time,
  // in order — never one big fetch for the whole (3000+) catalog. The page shows real rows immediately
  // and fills them in top to bottom, instead of a blank panel until everything is ready.
  const [categories, setCategories] = useState<string[]>([]);
  const [bySkill, setBySkill] = useState<Record<string, Skill[]>>({});
  const [pendingCat, setPendingCat] = useState<string | null>(null);
  const [root, setRoot] = useState("");
  // Whether the catalog came from this process's own filesystem, was fetched from the owner's real
  // computer over HTTP (e.g. this copy is hosted on Vercel), or neither could be reached.
  const [source, setSource] = useState<"local" | "remote" | "none">("local");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      try {
        const r = await fetch("/api/skills?categories=1");
        const j = await r.json();
        if (cancelledRef.current) return;
        if (!j.ok) {
          setErr(j.error || "Failed to load");
          setLoading(false);
          return;
        }
        const cats: string[] = j.categories || [];
        setCategories(cats);
        setRoot(j.root || "");
        setSource(j.source || "local");
        setLoading(false); // the page is "loaded" as soon as the category shells are known

        for (const c of cats) {
          if (cancelledRef.current) return;
          setPendingCat(c);
          try {
            const rc = await fetch(`/api/skills?category=${encodeURIComponent(c)}`);
            const jc = await rc.json();
            if (cancelledRef.current) return;
            setBySkill((m) => ({ ...m, [c]: jc.skills || [] }));
          } catch {
            if (!cancelledRef.current) setBySkill((m) => ({ ...m, [c]: m[c] || [] }));
          }
        }
        if (!cancelledRef.current) setPendingCat(null);
      } catch (e: any) {
        if (!cancelledRef.current) {
          setErr(e?.message || "Error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const allLoaded = categories.length > 0 && categories.every((c) => c in bySkill);
  const totalSkills = useMemo(() => Object.values(bySkill).reduce((n, l) => n + l.length, 0), [bySkill]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return categories.map((cat) => {
      const list = (bySkill[cat] || []).filter(
        (s) => !needle || (s.name + " " + s.description + " " + cat).toLowerCase().includes(needle)
      );
      return [cat, list] as const;
    });
  }, [categories, bySkill, q]);
  const visibleGroups = q.trim() ? groups.filter(([, list]) => list.length > 0) : groups;

  if (loading) return <p className={ui.hint}>Loading skills…</p>;
  if (err) return <p className="text-[12px] text-red-400">{err}</p>;

  // Where new skills get added — only meaningful on the owner's real computer. When this copy is remote
  // (fetched over HTTP, or the real computer couldn't be reached at all), showing that raw local path
  // (e.g. a serverless /var/task) would be confusing and is not somewhere a skill could ever be added.
  const newSkillHint =
    source === "local" ? (
      <>Add a SKILL.md to <span className="font-mono">{root || "~/MR/mrai/skills"}</span>.</>
    ) : source === "remote" ? (
      <>This copy runs elsewhere; skills are fetched live from your own computer. Add a SKILL.md there, under <span className="font-mono">~/MR/mrai/skills</span>.</>
    ) : (
      <>Could not reach your computer to load skills. Check that it&apos;s online and reachable.</>
    );

  return (
    <div>
      <SectionHead
        title="Skills"
        hint={
          <>
            Expert playbooks stored on your own computer. The AI loads a skill with its <code className="text-neutral-300">Skill</code> tool before specialised work, or when you type{" "}
            <code className="text-neutral-300">/skill-name</code>. {totalSkills}
            {allLoaded ? "" : "+"} skills · {categories.length} categories.
          </>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills…" className={`${ui.input} pl-9`} />
      </div>

      {categories.length === 0 ? (
        <Empty title="No skills yet" hint={newSkillHint} />
      ) : visibleGroups.length === 0 ? (
        <Empty title="Nothing found" hint="Try another keyword." />
      ) : (
        <div className="space-y-2">
          {visibleGroups.map(([cat, list], idx) => {
            const isOpen = q.trim().length > 0 || !!open[cat];
            const catLoading = !(cat in bySkill);
            return (
              // Rows appear top to bottom as their category's skills arrive — a small per-row delay on
              // the shell itself keeps even the instant category names from all popping in at once.
              <div key={cat} className={`${ui.card} fade-up`} style={{ animationDelay: `${Math.min(idx * 40, 600)}ms` }}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))}
                  className="w-full flex items-center gap-2 h-10 px-3.5 text-left cursor-pointer hover:bg-white/[0.04] transition"
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-[13px] text-neutral-100">{cat}</span>
                  {catLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-neutral-600 animate-spin" />
                  ) : (
                    <span className="text-[11px] font-mono text-neutral-500">{list.length}</span>
                  )}
                </button>
                {isOpen && (
                  // A category can hold hundreds of skills (e.g. ai-agents: 245) — keep the expanded list
                  // inside its own scrollable box, with real height, instead of growing the whole page.
                  <ul className="border-t border-white/15 divide-y divide-white/10 max-h-80 overflow-y-auto">
                    {catLoading ? (
                      <li className="px-3.5 py-3 text-[12px] text-neutral-500 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                      </li>
                    ) : (
                      list.map((s) => (
                        <li key={cat + "/" + s.name} className="px-3.5 py-3">
                          <span className="text-[13px] font-medium text-neutral-100 font-mono">/{s.name}</span>
                          <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">{s.description}</p>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className={`${ui.hint} mt-5`}>
        {source === "local" ? (
          <>New skill: <span className="font-mono text-neutral-400">{root || "~/MR/mrai/skills"}/&lt;category&gt;/&lt;name&gt;/SKILL.md</span>. </>
        ) : (
          <>New skill (on your computer): <span className="font-mono text-neutral-400">~/MR/mrai/skills/&lt;category&gt;/&lt;name&gt;/SKILL.md</span>. </>
        )}
        Skills live only on your computer and never go to GitHub.
        {pendingCat && <> Loading <span className="font-mono">{pendingCat}</span>…</>}
      </p>
    </div>
  );
}
