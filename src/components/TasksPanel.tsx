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
 className={`w-9 h-5 transition cursor-pointer p-0.5 shrink-0 ${on ? "bg-white" : "bg-neutral-800"}`}
 >
 <div className={`w-4 h-4 bg-neutral-950 transition transform ${on ? "translate-x-4" : "translate-x-0"}`} />
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
 if (!text.trim()) return setError(kind === "ai" ? "AI uchun ko‘rsatma (prompt) yozing" : "Bash buyrug‘ini yozing");
 setSaving(true);
 try {
 let keyId = "";
 if (kind === "ai") {
 const keys = await serverDb.getKeys();
 const k = keys.find((x) => x.is_default) || keys[0];
 if (!k) throw new Error("Avval API kalit qo‘shing (API kalitlar bo‘limi)");
 if (!k.model) throw new Error("Avval Sozlamalar → API kalitlar bo‘limida model tanlang");
 keyId = k.id;
 }
 await serverDb.saveTask(
 { name: name.trim(), kind, schedule: schedule.trim(), prompt: kind === "ai" ? text : "", command: kind === "shell" ? text : "", system: kind === "ai" ? loadSettings().systemPrompt : "" },
 keyId
 );
 setName(""); setText(""); setShowForm(false);
 await load();
 } catch (e: any) {
 setError(e?.message || "Saqlab bo‘lmadi");
 } finally {
 setSaving(false);
 }
 }

 async function runNow(t: ScheduledTask) {
 try {
 await serverDb.runTaskNow(t.id);
 setTimeout(load, 800);
 } catch (e: any) {
 alert(e?.message || "Ishga tushirib bo‘lmadi");
 }
 }

 async function toggle(t: ScheduledTask) {
 try {
 await serverDb.toggleTask(t.id, !t.enabled);
 } catch (e: any) {
 alert(e?.message || "Xato");
 }
 load();
 }

 async function remove(t: ScheduledTask) {
 if (!confirm(`"${t.name}" vazifasini o‘chirasizmi?`)) return;
 await serverDb.deleteTask(t.id).catch(() => {});
 load();
 }

 const inputCls =
 "w-full px-3 py-2 border border-neutral-800 bg-neutral-950 text-neutral-100 text-xs placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none";

 return (
 <div>
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="text-sm font-semibold text-neutral-100">Rejalashtirilgan vazifalar</h3>
 <p className="text-xs text-neutral-400">Local server 24/7 ishlaydi. AI ham chatdan vazifa qo‘sha oladi.</p>
 </div>
 {!showForm && (
 <button
 onClick={() => setShowForm(true)}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
 >
 <Plus className="w-3.5 h-3.5" />
 Yangi
 </button>
 )}
 </div>

 {showForm && (
 <div className="mb-4 p-4 border border-neutral-800 bg-neutral-950/60 space-y-3">
 <div className="grid grid-cols-2 gap-2">
 {(["ai", "shell"] as const).map((k) => (
 <button
 key={k}
 onClick={() => setKind(k)}
 className={`py-2 border text-xs font-medium cursor-pointer transition ${
 kind === k ? "bg-white text-neutral-950 border-white" : "border-neutral-800 text-neutral-300 hover:bg-neutral-800"
 }`}
 >
 {k === "ai" ? "AI agent (prompt)" : "Shell buyruq"}
 </button>
 ))}
 </div>
 <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vazifa nomi" className={inputCls} />
 <div>
 <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="daily 09:00" className={inputCls} />
 <div className="flex flex-wrap gap-1.5 mt-2">
 {PRESETS.map((p) => (
 <button
 key={p.value}
 onClick={() => setSchedule(p.value)}
 className="px-2 py-1 border border-neutral-800 text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
 >
 {p.label}
 </button>
 ))}
 </div>
 <p className="text-[10px] text-neutral-500 mt-1.5">
 every 15m · daily 09:00 · weekdays 18:30 · once 2026-10-25 09:00 · cron: */5 * * * * (server mahalliy vaqti)
 </p>
 </div>
 <textarea
 rows={4}
 value={text}
 onChange={(e) => setText(e.target.value)}
 placeholder={kind === "ai" ? "AI nima qilishi kerak? Masalan: loyiha papkasidagi git holatini tekshirib, qisqa hisobot yoz" : "echo salom >> ~/log.txt"}
 className={`${inputCls} font-mono leading-relaxed`}
 />
 {error && <p className="text-[11px] text-red-400">{error}</p>}
 <div className="flex gap-2 justify-end">
 <button onClick={() => { setShowForm(false); setError(""); }} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer">
 Bekor
 </button>
 <button
 onClick={create}
 disabled={saving}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 disabled:opacity-50 cursor-pointer"
 >
 {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
 Saqlash
 </button>
 </div>
 </div>
 )}

 {loading ? (
 <div className="text-center py-10 text-neutral-500 text-sm">Yuklanmoqda...</div>
 ) : tasks.length === 0 ? (
 <div className="text-center py-12 border border-dashed border-neutral-800 bg-neutral-950/40">
 <Clock className="w-9 h-9 text-neutral-600 mx-auto mb-3" />
 <p className="text-sm text-neutral-300">Hali vazifa yo‘q</p>
 <p className="text-xs text-neutral-500 mt-1">Yoki chatda AI ga ayting: “har kuni 09:00 da ... qilib tur”.</p>
 </div>
 ) : (
 <div className="space-y-2.5">
 {tasks.map((t) => (
 <div key={t.id} className=" border border-neutral-800 bg-neutral-950/60">
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
 {t.schedule} · keyingi: {t.enabled ? fmt(t.next_run) : "o‘chiq"} · oxirgi:{" "}
 <span className={t.last_status === "ok" ? "text-emerald-400" : t.last_status === "error" ? "text-red-400" : ""}>
 {t.running ? "ishlayapti…" : t.last_status || "—"}
 </span>
 </p>
 </div>
 <button onClick={() => runNow(t)} title="Hozir ishga tushirish" className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer">
 {t.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
 </button>
 <Switch on={t.enabled} onChange={() => toggle(t)} />
 <button onClick={() => remove(t)} title="O‘chirish" className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 cursor-pointer">
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 {open === t.id && (
 <div className="px-4 pb-3.5 border-t border-neutral-800 pt-3 space-y-2">
 <p className="text-[11px] text-neutral-400 whitespace-pre-wrap break-words">
 {t.kind === "ai" ? t.prompt : t.command}
 </p>
 {(runs[t.id] || []).length === 0 ? (
 <p className="text-[11px] text-neutral-600">Hali ishga tushmagan</p>
 ) : (
 (runs[t.id] || []).map((r) => (
 <div key={r.id} className=" bg-neutral-900 p-2.5">
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
