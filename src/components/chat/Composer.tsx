"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Key, Loader2, Plus, Square, X } from "lucide-react";
import { fmtSize, kindOf, type FileRef } from "./fileKind";
import SkillSlashMenu from "./SkillSlashMenu";
import { fetchSkillsCatalog, filterSkills, peekSkillsCatalog, type SkillEntry } from "@/lib/skillsCatalog";

// Matches a bare, in-progress slash command: "/" plus a partial name and nothing else yet (no space).
// The instant a space (or anything else) follows, the menu phase is over — matches the server's own
// slash-command parsing in agent.ts, so what you pick here is exactly what gets invoked.
const SLASH_RE = /^\/([A-Za-z0-9][\w./-]*)$/;

export default function Composer({
 value,
 onChange,
 onKeyDown,
 onSend,
 onStop,
 isStreaming,
 textareaRef,
 fontSizeClass,
 modelLabel,
 onModel,
 modelMenu,
 placeholder,
 autoFocus,
 attachments = [],
 onAttach,
 onRemoveAttachment,
 uploading = false,
}: {
 value: string;
 onChange: (v: string) => void;
 onKeyDown: (e: React.KeyboardEvent) => void;
 onSend: () => void;
 onStop: () => void;
 isStreaming: boolean;
 textareaRef: React.RefObject<HTMLTextAreaElement | null>;
 fontSizeClass: string;
 modelLabel: string | null;
 onModel: () => void;
 modelMenu?: React.ReactNode;
 placeholder?: string;
 autoFocus?: boolean;
 attachments?: FileRef[];
 onAttach?: (files: File[]) => void;
 onRemoveAttachment?: (path: string) => void;
 uploading?: boolean;
}) {
 const fileInputRef = useRef<HTMLInputElement>(null);
 const [dragging, setDragging] = useState(false);

 // "/" skill picker: opens above the composer, filters live on every keystroke.
 const [skills, setSkills] = useState<SkillEntry[]>(() => peekSkillsCatalog() || []);
 const [focused, setFocused] = useState(false);
 const [dismissed, setDismissed] = useState(false); // Esc hides it; any further edit un-hides it
 const [activeIndex, setActiveIndex] = useState(0);
 const slashMatch = value.match(SLASH_RE);
 const slashQuery = slashMatch?.[1] ?? null;
 const menuItems = useMemo(() => (slashQuery === null ? [] : filterSkills(skills, slashQuery)), [skills, slashQuery]);
 const menuOpen = focused && !dismissed && slashQuery !== null && menuItems.length > 0;

 useEffect(() => {
 if (autoFocus && typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
 textareaRef.current?.focus();
 }
 }, [autoFocus, textareaRef]);

 // Load the catalog lazily, the first time "/" is typed — not on every page load.
 useEffect(() => {
 if (slashQuery !== null && skills.length === 0) {
 fetchSkillsCatalog().then(setSkills);
 }
 }, [slashQuery, skills.length]);

 // Keep the highlighted row in range as the filtered list changes while typing.
 useEffect(() => {
 setActiveIndex((i) => Math.min(i, Math.max(0, menuItems.length - 1)));
 }, [menuItems.length]);

 function pickSkill(s: SkillEntry) {
 onChange(`/${s.name} `);
 setActiveIndex(0);
 setDismissed(true); // the command is complete; do not immediately reopen on its own text
 textareaRef.current?.focus();
 }

 function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
 if (menuOpen) {
 if (e.key === "ArrowDown") {
 e.preventDefault();
 setActiveIndex((i) => (i + 1) % menuItems.length);
 return;
 }
 if (e.key === "ArrowUp") {
 e.preventDefault();
 setActiveIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
 return;
 }
 if (e.key === "Enter" || e.key === "Tab") {
 e.preventDefault();
 pickSkill(menuItems[activeIndex]);
 return;
 }
 if (e.key === "Escape") {
 e.preventDefault();
 setDismissed(true); // closes the menu; editing the text again reopens it
 return;
 }
 }
 onKeyDown(e);
 }

 const canAttach = !!onAttach;
 const canSend = value.trim().length > 0 || attachments.length > 0;

 const pickFiles = (list: FileList | null) => {
 if (!list || !list.length || !onAttach) return;
 onAttach(Array.from(list));
 };

 return (
 <div
 className={`relative w-full border bg-black transition-colors ${
 dragging ? "border-white/60 bg-white/[0.03]" : "border-white/20 focus-within:border-white/40"
 }`}
 onDragOver={(e) => {
 if (!canAttach) return;
 e.preventDefault();
 setDragging(true);
 }}
 onDragLeave={(e) => {
 if (!canAttach) return;
 e.preventDefault();
 setDragging(false);
 }}
 onDrop={(e) => {
 if (!canAttach) return;
 e.preventDefault();
 setDragging(false);
 pickFiles(e.dataTransfer.files);
 }}
 >
 {menuOpen && <SkillSlashMenu items={menuItems} activeIndex={activeIndex} onHover={setActiveIndex} onPick={pickSkill} />}

 {attachments.length > 0 && (
 <div className="flex flex-wrap gap-2 px-3 pt-3">
 {attachments.map((f) => (
 <div
 key={f.path}
 className="group/att flex items-center gap-2 max-w-[16rem] border border-white/15 bg-white/[0.04] pl-2.5 pr-1.5 py-1.5"
 title={f.name}
 >
 <span className="text-[10px] font-mono uppercase text-neutral-500 shrink-0">{kindOf(f.name)}</span>
 <span className="truncate text-[12.5px] text-neutral-200">{f.name}</span>
 {f.size ? <span className="text-[11px] text-neutral-500 shrink-0">{fmtSize(f.size)}</span> : null}
 {onRemoveAttachment && (
 <button
 type="button"
 onClick={() => onRemoveAttachment(f.path)}
 title="Remove"
 className="shrink-0 w-5 h-5 inline-flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.1] transition cursor-pointer"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 )}
 </div>
 ))}
 {uploading && (
 <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-neutral-400">
 <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
 </div>
 )}
 </div>
 )}

 <textarea
 ref={textareaRef}
 value={value}
 onChange={(e) => {
 setDismissed(false);
 onChange(e.target.value);
 }}
 onKeyDown={handleKeyDown}
 onFocus={() => setFocused(true)}
 onBlur={() => setFocused(false)}
 onPaste={(e) => {
 if (!canAttach) return;
 const files = Array.from(e.clipboardData.files || []);
 if (files.length) {
 e.preventDefault();
 onAttach?.(files);
 }
 }}
 placeholder={placeholder || "Send a message…"}
 rows={1}
 className={`block w-full resize-none bg-transparent px-5 pt-4 pb-2 ${fontSizeClass} leading-6 text-neutral-100 placeholder:text-neutral-600 max-h-[220px]`}
 />
 <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
 <div className="flex items-center gap-1 min-w-0 max-w-[78%]">
 {canAttach && (
 <>
 <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
 <button
 type="button"
 onClick={() => fileInputRef.current?.click()}
 title="Attach files"
 className="shrink-0 w-8 h-8 inline-flex items-center justify-center border border-white/15 text-neutral-300 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
 >
 <Plus className="w-4 h-4" strokeWidth={2.2} />
 </button>
 </>
 )}
 <div className="relative z-10 min-w-0">
 {modelMenu}
 <button
 type="button"
 onClick={onModel}
 title="Switch model / key"
 className="inline-flex items-center gap-1.5 max-w-full h-8 px-2.5 text-[12.5px] text-neutral-400 hover:text-white hover:bg-white/[0.07] transition cursor-pointer"
 >
 {modelLabel ? (
 <>
 <span className="w-1.5 h-1.5 bg-emerald-400 shrink-0" />
 <span className="truncate">{modelLabel}</span>
 </>
 ) : (
 <>
 <Key className="w-3.5 h-3.5 shrink-0 text-amber-400" />
 <span className="text-amber-300">Add API key</span>
 </>
 )}
 <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
 </button>
 </div>
 </div>

 {isStreaming && !canSend ? (
 <button
 type="button"
 onClick={onStop}
 title="Stop"
 className="w-8 h-8 bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition cursor-pointer"
 >
 <Square className="w-3 h-3 fill-current" />
 </button>
 ) : (
 <button
 type="button"
 onClick={onSend}
 disabled={!canSend}
 title={isStreaming ? "Add to queue (Enter)" : "Send"}
 className="w-8 h-8 bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
 >
 <ArrowUp className="w-4 h-4" strokeWidth={2.4} />
 </button>
 )}
 </div>
 </div>
 );
}
