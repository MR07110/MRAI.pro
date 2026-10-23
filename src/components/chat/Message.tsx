"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronRight, Copy, Key, Pencil, RotateCcw, ShieldAlert } from "lucide-react";
import WaitCountdown, { stripWait } from "../WaitCountdown";
import type { Message } from "@/types";
import Md from "./Markdown";
import { ToolGroup } from "./ToolStep";
import { parseThinkingAndContent, splitAgent, type Seg, type ToolSeg } from "./parse";
import FileCard from "./FileCard";
import type { FileRef } from "./fileKind";

type Block =
  | { k: "md"; text: string }
  | { k: "tools"; items: ToolSeg[] }
  | { k: "wait"; end: number }
  | { k: "files"; items: FileRef[] };

function toBlocks(segs: Seg[]): Block[] {
  const out: Block[] = [];
  for (const s of segs) {
    if (s.type === "tool") {
      const last = out[out.length - 1];
      if (last && last.k === "tools") last.items.push(s);
      else out.push({ k: "tools", items: [s] });
    } else if (s.type === "file") {
      const last = out[out.length - 1];
      const ref = { path: s.path, name: s.name, size: s.size };
      if (last && last.k === "files") last.items.push(ref);
      else out.push({ k: "files", items: [ref] });
    } else if (s.type === "md") {
      if (s.text.trim()) out.push({ k: "md", text: s.text });
    } else {
      out.push({ k: "wait", end: s.end });
    }
  }
  return out;
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-300 transition cursor-pointer"
      >
        <span className={live ? "shimmer" : ""}>{live ? "O‘ylanmoqda…" : "Fikrlash jarayoni"}</span>
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 ml-1.5 pl-4 border-l border-white/10 text-[13px] leading-6 text-neutral-500 whitespace-pre-wrap max-h-80 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
}

const iconBtn =
  "h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.07] transition cursor-pointer";

export default function MessageView({
  msg,
  isLast,
  isStreaming,
  copied,
  fontSizeClass,
  onCopy,
  onRegenerate,
  onEdit,
  onOpenSettings,
  onOpenFile,
}: {
  msg: Message;
  isLast: boolean;
  isStreaming: boolean;
  copied: boolean;
  fontSizeClass: string;
  onCopy: (id: string, text: string) => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onOpenSettings: () => void;
  onOpenFile: (f: FileRef) => void;
}) {
  const isAssistant = msg.role === "assistant";
  const live = isAssistant && isStreaming && isLast;
  const { thinking, content } = isAssistant
    ? parseThinkingAndContent(msg.content)
    : { thinking: null as string | null, content: msg.content };

  let body = content;
  let errorText: string | null = null;
  if (isAssistant) {
    const em = content.match(/(?:^|\n\n)Xatolik:\s*([\s\S]*)$/);
    if (em) {
      body = content.slice(0, em.index ?? 0);
      errorText = em[1].trim();
    } else if (content.includes("API kalit xatosi")) {
      body = "";
      errorText = content;
    }
  }

  const blocks = useMemo(() => (isAssistant ? toBlocks(splitAgent(body, live)) : []), [isAssistant, body, live]);

  if (!isAssistant) {
    return (
      <div className="group flex flex-col items-end fade-up">
        <div
          className={`max-w-[88%] rounded-2xl bg-[#181818] px-4 py-2.5 ${fontSizeClass} leading-[1.7] whitespace-pre-wrap break-words text-neutral-100`}
        >
          {msg.content}
        </div>
        <div className="flex items-center gap-0.5 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button type="button" className={iconBtn} title="Nusxalash" onClick={() => onCopy(msg.id, msg.content)}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button type="button" className={iconBtn} title="Tahrirlash va qayta yuborish" onClick={() => onEdit(msg.content)}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const hasBody = blocks.length > 0;
  const lastBlock = blocks[blocks.length - 1];
  const needsKey = errorText ? /kalit|api key|401|403|unauthor|invalid/i.test(errorText) : false;

  return (
    <div className="group min-w-0 fade-up">
      {thinking ? <Thinking text={thinking} live={live && !hasBody} /> : null}

      <div className={`${fontSizeClass} text-neutral-200 break-words`}>
        {blocks.map((b, i) =>
          b.k === "md" ? (
            <Md key={i} text={b.text} />
          ) : b.k === "tools" ? (
            <ToolGroup key={i} items={b.items} />
          ) : b.k === "files" ? (
            <div key={i}>
              {b.items.map((f) => (
                <FileCard key={f.path} file={f} onOpen={onOpenFile} />
              ))}
            </div>
          ) : (
            <WaitCountdown key={i} end={b.end} />
          )
        )}

        {live && hasBody && lastBlock?.k === "md" && (
          <span className="inline-block w-2 h-2 ml-1 rounded-full bg-neutral-300 animate-pulse align-middle" />
        )}

        {live && !hasBody && !thinking && (
          <div className="flex items-center gap-2.5 py-1 text-[14px]">
            <Image src="/logo-white.png" alt="" width={16} height={16} className="animate-pulse opacity-70" />
            <span className="shimmer">Javob tayyorlanmoqda…</span>
          </div>
        )}
        {live && !hasBody && thinking !== null && thinking === "" && (
          <div className="flex items-center gap-2.5 py-1 text-[14px]">
            <span className="shimmer">O‘ylanmoqda…</span>
          </div>
        )}
      </div>

      {errorText && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3.5 text-[13.5px] text-red-300">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed break-words min-w-0">{errorText}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pl-6">
            {needsKey && (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                Kalitni almashtirish
              </button>
            )}
            {isLast && !isStreaming && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Qayta urinish
              </button>
            )}
          </div>
        </div>
      )}

      {hasBody && !live && (
        <div
          className={`flex items-center gap-0.5 mt-2 transition-opacity ${
            isLast ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          }`}
        >
          <button type="button" className={iconBtn} title="Nusxalash" onClick={() => onCopy(msg.id, stripWait(body))}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {isLast && (
            <button type="button" className={iconBtn} title="Qayta urinish" onClick={onRegenerate}>
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
