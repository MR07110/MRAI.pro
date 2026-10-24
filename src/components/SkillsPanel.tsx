"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [python, setPython] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/skills");
        const j = await r.json();
        if (cancelled) return;
        if (!j.ok) {
          setErr(j.error || "Failed to load");
        } else {
          setSkills(j.skills || []);
          setRoot(j.root || "");
          setPython(j.python || "");
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
      const c = s.category || "—";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills, q]);

  if (loading) {
    return <p className="text-xs text-neutral-500">Loading skills…</p>;
  }
  if (err) {
    return <p className="text-xs text-red-400">{err}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-neutral-400 space-y-1">
        <p>
          Skill — maxsus ish uchun ko‘rsatmalar (Word, PDF, UI dizayn…). AI kerak
          bo‘lganda <code className="text-neutral-300">SKILL.md</code> ni o‘qiydi.
        </p>
        <p className="font-mono text-[11px] text-neutral-500 break-all">ildiz: {root}</p>
        <p className="font-mono text-[11px] text-neutral-500 break-all">python: {python}</p>
        <p className="text-[11px] text-neutral-500">
          Jami: {skills.length} skill · {new Set(skills.map((s) => s.category || "—")).size} kategoriya
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Skill qidirish…"
        className="w-full border border-white/15 bg-black/60 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/30"
      />

      {skills.length === 0 ? (
        <p className="text-xs text-neutral-500">No skills yet. Add a SKILL.md to the folder.</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-neutral-500">Hech narsa topilmadi.</p>
      ) : (
        <div className="space-y-2">
          {groups.map(([cat, list]) => (
            <details key={cat} open={q.trim().length > 0} className="border border-white/15 bg-black/40">
              <summary className="cursor-pointer select-none px-3.5 py-2.5 text-sm text-neutral-100">
                {cat} <span className="text-xs text-neutral-500">({list.length})</span>
              </summary>
              <ul className="space-y-2 px-2.5 pb-2.5">
                {list.map((s) => (
                  <li key={cat + "/" + s.name} className="border border-white/10 bg-black/60 px-3 py-2.5">
                    <span className="text-sm font-medium text-neutral-100">/{s.name}</span>
                    <p className="mt-1 text-xs text-neutral-400 leading-relaxed">{s.description}</p>
                    <p className="mt-1.5 font-mono text-[10px] text-neutral-600 break-all">{s.skillMd}</p>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      <p className="text-[11px] text-neutral-500">
        Yangi skill: <code className="text-neutral-400">{root || "~/MR/mrai/skills"}/{`{kategoriya}/{nom}`}/SKILL.md</code>.
        Skills faqat lokal diskda turadi, GitHub'ga chiqmaydi.
      </p>
    </div>
  );
}
