"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { SkillEntry } from "@/lib/skillsCatalog";

interface Props {
  items: SkillEntry[];
  activeIndex: number;
  onHover: (i: number) => void;
  onPick: (s: SkillEntry) => void;
}

// The "/" skill picker: opens above the composer, filters live as the user types, fully keyboard-navigable
// (Up/Down/Enter/Tab handled by the composer) and clickable. Visually matches ModelMenu/ModelList.
export default function SkillSlashMenu({ items, activeIndex, onHover, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!items.length) return null;

  return (
    <div className="absolute left-0 bottom-full mb-2 z-40 w-full max-w-[26rem] border border-white/12 bg-neutral-950 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden ring-1 ring-black/40">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-white/15 text-[11px] text-neutral-500">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        <span>Skills — ↑↓ to choose, Enter/Tab to insert, Esc to dismiss</span>
      </div>
      <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
        {items.map((s, i) => (
          <button
            key={s.category + "/" + s.name}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault(); // keep textarea focus
              onPick(s);
            }}
            className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition cursor-pointer ${
              i === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[13px] ${i === activeIndex ? "text-white" : "text-neutral-200"}`}>/{s.name}</span>
                <span className="text-[10.5px] text-neutral-600 truncate">{s.category}</span>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500 line-clamp-2">{s.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
