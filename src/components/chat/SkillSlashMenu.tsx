"use client";

import { useEffect, useRef } from "react";
import { Loader2, Sparkles } from "lucide-react";

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
  onHover: (i: number) => void;
  onPick: (row: MenuRow) => void;
}

// The "/" skill picker: opens above the composer, filters live as the user types, fully keyboard-navigable
// (Up/Down/Enter/Tab handled by the composer) and clickable. Used for both the top-level category list
// and, one level down, a single category's skills — same look either way. Visually matches ModelMenu.
export default function SkillSlashMenu({ items, activeIndex, hint, loading, onHover, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!items.length && !loading) return null;

  return (
    <div className="absolute left-0 bottom-full mb-2 z-40 w-full max-w-[26rem] border border-white/12 bg-neutral-950 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden ring-1 ring-black/40">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-white/15 text-[11px] text-neutral-500">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{hint}</span>
      </div>
      <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
        {!items.length && loading && (
          <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-neutral-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {items.map((row, i) => (
          <button
            key={row.key}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault(); // keep textarea focus
              onPick(row);
            }}
            className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition cursor-pointer ${
              i === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[13px] ${i === activeIndex ? "text-white" : "text-neutral-200"}`}>/{row.title}</span>
                {row.subtitle && <span className="text-[10.5px] text-neutral-600 truncate">{row.subtitle}</span>}
              </div>
              {row.description && <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500 line-clamp-2">{row.description}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
