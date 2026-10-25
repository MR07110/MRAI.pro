"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Key, Pencil, RotateCcw, ShieldAlert } from "lucide-react";
import WaitCountdown, { stripWait } from "../WaitCountdown";
import type { Message } from "@/types";
import Md from "./Markdown";
import { useTypewriter } from "@/hooks/useTypewriter";
import { ToolGroup } from "./ToolStep";
import { fileLines, parseThinkingAndContent, pullInlineFiles, splitAgent, type Seg, type ToolSeg } from "./parse";
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
 <span className={live ? "shimmer" : ""}>{live ? "Thinking…" : "Thought process"}</span>
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

// Shown before any reply text has arrived: the chip's pins hold steady, the "AI" core pulses.
function PreparingIcon({ className }: { className?: string }) {
 return (
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
 <style>{`
 @keyframes mraiPrepPulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
 .mrai-prep-core { animation: mraiPrepPulse 1s steps(1) infinite; }
 `}</style>
 <rect width="24" height="24" fill="#000" />
 <rect x="7" y="1" width="2" height="2" fill="#fff" />
 <rect x="10" y="1" width="2" height="2" fill="#fff" />
 <rect x="13" y="1" width="2" height="2" fill="#fff" />
 <rect x="16" y="1" width="2" height="2" fill="#fff" />
 <rect x="8" y="21" width="2" height="2" fill="#fff" />
 <rect x="11" y="21" width="2" height="2" fill="#fff" />
 <rect x="14" y="21" width="2" height="2" fill="#fff" />
 <rect x="1" y="8" width="2" height="2" fill="#fff" />
 <rect x="1" y="11" width="2" height="2" fill="#fff" />
 <rect x="1" y="14" width="2" height="2" fill="#fff" />
 <rect x="21" y="8" width="2" height="2" fill="#fff" />
 <rect x="21" y="11" width="2" height="2" fill="#fff" />
 <rect x="21" y="14" width="2" height="2" fill="#fff" />
 <path d="M5,4 H19 V5 H20 V19 H19 V20 H5 V19 H4 V5 H5 Z" fill="none" stroke="#fff" strokeWidth="2" />
 <g className="mrai-prep-core">
 <rect x="7" y="8" width="2" height="7" fill="#fff" />
 <rect x="11" y="8" width="2" height="7" fill="#fff" />
 <rect x="9" y="8" width="2" height="2" fill="#fff" />
 <rect x="9" y="11" width="2" height="2" fill="#fff" />
 <rect x="15" y="8" width="2" height="7" fill="#fff" />
 </g>
 </svg>
 );
}


// Shown once the response text has started arriving: a different animation (rotating dots / streaming pulse).
function RespondingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
      <style>{`
        @keyframes mraiRespondPulse { 0%, 100% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }
        .mrai-resp-dot { animation: mraiRespondPulse 1.1s ease-in-out infinite; }
        .mrai-resp-dot:nth-child(2) { animation-delay: 0.15s; }
        .mrai-resp-dot:nth-child(3) { animation-delay: 0.3s; }
      `}</style>
      <circle className="mrai-resp-dot" cx="6" cy="12" r="2.2" fill="#fff" />
      <circle className="mrai-resp-dot" cx="12" cy="12" r="2.2" fill="#fff" />
      <circle className="mrai-resp-dot" cx="18" cy="12" r="2.2" fill="#fff" />
    </svg>
  );
}

const iconBtn =
 "h-7 w-7 inline-flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.07] transition cursor-pointer";

export default function MessageView({
 msg,
 isLast,
 isStreaming,
 copied,
 fontSizeClass,
 canEdit,
 onCopy,
 onRegenerate,
 onEditSubmit,
 onOpenSettings,
 onOpenFile,
}: {
 msg: Message;
 isLast: boolean;
 isStreaming: boolean;
 copied: boolean;
 fontSizeClass: string;
 /** true only for the most recent user message */
 canEdit?: boolean;
 onCopy: (id: string, text: string) => void;
 onRegenerate: () => void;
 /** Resend with edited text (only when canEdit) */
 onEditSubmit: (messageId: string, text: string) => void;
 onOpenSettings: () => void;
 onOpenFile: (f: FileRef) => void;
}) {
 const isAssistant = msg.role === "assistant";
 const live = isAssistant && isStreaming && isLast;
 const { thinking, content } = isAssistant
 ? parseThinkingAndContent(msg.content)
 : { thinking: null as string | null, content: msg.content };

 // User messages carry any uploaded attachments as @file lines in the content.
 const userParsed = useMemo(() => (isAssistant ? null : pullInlineFiles(msg.content)), [isAssistant, msg.content]);
 const userText = userParsed ? userParsed.text : "";
 const userFiles = userParsed ? userParsed.files : [];

 const [editing, setEditing] = useState(false);
 const [draft, setDraft] = useState(msg.content);
 const editRef = useRef<HTMLTextAreaElement>(null);

 useEffect(() => {
 if (!editing) setDraft(msg.content);
 }, [msg.content, editing]);

 useEffect(() => {
 if (!editing || !editRef.current) return;
 const el = editRef.current;
 el.focus();
 el.style.height = "auto";
 el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
 // kursor oxiriga
 const len = el.value.length;
 el.setSelectionRange(len, len);
 }, [editing]);

 let body = content;
 let errorText: string | null = null;
 if (isAssistant) {
 const em = content.match(/(?:^|\n\n)Error:\s*([\s\S]*)$/);
 if (em) {
 body = content.slice(0, em.index ?? 0);
 errorText = em[1].trim();
 } else if (content.includes("API key error")) {
 body = "";
 errorText = content;
 }
 }

 const typed = useTypewriter(body, live);
 const parsing = live || typed.typing;
 const blocks = useMemo(() => (isAssistant ? toBlocks(splitAgent(typed.text, parsing)) : []), [isAssistant, typed.text, parsing]);

 if (!isAssistant) {
 const submitEdit = () => {
 const t0 = draft.trim();
 if (!t0 && userFiles.length === 0) return;
 if (t0 === userText.trim()) {
 setEditing(false);
 setDraft(userText);
 return;
 }
 setEditing(false);
 // Keep the attachments on the message when the typed text is edited.
 const lines = userFiles.length ? fileLines(userFiles) : "";
 onEditSubmit(msg.id, lines ? (t0 ? `${t0}\n\n${lines}` : lines) : t0);
 };

 return (
 <div className="group flex flex-col items-end fade-up w-full">
 {(editing || userText) && (
 <div
 className={`relative max-w-[88%] min-w-[4rem] border border-white/15 bg-[#0c0c0c] ${fontSizeClass} leading-[1.7] text-neutral-100 ${
 editing ? "w-full border border-white/20 ring-1 ring-white/10" : ""
 }`}
 >
 {editing ? (
 <>
 <textarea
 ref={editRef}
 value={draft}
 onChange={(e) => {
 setDraft(e.target.value);
 const el = e.target;
 el.style.height = "auto";
 el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
 }}
 onKeyDown={(e) => {
 if (e.key === "Escape") {
 e.preventDefault();
 setEditing(false);
 setDraft(userText);
 }
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 submitEdit();
 }
 }}
 rows={1}
 className={`block w-full resize-none bg-transparent px-4 pt-2.5 pb-1 ${fontSizeClass} leading-[1.7] text-neutral-100 focus:outline-none max-h-[320px] whitespace-pre-wrap break-words`}
 />
 <div className="flex items-center justify-end gap-1 px-2.5 pb-2">
 <button
 type="button"
 onClick={() => {
 setEditing(false);
 setDraft(userText);
 }}
 className="h-7 px-2.5 text-[12px] text-neutral-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={submitEdit}
 disabled={!draft.trim()}
 className="h-7 px-2.5 text-[12px] font-medium bg-white text-black hover:bg-neutral-200 transition disabled:opacity-30 cursor-pointer"
 >
 Send
 </button>
 </div>
 </>
 ) : (
 <div
 className="px-4 py-2.5 whitespace-pre-wrap break-words"
 onDoubleClick={() => {
 if (!canEdit) return;
 setDraft(userText);
 setEditing(true);
 }}
 >
 {userText}
 </div>
 )}
 </div>
 )}

 {userFiles.length > 0 && (
 <div className="mt-1 w-72 max-w-[88%] self-end flex flex-col items-stretch">
 {userFiles.map((f) => (
 <FileCard key={f.path} file={f} onOpen={onOpenFile} />
 ))}
 </div>
 )}

 {!editing && (
 <div className="flex items-center gap-0.5 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
 <button type="button" className={iconBtn} title="Copy" onClick={() => onCopy(msg.id, userText)}>
 {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
 </button>
 {canEdit && (
 <button
 type="button"
 className={iconBtn}
 title="Edit"
 onClick={() => {
 setDraft(userText);
 setEditing(true);
 }}
 >
 <Pencil className="w-3.5 h-3.5" />
 </button>
 )}
 </div>
 )}
 </div>
 );
 }

 const hasBody = blocks.length > 0;
 const needsKey = errorText ? /api key|api-key|kalit|401|403|unauthor|invalid/i.test(errorText) : false;

 return (
 <div className="group min-w-0 fade-up">
 {live && (
   <div className="flex items-center gap-2.5 mb-2 text-[14px]">
     {hasBody ? <RespondingIcon className="w-4 h-4" /> : <PreparingIcon className="w-4 h-4" />}
     {!hasBody && !thinking && <span className="shimmer">{thinking === "" ? "Thinking…" : "Preparing response…"}</span>}
   </div>
 )}
 {thinking ? <Thinking text={thinking} live={live && !hasBody} /> : null}

 <div className={`${fontSizeClass} text-neutral-200 break-words ${typed.typing && blocks.length > 0 ? "typing-caret" : ""}`}>
 {blocks.map((b, i) =>
 b.k === "md" ? (
 <Md key={i} text={b.text} />
 ) : b.k === "tools" ? (
 <ToolGroup key={`tools-${i}-${b.items[0]?.name ?? "t"}`} items={b.items} streaming={live && i === blocks.length - 1} />
 ) : b.k === "files" ? (
 <div key={i} className="w-full">
 {b.items.map((f) => (
 <FileCard key={f.path} file={f} onOpen={onOpenFile} />
 ))}
 </div>
 ) : (
 <WaitCountdown key={i} end={b.end} />
 )
 )}


 </div>

 {errorText && (
 <div className="mt-3 border border-red-500/20 bg-red-500/[0.06] p-3.5 text-[13.5px] text-red-300">
 <div className="flex items-start gap-2.5">
 <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
 <span className="leading-relaxed break-words min-w-0">{errorText}</span>
 </div>
 <div className="flex flex-wrap gap-2 mt-3 pl-6">
 {needsKey && (
 <button
 onClick={onOpenSettings}
 className="inline-flex items-center gap-1.5 h-8 px-3 bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition cursor-pointer"
 >
 <Key className="w-3.5 h-3.5" />
 Switch key
 </button>
 )}
 {isLast && !isStreaming && (
 <button
 onClick={onRegenerate}
 className="inline-flex items-center gap-1.5 h-8 px-3 bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition cursor-pointer"
 >
 <RotateCcw className="w-3.5 h-3.5" />
 Retry
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
 <button type="button" className={iconBtn} title="Copy" onClick={() => onCopy(msg.id, stripWait(body))}>
 {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
 </button>
 {isLast && (
 <button type="button" className={iconBtn} title="Retry" onClick={onRegenerate}>
 <RotateCcw className="w-3.5 h-3.5" />
 </button>
 )}
 </div>
 )}
 </div>
 );
}
