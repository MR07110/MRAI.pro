"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Key, Loader2, Plus, Square, X } from "lucide-react";
import { fmtSize, kindOf, type FileRef } from "./fileKind";
import SkillSlashMenu, { type MenuRow } from "./SkillSlashMenu";
import {
 fetchCategoryNames,
 fetchSkillsInCategory,
 filterCategoryNames,
 filterSkills,
 peekCategoryNames,
 peekSkillsInCategory,
  onSkillsCacheChange,
  watchForNewSkills,
 type SkillEntry,
} from "@/lib/skillsCatalog";

// Two levels, each bare and in-progress (no space yet — the instant one follows, the menu phase is
// over, matching the server's own slash-command parsing in agent.ts):
//   "/"              or "/partial-cat"            -> category phase
//   "/category/"     or "/category/partial-skill" -> skill phase, inside that one category
const CATEGORY_RE = /^\/([A-Za-z0-9][\w-]*)?$/;
const SKILL_RE = /^\/([A-Za-z0-9][\w-]*)\/([\w./-]*)$/;

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

 // "/" skill picker: opens above the composer, filters live on every keystroke. Two levels:
 // "/" -> all categories; "/category/" -> that category's skills.
 const [categories, setCategories] = useState<string[]>(() => peekCategoryNames() || []);
 const [categorySkills, setCategorySkills] = useState<SkillEntry[]>([]);
 const [loadedCategory, setLoadedCategory] = useState<string | null>(null);
 const [focused, setFocused] = useState(false);
 const [dismissed, setDismissed] = useState(false); // Esc hides it; any further edit un-hides it
 const [activeIndex, setActiveIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false); // the menu's own search box has focus
  const mirrorRef = useRef<HTMLDivElement>(null);

 const skillMatch = value.match(SKILL_RE);
 const catMatch = !skillMatch ? value.match(CATEGORY_RE) : null;
 const phase: "category" | "skill" | null = skillMatch ? "skill" : catMatch ? "category" : null;
 const activeCategory = skillMatch?.[1] ?? null;
 const query = phase === "skill" ? skillMatch![2] ?? "" : phase === "category" ? catMatch?.[1] ?? "" : "";

 const categoriesLoading = phase === "category" && categories.length === 0;
 const skillsLoading = phase === "skill" && loadedCategory !== activeCategory;

 const menuItems: MenuRow[] = useMemo(() => {
 if (phase === "category") return filterCategoryNames(categories, query).map((name) => ({ key: name, title: `${name}/` }));
 if (phase === "skill" && loadedCategory === activeCategory) {
 return filterSkills(categorySkills, query, 8).map((s) => ({ key: s.name, title: s.name, description: s.description }));
 }
 return [];
 }, [phase, categories, categorySkills, loadedCategory, activeCategory, query]);

 const menuOpen = focused && !dismissed && phase !== null && (menuItems.length > 0 || categoriesLoading || skillsLoading || searchFocused);
 const menuHint =
 phase === "skill"
 ? `Skills in ${activeCategory} — ↑↓, Enter/Tab to insert, Esc to dismiss`
 : "Skill categories — ↑↓, Enter/Tab to open, Esc to dismiss";

 useEffect(() => {
 if (autoFocus && typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
 textareaRef.current?.focus();
 }
 }, [autoFocus, textareaRef]);

 // Load category names lazily, the first time "/" is typed — not on every page load.
 useEffect(() => {
 if (phase === "category" && categories.length === 0) {
 fetchCategoryNames().then(setCategories);
 }
 }, [phase, categories.length]);

 // Load one category's skills lazily, the moment that category is entered (typed or picked).
 useEffect(() => {
 if (phase !== "skill" || !activeCategory || loadedCategory === activeCategory) return;
 const cached = peekSkillsInCategory(activeCategory);
 if (cached) {
 setCategorySkills(cached);
 setLoadedCategory(activeCategory);
 return;
 }
 fetchSkillsInCategory(activeCategory).then((list) => {
 setCategorySkills(list);
 setLoadedCategory(activeCategory);
 });
 }, [phase, activeCategory, loadedCategory]);

 // Keep the highlighted row in range as the filtered list changes while typing.
 useEffect(() => {
 setActiveIndex((i) => Math.min(i, Math.max(0, menuItems.length - 1)));
 }, [menuItems.length]);

 // Keep the picker's copy of the catalog in step with the shared cache (prefetch finishing, a new skill
  // appearing on the computer) and poll for changes only while the menu is actually open.
  useEffect(() => {
    return onSkillsCacheChange(() => {
      const c = peekCategoryNames();
      if (c) setCategories(c);
      if (activeCategory) {
        const list = peekSkillsInCategory(activeCategory);
        if (list) setCategorySkills(list);
      }
    });
  }, [activeCategory]);
  useEffect(() => {
    if (!menuOpen) return;
    return watchForNewSkills();
  }, [menuOpen]);

  // The menu's search box edits the same text that follows the "/" in the composer, so both stay in sync.
  const queryPrefix = phase === "skill" && activeCategory ? `/${activeCategory}/` : "/";
  function onSearchQuery(q: string) {
    let clean = q.replace(/\s+/g, "-");
    clean = phase === "skill" ? clean.replace(/[^\w./-]/g, "") : clean.replace(/[^\w-]/g, "").replace(/^[^A-Za-z0-9]+/, "");
    setDismissed(false);
    setActiveIndex(0);
    onChange(queryPrefix + clean);
  }

  function pickRow(row: MenuRow) {
 if (phase === "category") {
 onChange(`/${row.key}/`); // drops straight into skill-phase for this category
 setActiveIndex(0);
 textareaRef.current?.focus();
 return;
 }
 if (phase === "skill" && activeCategory) {
 onChange(`/${activeCategory}/${row.key} `);
 setActiveIndex(0);
 setDismissed(true); // the command is complete; do not immediately reopen on its own text
 textareaRef.current?.focus();
 }
 }

 // Shared by the textarea and the menu's search box. Returns true when the key was a menu key.
  function menuKey(e: React.KeyboardEvent<HTMLElement>): boolean {
    if (!menuOpen) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true); // closes the menu; editing the text again reopens it
      textareaRef.current?.focus();
      return true;
    }
    if (menuItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % menuItems.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickRow(menuItems[activeIndex]);
        return true;
      }
    }
    return false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuKey(e)) return;
    onKeyDown(e);
  }

  // "/category/skill" at the start of the message = a skill command: shown in blue (and never spell-checked)
  const pathMatch = value.match(/^\/[A-Za-z0-9][\w-]*\/[\w.-]*/);
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
 {menuOpen && (
 <SkillSlashMenu
            items={menuItems}
            activeIndex={activeIndex}
            hint={menuHint}
            loading={categoriesLoading || skillsLoading}
            query={query}
            searchPlaceholder={phase === "skill" ? `Search ${activeCategory}…` : "Search categories…"}
            onQuery={onSearchQuery}
            onSearchKeyDown={menuKey}
            onSearchFocus={() => {
              setFocused(true);
              setSearchFocused(true);
            }}
            onSearchBlur={(e) => {
              setSearchFocused(false);
              if (e.relatedTarget !== textareaRef.current) setFocused(false);
            }}
            onHover={setActiveIndex}
            onPick={pickRow}
          />
 )}

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

 <div className="relative">
          {pathMatch && (
            <div
              ref={mirrorRef}
              aria-hidden
              className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-5 pt-4 pb-2 ${fontSizeClass} leading-6 text-neutral-100`}
            >
              <span className="text-sky-400">{value.slice(0, pathMatch[0].length)}</span>
              {value.slice(pathMatch[0].length)}
              {"\u200b"}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            spellCheck={value.startsWith("/") ? false : undefined}
            onChange={(e) => {
              setDismissed(false);
              onChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              // moving focus into the menu's own search box must not close the menu
              if ((e.relatedTarget as HTMLElement | null)?.dataset?.skillSearch) return;
              setFocused(false);
            }}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
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
            className={`relative block w-full resize-none bg-transparent px-5 pt-4 pb-2 ${fontSizeClass} leading-6 ${
              pathMatch ? "text-transparent caret-white" : "text-neutral-100"
            } placeholder:text-neutral-600 max-h-[220px]`}
          />
        </div>
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
