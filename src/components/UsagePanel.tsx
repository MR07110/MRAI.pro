"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UsageSummary } from "@/types";

const RANGES = [
 { days: 7, label: "7 days" },
 { days: 30, label: "30 days" },
 { days: 90, label: "90 days" },
];

const SOURCE_META: Record<string, { label: string; bar: string }> = {
 chat: { label: "Chat", bar: "bg-neutral-300" },
 agent: { label: "Agent", bar: "bg-neutral-500" },
 task: { label: "Tasks", bar: "bg-amber-400" },
};

const nf = new Intl.NumberFormat("en-US");

function trimNum(x: number): string {
 const s = x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2);
 return s.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function compact(n: number): string {
 if (n >= 1e9) return trimNum(n / 1e9) + "B";
 if (n >= 1e6) return trimNum(n / 1e6) + "M";
 if (n >= 1e4) return trimNum(n / 1e3) + "K";
 return nf.format(Math.round(n));
}

function pct(part: number, whole: number): number {
 return whole > 0 ? (part / whole) * 100 : 0;
}

function dayLabel(iso: string): string {
 return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function timeLabel(ts: number): string {
 return new Date(ts * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Dot({ className }: { className: string }) {
 return <span className={`inline-block w-2 h-2 ${className}`} />;
}

/** Kirish / chiqish ulushi: ikki rangli progress */
function SplitBar({ input, output, scale = 100, h = "h-2" }: { input: number; output: number; scale?: number; h?: string }) {
 const t = input + output;
 const width = t > 0 ? Math.max(2, Math.min(100, scale)) : 0;
 return (
 <div className={`${h} w-full bg-white/[0.08] overflow-hidden`}>
 <div className="h-full flex transition-all duration-500" style={{ width: `${width}%` }}>
 <div className="h-full bg-white" style={{ width: `${pct(input, t)}%` }} />
 <div className="h-full bg-emerald-400" style={{ width: `${pct(output, t)}%` }} />
 </div>
 </div>
 );
}

function Card({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
 return (
 <div className=" border border-white/15 bg-black p-4">
 {(title || right) && (
 <div className="flex items-center justify-between mb-3">
 <p className="text-xs font-medium text-neutral-300">{title}</p>
 {right}
 </div>
 )}
 {children}
 </div>
 );
}

export default function UsagePanel() {
 const [days, setDays] = useState(30);
 const [data, setData] = useState<UsageSummary | null>(null);
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);

 useEffect(() => {
 let alive = true;
 const run = () =>
 serverDb
 .getUsage(days)
 .then((r) => {
 if (!alive) return;
 setData(r);
 setError("");
 })
 .catch((e) => {
 if (alive) setError(e?.message || "Could not connect to the server");
 });
 run();
 const t = setInterval(run, 15000);
 return () => {
 alive = false;
 clearInterval(t);
 };
 }, [days]);

 async function refresh() {
 setBusy(true);
 try {
 setData(await serverDb.getUsage(days));
 setError("");
 } catch (e) {
 setError((e as Error)?.message || "Could not connect to the server");
 } finally {
 setBusy(false);
 }
 }

 const header = (
 <div className="flex items-center justify-between gap-3">
 <div className="flex border border-white/15 bg-black p-0.5">
 {RANGES.map((r) => (
 <button
 key={r.days}
 onClick={() => setDays(r.days)}
 className={`px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
 days === r.days ? "bg-white text-black" : "text-neutral-400 hover:text-white"
 }`}
 >
 {r.label}
 </button>
 ))}
 </div>
 <button
 onClick={refresh}
 title="Refresh"
 className="p-2 border border-white/15 text-neutral-400 hover:text-white hover:bg-white/[0.07] transition cursor-pointer"
 >
 <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
 </button>
 </div>
 );

 if (!data) {
 return (
 <div className="space-y-4">
 {header}
 {error ? (
 <p className="text-xs text-red-400 py-8 text-center">{error}</p>
 ) : (
 <div className="flex items-center justify-center gap-2 py-12 text-xs text-neutral-500">
 <Loader2 className="w-4 h-4 animate-spin" /> Loading…
 </div>
 )}
 </div>
 );
 }

 const stale = data.days !== days;
 const range = data.totals.range;
 const total = range.input + range.output;
 const allTotal = data.totals.all.input + data.totals.all.output;
 const maxDay = Math.max(1, ...data.by_day.map((d) => d.input + d.output));
 const maxModel = Math.max(1, ...data.by_model.map((m) => m.input + m.output));
 const sourceTotal = data.by_source.reduce((a, s) => a + s.input + s.output, 0);

 const tiles = [
 { label: "Today", b: data.totals.today },
 { label: "7 days", b: data.totals.d7 },
 { label: "30 days", b: data.totals.d30 },
 { label: "Total", b: data.totals.all },
 ];

 if (allTotal === 0) {
 return (
 <div className="space-y-4">
 {header}
 <div className=" border border-dashed border-white/15 py-12 px-6 text-center">
 <p className="text-sm font-medium text-neutral-200">No token usage recorded yet</p>
 <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
 Start a chat or run the agent: the tokens used by every model request will appear here.
 </p>
 </div>
 </div>
 );
 }

 return (
 <div className={`space-y-4 transition-opacity ${stale ? "opacity-50" : ""}`}>
 {header}

 {/* Asosiy kartochka */}
 <Card>
 <div className="flex items-end justify-between gap-3">
 <div>
 <p className="text-[11px] text-neutral-500">Tokens used in the last {data.days} days</p>
 <p className="text-3xl font-semibold tracking-tight text-white mt-1 tabular-nums">{compact(total)}</p>
 <p className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">{nf.format(total)} token</p>
 </div>
 <div className="text-right">
 <p className="text-lg font-semibold text-neutral-100 tabular-nums">{nf.format(range.calls)}</p>
 <p className="text-[11px] text-neutral-500">requests</p>
 <p className="text-[11px] text-neutral-500 mt-1 tabular-nums">
 avg {compact(range.calls ? total / range.calls : 0)} / request
 </p>
 </div>
 </div>

 <div className="mt-4">
 <SplitBar input={range.input} output={range.output} h="h-3" />
 <div className="flex items-center justify-between mt-2 text-[11px]">
 <span className="flex items-center gap-1.5 text-neutral-300">
 <Dot className="bg-white" /> Input <b className="tabular-nums">{compact(range.input)}</b>
 <span className="text-neutral-500 tabular-nums">{pct(range.input, total).toFixed(0)}%</span>
 </span>
 <span className="flex items-center gap-1.5 text-neutral-300">
 <Dot className="bg-emerald-400" /> Output <b className="tabular-nums">{compact(range.output)}</b>
 <span className="text-neutral-500 tabular-nums">{pct(range.output, total).toFixed(0)}%</span>
 </span>
 </div>
 </div>
 </Card>

 {/* Davrlar */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {tiles.map((t) => {
 const v = t.b.input + t.b.output;
 return (
 <div key={t.label} className=" border border-white/15 bg-black p-3">
 <p className="text-[11px] text-neutral-500">{t.label}</p>
 <p className="text-lg font-semibold text-neutral-100 mt-0.5 tabular-nums">{compact(v)}</p>
 <div className="h-1 bg-white/[0.08] overflow-hidden mt-2">
 <div className="h-full bg-white/80 transition-all duration-500" style={{ width: `${v > 0 ? Math.max(3, pct(v, allTotal)) : 0}%` }} />
 </div>
 <p className="text-[10px] text-neutral-600 mt-1.5 tabular-nums">{nf.format(t.b.calls)} requests</p>
 </div>
 );
 })}
 </div>

 {/* Kunlar bo'yicha */}
 <Card
 title="By day"
 right={<span className="text-[10px] text-neutral-500 tabular-nums">peak: {compact(maxDay === 1 && total === 0 ? 0 : maxDay)}</span>}
 >
 <div className={`h-28 flex items-end ${data.by_day.length <= 14 ? "gap-1.5" : "gap-px"}`}>
 {data.by_day.map((d) => {
 const t = d.input + d.output;
 const h = pct(t, maxDay);
 return (
 <div
 key={d.day}
 className="flex-1 h-full flex flex-col justify-end min-w-0"
 title={`${dayLabel(d.day)} — ${nf.format(t)} token (input ${nf.format(d.input)}, output ${nf.format(d.output)}), ${d.calls} requests`}
 >
 {t > 0 ? (
 <div className="flex flex-col justify-end rounded-t-sm overflow-hidden transition-all duration-500" style={{ height: `${Math.max(3, h)}%` }}>
 <div className="bg-emerald-400" style={{ height: `${pct(d.output, t)}%` }} />
 <div className="bg-white" style={{ height: `${pct(d.input, t)}%` }} />
 </div>
 ) : (
 <div className="h-[2px] bg-white/[0.08]" />
 )}
 </div>
 );
 })}
 </div>
 <div className="flex justify-between mt-2 text-[10px] text-neutral-500">
 <span>{dayLabel(data.by_day[0].day)}</span>
 {data.by_day.length > 2 && <span>{dayLabel(data.by_day[Math.floor(data.by_day.length / 2)].day)}</span>}
 <span>Today</span>
 </div>
 </Card>

 {/* Modellar */}
 <Card title="By model" right={<span className="text-[10px] text-neutral-500">{data.by_model.length}</span>}>
 {data.by_model.length === 0 ? (
 <p className="text-xs text-neutral-500">No requests in this period</p>
 ) : (
 <div className="space-y-3.5">
 {data.by_model.map((m) => {
 const t = m.input + m.output;
 return (
 <div key={m.provider + "/" + m.model}>
 <div className="flex items-center justify-between gap-3 mb-1.5">
 <div className="flex items-center gap-2 min-w-0">
 <span className="text-xs text-neutral-100 truncate" title={m.model}>{m.model || "unknown model"}</span>
 <span className="text-[10px] text-neutral-400 bg-white/[0.08] px-1.5 py-0.5 shrink-0">{m.provider || "custom"}</span>
 </div>
 <span className="text-xs font-medium text-neutral-100 tabular-nums shrink-0">
 {m.estimated > 0 && <span title="Partly estimated" className="text-neutral-500 mr-0.5">≈</span>}
 {compact(t)}
 <span className="text-neutral-500 font-normal ml-1.5">{pct(t, total).toFixed(0)}%</span>
 </span>
 </div>
 <SplitBar input={m.input} output={m.output} scale={pct(t, maxModel)} />
 <p className="text-[10px] text-neutral-600 mt-1 tabular-nums">
 input {compact(m.input)} · output {compact(m.output)} · {nf.format(m.calls)} requests
 </p>
 </div>
 );
 })}
 </div>
 )}
 </Card>

 {/* Manbalar */}
 {data.by_source.length > 0 && (
 <Card title="By source">
 <div className="space-y-3">
 {data.by_source.map((s) => {
 const t = s.input + s.output;
 const meta = SOURCE_META[s.source] || { label: s.source, bar: "bg-neutral-400" };
 return (
 <div key={s.source}>
 <div className="flex items-center justify-between text-xs mb-1.5">
 <span className="flex items-center gap-2 text-neutral-200">
 <Dot className={meta.bar} /> {meta.label}
 </span>
 <span className="text-neutral-100 font-medium tabular-nums">
 {compact(t)} <span className="text-neutral-500 font-normal ml-1">{pct(t, sourceTotal).toFixed(0)}%</span>
 </span>
 </div>
 <div className="h-2 bg-white/[0.08] overflow-hidden">
 <div className={`h-full ${meta.bar} transition-all duration-500`} style={{ width: `${t > 0 ? Math.max(2, pct(t, sourceTotal)) : 0}%` }} />
 </div>
 </div>
 );
 })}
 </div>
 </Card>
 )}

 {/* Recent requests */}
 {data.recent.length > 0 && (
 <Card title="Recent requests">
 <div className="divide-y divide-white/[0.06]">
 {data.recent.map((r, i) => (
 <div key={r.ts + ":" + i} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
 <div className="min-w-0">
 <p className="text-xs text-neutral-200 truncate" title={r.model}>{r.model || "unknown model"}</p>
 <p className="text-[10px] text-neutral-600">
 {timeLabel(r.ts)} · {SOURCE_META[r.source]?.label || r.source}
 </p>
 </div>
 <p className="text-[11px] text-neutral-300 tabular-nums shrink-0">
 {r.estimated && <span className="text-neutral-500">≈ </span>}
 <span className="text-white">{nf.format(r.input)}</span>
 <span className="text-neutral-600"> → </span>
 <span className="text-emerald-400">{nf.format(r.output)}</span>
 </p>
 </div>
 ))}
 </div>
 </Card>
 )}

 {data.estimated_calls > 0 && (
 <p className="text-[10px] text-neutral-600 leading-relaxed">
 ≈ — requests for which the provider did not return a token count: estimated at about 4 characters = 1 token ({nf.format(data.estimated_calls)} requests).
 </p>
 )}
 </div>
 );
}
