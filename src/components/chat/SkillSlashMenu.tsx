"use client";

import { useEffect, useRef } from "react";
import { Loader2, Search } from "lucide-react";
import Highlight from "../Highlight";

export interface MenuRow {
  key: string;
  /** Rendered as "/<title>" (include a trailing "/" yourself for a category row). */
  title: string;
  subtitle?: string;
  description?: string;
}

interface Props {
  items: MenuRow[];
  activeIndex: number;
  hint: string;
  loading?: boolean;
  /** Text being searched (mirrors what follows the "/" in the composer) — matches are marked yellow. */
  query: string;
  searchPlaceholder: string;
  onQuery: (q: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSearchFocus: () => void;
  onSearchBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onHover: (i: number) => void;
  onPick: (row: MenuRow) => void;
}

// The "/" skill picker: opens above the composer with its own search box, filters live as the user types
// (in the composer or in the box — they stay in sync), fully keyboard-navigable (Up/Down/Enter/Tab handled by
// the composer) and clickable. Used for both the top-level category list and, one level down, a single
// category's skills — same look either way. Visually matches ModelMenu.
export default function SkillSlashMenu({
  items,
  activeIndex,
  hint,
  loading,
  query,
  searchPlaceholder,
  onQuery,
  onSearchKeyDown,
  onSearchFocus,
  onSearchBlur,
  onHover,
  onPick,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute left-0 bottom-full mb-2 z-40 w-full max-w-[26rem] border border-white/12 bg-neutral-950 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden ring-1 ring-black/40">
      <div className="relative border-b border-white/15">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
        <input
          data-skill-search="1"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          onFocus={onSearchFocus}
          onBlur={onSearchBlur}
          placeholder={searchPlaceholder}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="h-10 w-full bg-transparent pl-9 pr-3 text-[13px] font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
        />
      </div>
      <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
        {!items.length && loading && (
          <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-neutral-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {!items.length && !loading && <div className="px-3 py-3 text-[12.5px] text-neutral-500">Nothing found.</div>}
        {items.map((row, i) => (
          <button
            key={row.key}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault(); // keep focus where it is (composer or search box)
              onPick(row);
            }}
            className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition cursor-pointer ${
              i === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[13px] ${i === activeIndex ? "text-white" : "text-neutral-200"}`}>
                  /<Highlight text={row.title} query={query} />
                </span>
                {row.subtitle && <span className="text-[10.5px] text-neutral-600 truncate">{row.subtitle}</span>}
              </div>
              {row.description && (
                <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500 line-clamp-2">
                  <Highlight text={row.description} query={query} />
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="px-3 h-7 flex items-center border-t border-white/10 text-[10.5px] text-neutral-600">
        <span className="truncate">{hint}</span>
      </div>
    </div>
  );
}
