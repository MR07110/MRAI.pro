"use client";

import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolSeg } from "./parse";

// Claude-style: all tools fold into one line. The layout must not jump during streaming.

function groupLabel(items: ToolSeg[]): { text: string; live: boolean } {
 const running = [...items].reverse().find((t) => t.status === "running");
 if (running) return { text: `${running.name} running…`, live: true };
 const names: string[] = [];
 for (const t of items) if (!names.includes(t.name)) names.push(t.name);
 const shown = names.slice(0, 3).join(", ");
 const more = names.length > 3 ? ` +${names.length - 3}` : "";
 return { text: `Used: ${shown}${more}`, live: false };
}

function Section({ label, text, error }: { label: string; text: string; error?: boolean }) {
 return (
 <div>
 <div className="mb-1 text-[12px] text-neutral-500">{label}</div>
 <pre
 className={`m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words bg-black border border-white/10 p-2.5 font-mono text-[11.5px] leading-5 ${
 error ? "text-red-300" : "text-neutral-400"
 }`}
 >
 {text}
 </pre>
 </div>
 );
}

const ToolRow = memo(function ToolRow({ t }: { t: ToolSeg }) {
 const [open, setOpen] = useState(false);
 const isErr = t.status === "error";
 const canOpen = t.status !== "running" && Boolean(t.head || t.output);

 return (
 <div className="min-h-10">
 <button
 type="button"
 disabled={!canOpen}
 onClick={() => setOpen((v) => !v)}
 className={`w-full flex items-center gap-2 px-3 h-10 text-left text-[13px] transition ${
 canOpen ? "hover:bg-white/[0.04] cursor-pointer" : "cursor-default"
 }`}
 >
 <span className="shrink-0 text-neutral-300">{t.name}</span>
 {isErr && <span className="shrink-0 text-red-400">Error</span>}
 {t.status === "stopped" && <span className="shrink-0 text-neutral-600">Stopped</span>}
 <span className="flex-1" />
 {t.secs && <span className="shrink-0 text-[11px] text-neutral-600 tabular-nums">{t.secs}s</span>}
 <ChevronRight
 className={`w-3.5 h-3.5 shrink-0 text-neutral-600 transition-transform ${open ? "rotate-90" : ""} ${canOpen ? "" : "opacity-0"}`}
 />
 </button>
 {open && canOpen && (
 <div className="px-3 pb-3 pt-1 space-y-3">
 {t.head && <Section label="Request" text={t.head} />}
 {t.output && <Section label="Result" text={t.output} error={isErr} />}
 </div>
 )}
 </div>
 );
}, (a, b) =>
 // Parsing creates fresh objects every streamed token; skip re-render unless this row's content actually
 // changed, so a completed tool list is not redrawn on every token (only the running row updates).
 a.t.name === b.t.name && a.t.status === b.t.status && a.t.secs === b.t.secs && a.t.head === b.t.head && a.t.output === b.t.output
);

export function ToolGroup({ items, streaming = false }: { items: ToolSeg[]; streaming?: boolean }) {
 const { text, live: running } = groupLabel(items);
 // `streaming` = last block of a reply still being written: stay open between tools (no collapse/reopen flicker)
 const live = running || streaming;
 // Collapsed by default (so after a refresh, and once a run finishes, every scope is closed — Claude-style).
 // While streaming (live) it auto-opens; if the user closes it then, that choice is kept until the next live run.
 const [open, setOpen] = useState(false);
 const [userClosed, setUserClosed] = useState(false);
 const show = live ? !userClosed : open;

 function toggle() {
 if (live) {
 setUserClosed((v) => !v);
 } else {
 setOpen((v) => !v);
 setUserClosed(false);
 }
 }

 return (
 <div className="my-2 contain-layout">
 <button
 type="button"
 onClick={toggle}
 className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-300 transition cursor-pointer"
 >
 <span className={live ? "shimmer" : ""}>{text}</span>
 <ChevronRight className={`w-3.5 h-3.5 transition-transform ${show ? "rotate-90" : ""}`} />
 </button>
 {show && (
 <div className="mt-2 border border-white/15 divide-y divide-white/10 overflow-hidden font-mono text-[12.5px]">
 {items.map((t, i) => (
 <ToolRow key={`${t.name}-${i}`} t={t} />
 ))}
 </div>
 )}
 </div>
 );
}
