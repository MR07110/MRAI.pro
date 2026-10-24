"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Empty, SectionHead, ui } from "./ui";

type Skill = {
  name: string;
  category?: string;
  description: string;
  dir: string;
  skillMd: string;
};

export default function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [root, setRoot] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/skills");
        const j = await r.json();
        if (cancelled) return;
        if (!j.ok) setErr(j.error || "Failed to load");
        else {
          setSkills(j.skills || []);
          setRoot(j.root || "");
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const m = new Map<string, Skill[]>();
    for (const s of skills) {
      if (needle && !(s.name + " " + s.description + " " + (s.category || "")).toLowerCase().includes(needle)) continue;
      const c = s.category || "other";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills, q]);

  if (loading) return <p className={ui.hint}>Loading skills…</p>;
  if (err) return <p className="text-[12px] text-red-400">{err}</p>;

  const cats = new Set(skills.map((s) => s.category || "other")).size;

  return (
    <div>
      <SectionHead
        title="Skills"
        hint={
          <>
            Expert playbooks stored on your computer. The AI loads a skill with its <code className="text-neutral-300">Skill</code> tool before specialised work, or when you type{" "}
            <code className="text-neutral-300">/skill-name</code>. {skills.length} skills · {cats} categories.
          </>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills…" className={`${ui.input} pl-9`} />
      </div>

      {skills.length === 0 ? (
        <Empty title="No skills yet" hint={<>Add a SKILL.md to <span className="font-mono">{root || "~/MR/mrai/skills"}</span>.</>} />
      ) : groups.length === 0 ? (
        <Empty title="Nothing found" hint="Try another keyword." />
      ) : (
        <div className="space-y-2">
          {groups.map(([cat, list]) => {
            const isOpen = q.trim().length > 0 || !!open[cat];
            return (
              <div key={cat} className={ui.card}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))}
                  className="w-full flex items-center gap-2 h-10 px-3.5 text-left cursor-pointer hover:bg-white/[0.04] transition"
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-[13px] text-neutral-100">{cat}</span>
                  <span className="text-[11px] font-mono text-neutral-500">{list.length}</span>
                </button>
                {isOpen && (
                  <ul className="border-t border-white/15 divide-y divide-white/10">
                    {list.map((s) => (
                      <li key={cat + "/" + s.name} className="px-3.5 py-3">
                        <span className="text-[13px] font-medium text-neutral-100 font-mono">/{s.name}</span>
                        <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">{s.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className={`${ui.hint} mt-5`}>
        New skill: <span className="font-mono text-neutral-400">{root || "~/MR/mrai/skills"}/&lt;category&gt;/&lt;name&gt;/SKILL.md</span>. Skills live only on this computer and never go to GitHub.
      </p>
    </div>
  );
}
