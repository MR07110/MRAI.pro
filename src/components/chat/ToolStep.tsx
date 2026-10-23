"use client";

import { memo, useState } from "react";
import {
  Check,
  ChevronRight,
  FilePen,
  FileText,
  FolderOpen,
  ListChecks,
  Loader2,
  Plug,
  Search,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import type { ToolSeg } from "./parse";

function iconFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("bash") || n.includes("exec") || n.includes("shell") || n.includes("killshell")) return Terminal;
  if (n.includes("multiedit") || n.includes("edit") || n.includes("write")) return FilePen;
  if (n.includes("read")) return FileText;
  if (n.includes("glob") || n.includes("grep") || n.includes("search")) return Search;
  if (n === "ls" || n.includes("list_dir") || n.includes("folder")) return FolderOpen;
  if (n.includes("todo") || n.includes("task")) return ListChecks;
  if (n.startsWith("mcp")) return Plug;
  return Wrench;
}

const ToolRow = memo(function ToolRow({ t }: { t: ToolSeg }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(t.name);
  const first = t.head.split("\n")[0].replace(/^\$\s*/, "").trim();
  const canOpen = t.status !== "running" && Boolean(t.head || t.output);
  const isErr = t.status === "error";

  return (
    <div>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-3 h-9 text-left text-[13px] transition ${
          canOpen ? "hover:bg-white/[0.04] cursor-pointer" : "cursor-default"
        }`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${isErr ? "text-red-400" : "text-neutral-500"}`} />
        <span className={`shrink-0 font-medium ${isErr ? "text-red-300" : "text-neutral-300"}`}>{t.name}</span>
        {first && <span className="flex-1 min-w-0 truncate font-mono text-[12px] text-neutral-600">{first}</span>}
        {!first && <span className="flex-1" />}
        {t.secs && <span className="shrink-0 text-[11px] text-neutral-600 tabular-nums">{t.secs}s</span>}
        <span className="shrink-0 w-4 flex justify-center">
          {t.status === "running" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
          ) : t.status === "ok" ? (
            <Check className="w-3.5 h-3.5 text-emerald-500/80" />
          ) : (
            <X className={`w-3.5 h-3.5 ${isErr ? "text-red-400" : "text-neutral-600"}`} />
          )}
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 text-neutral-600 transition-transform ${open ? "rotate-90" : ""} ${canOpen ? "" : "opacity-0"}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 space-y-2">
          {t.head && (
            <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-neutral-400">
              {t.head}
            </pre>
          )}
          {t.output && (
            <pre
              className={`m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/60 border border-white/[0.06] p-3 font-mono text-[12px] leading-5 ${
                isErr ? "text-red-300" : "text-neutral-300"
              }`}
            >
              {t.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

export function ToolGroup({ items }: { items: ToolSeg[] }) {
  return (
    <div className="my-3 rounded-xl border border-white/[0.08] bg-white/[0.015] divide-y divide-white/[0.06] overflow-hidden">
      {items.map((t, i) => (
        <ToolRow key={i} t={t} />
      ))}
    </div>
  );
}
