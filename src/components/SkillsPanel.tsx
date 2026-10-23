"use client";

import { useEffect, useState } from "react";

type Skill = {
 name: string;
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
 </div>

 {skills.length === 0 ? (
 <p className="text-xs text-neutral-500">No skills yet. Add a SKILL.md to the folder.</p>
 ) : (
 <ul className="space-y-2">
 {skills.map((s) => (
 <li
 key={s.name}
 className=" border border-neutral-800 bg-neutral-950/60 px-3.5 py-3"
 >
 <div className="flex items-baseline justify-between gap-2">
 <span className="text-sm font-medium text-neutral-100">/{s.name}</span>
 </div>
 <p className="mt-1 text-xs text-neutral-400 leading-relaxed">{s.description}</p>
 <p className="mt-1.5 font-mono text-[10px] text-neutral-600 break-all">{s.skillMd}</p>
 </li>
 ))}
 </ul>
 )}

 <p className="text-[11px] text-neutral-500">
 New skill: <code className="text-neutral-400">skills/{`{nom}`}/SKILL.md</code> yarating.
 Git: mrai-next/skills · runtime: ~/MR/mrai/skills (symlink).
 </p>
 </div>
 );
}
