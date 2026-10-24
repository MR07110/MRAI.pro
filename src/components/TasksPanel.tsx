"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Plus, Trash2, Loader2, Play, ChevronDown, ChevronRight } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import { loadSettings } from "@/lib/settings";
import type { ScheduledTask, TaskRun } from "@/types";

const PRESETS = [
 { label: "Har 15 daqiqa", value: "every 15m" },
 { label: "Har soat", value: "every 1h" },
 { label: "Har kuni 09:00", value: "daily 09:00" },
 { label: "Ish kunlari 18:30", value: "weekdays 18:30" },
];

function fmt(ts: number | null | undefined): string {
 if (!ts) return "—";
 return new Date(ts * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
 return (
 <button
 type="button"
 onClick={onChange}
 className={`w-9 h-5 transition cursor-pointer p-0.5 shrink-0 ${on ? "bg-white" : "bg-white/[0.08]"}`}
 >
 <div className={`w-4 h-4 bg-black transition transform ${on ? "translate-x-4" : "translate-x-0"}`} />
 </button>
 );
}

export default function TasksPanel() {
 const [tasks, setTasks] = useState<ScheduledTask[]>([]);
 const [loading, setLoading] = useState(true);
 const [showForm, setShowForm] = useState(false);
 const [kind, setKind] = useState<"ai" | "shell">("ai");
 const [name, setName] = useState("");
 const [schedule, setSchedule] = useState("daily 09:00");
 const [text, setText] = useState("");
 const [error, setError] = useState("");
 const [saving, setSaving] = useState(false);
 const [open, setOpen] = useState<string | null>(null);
 const [runs, setRuns] = useState<Record<string, TaskRun[]>>({});
 const openRef = useRef<string | null>(null);
 openRef.current = open;

 async function load() {
 setTasks(await serverDb.getTasks());
 setLoading(false);
 if (openRef.current) {
 const r = await serverDb.getTaskRuns(openRef.current, 5);
 setRuns((p) => ({ ...p, [openRef.current as string]: r }));
 }
 }

 useEffect(() => {
 load();
 const t = setInterval(load, 10000);
 return () => clearInterval(t);
 }, []);

 async function toggleOpen(id: string) {
 if (open === id) {
 setOpen(null);
 return;
 }
 setOpen(id);
 setRuns((p) => ({ ...p, [id]: [] }));
 const r = await serverDb.getTaskRuns(id, 5);
 setRuns((p) => ({ ...p, [id]: r }));
 }

 async function create() {
 setError("");
 if (!name.trim()) return setError("Nom kiriting");
 if (!text.trim()) return setError(kind === "ai" ? "Write an instruction (prompt) for the AI" : "Write a bash command");
 setSaving(true);
 try {
 let keyId = "";
 if (kind === "ai") {
 const keys = await serverDb.getKeys();
 const k = keys.find((x) => x.is_default) || keys[0];
 if (!k) throw new Error("Add an API key first (API keys section)");
 if (!k.model) throw new Error("Choose a model first in Settings → API keys");
 keyId = k.id;
 }
 await serverDb.saveTask(
 { name: name.trim(), kind, schedule: schedule.trim(), prompt: kind === "ai" ? text : "", command: kind === "shell" ? text : "", system: kind === "ai" ? loadSettings().systemPrompt : "" },
 keyId
 );
 setName(""); setText(""); setShowForm(false);
 await load();
 } catch (e: any) {
 setError(e?.message || "Could not save");
 } finally {
 setSaving(false);
 }
 }

 async function runNow(t: ScheduledTask) {
 try {
 await serverDb.runTaskNow(t.id);
 setTimeout(load, 800);
 } catch (e: any) {
 alert(e?.message || "Could not run it");
 }
 }

 async function toggle(t: ScheduledTask) {
 try {
 await serverDb.toggleTask(t.id, !t.enabled);
 } catch (e: any) {
 alert(e?.message || "Error");
 }
 load();
 }

 async function remove(t: ScheduledTask) {
 if (!confirm(`Delete the task "${t.name}"?`)) return;
 await serverDb.deleteTask(t.id).catch(() => {});
 load();
 }

 const inputCls =
 "w-full px-3 py-2 border border-white/15 bg-black text-neutral-100 text-xs placeholder:text-neutral-600 focus:border-white/40 focus:outline-none";

 return (
 <div>
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="text-sm font-semibold text-neutral-100">Scheduled tasks</h3>
 <p className="text-xs text-neutral-400">The local server runs 24/7. The AI can also add tasks from the chat.</p>
 </div>
 {!showForm && (
 <button
 onClick={() => setShowForm(true)}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
 >
 <Plus className="w-3.5 h-3.5" />
 New
 </button>
 )}
 </div>

 {showForm && (
 <div className="mb-4 p-4 border border-white/15 bg-black/60 space-y-3">
 <div className="grid grid-cols-2 gap-2">
 {(["ai", "shell"] as const).map((k) => (
 <button
 key={k}
 onClick={() => setKind(k)}
 className={`py-2 border text-xs font-medium cursor-pointer transition ${
 kind === k ? "bg-white text-black border-white" : "border-white/15 text-neutral-300 hover:bg-white/[0.07]"
 }`}
 >
 {k === "ai" ? "AI agent (prompt)" : "Shell command"}
 </button>
 ))}
 </div>
 <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Task name" className={inputCls} />
 <div>
 <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="daily 09:00" className={inputCls} />
 <div className="flex flex-wrap gap-1.5 mt-2">
 {PRESETS.map((p) => (
 <button
 key={p.value}
 onClick={() => setSchedule(p.value)}
 className="px-2 py-1 border border-white/15 text-[11px] text-neutral-400 hover:text-white hover:bg-white/[0.07] cursor-pointer"
 >
 {p.label}
 </button>
 ))}
 </div>
 <p className="text-[10px] text-neutral-500 mt-1.5">
 every 15m · daily 09:00 · weekdays 18:30 · once 2026-10-25 09:00 · cron: */5 * * * * (server local time)
 </p>
 </div>
 <textarea
 rows={4}
 value={text}
 onChange={(e) => setText(e.target.value)}
 placeholder={kind === "ai" ? "What should the AI do? For example: check the git status of the project folder and write a short report" : "echo hello >> ~/log.txt"}
 className={`${inputCls} font-mono leading-relaxed`}
 />
 {error && <p className="text-[11px] text-red-400">{error}</p>}
 <div className="flex gap-2 justify-end">
 <button onClick={() => { setShowForm(false); setError(""); }} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer">
 Cancel
 </button>
 <button
 onClick={create}
 disabled={saving}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-neutral-200 disabled:opacity-50 cursor-pointer"
 >
 {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
 Save
 </button>
 </div>
 </div>
 )}

 {loading ? (
 <div className="text-center py-10 text-neutral-500 text-sm">Loading…</div>
 ) : tasks.length === 0 ? (
 <div className="text-center py-12 border border-dashed border-white/15 bg-black/40">
 <Clock className="w-9 h-9 text-neutral-600 mx-auto mb-3" />
 <p className="text-sm text-neutral-300">No tasks yet</p>
 <p className="text-xs text-neutral-500 mt-1">Or tell the AI in the chat: “every day at 09:00 do ...”.</p>
 </div>
 ) : (
 <div className="space-y-2.5">
 {tasks.map((t) => (
 <div key={t.id} className=" border border-white/15 bg-black/60">
 <div className="flex items-center gap-3 p-3.5">
 <button onClick={() => toggleOpen(t.id)} className="text-neutral-500 hover:text-white cursor-pointer">
 {open === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
 </button>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium text-neutral-100 truncate">
 {t.name}
 <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-500">{t.kind}</span>
 </p>
 <p className="text-[11px] text-neutral-500 truncate">
 {t.schedule} · next: {t.enabled ? fmt(t.next_run) : "off"} · last:{" "}
 <span className={t.last_status === "ok" ? "text-emerald-400" : t.last_status === "error" ? "text-red-400" : ""}>
 {t.running ? "running…" : t.last_status || "—"}
 </span>
 </p>
 </div>
 <button onClick={() => runNow(t)} title="Run now" className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.07] cursor-pointer">
 {t.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
 </button>
 <Switch on={t.enabled} onChange={() => toggle(t)} />
 <button onClick={() => remove(t)} title="Delete" className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-white/[0.07] cursor-pointer">
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 {open === t.id && (
 <div className="px-4 pb-3.5 border-t border-white/15 pt-3 space-y-2">
 <p className="text-[11px] text-neutral-400 whitespace-pre-wrap break-words">
 {t.kind === "ai" ? t.prompt : t.command}
 </p>
 {(runs[t.id] || []).length === 0 ? (
 <p className="text-[11px] text-neutral-600">Has not run yet</p>
 ) : (
 (runs[t.id] || []).map((r) => (
 <div key={r.id} className=" bg-[#0a0a0a] p-2.5">
 <p className="text-[10px] text-neutral-500 mb-1">
 {fmt(r.started_at)} · {r.trigger} ·{" "}
 <span className={r.status === "ok" ? "text-emerald-400" : r.status === "error" ? "text-red-400" : "text-amber-400"}>{r.status}</span>
 </p>
 <pre className="text-[11px] text-neutral-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{r.output || "…"}</pre>
 </div>
 ))
 )}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 );
}
