"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { ModelItem } from "@/lib/modelsCatalog";

interface Props {
  items: ModelItem[];
  value: string;
  onChange: (id: string) => void;
  /** ro'yxat balandligi (Tailwind max-h klassi) */
  heightClass?: string;
  /** ro'yxatda yo'q nomni qo'lda yozib ishlatishga ruxsat (faqat mahalliy/custom uchun) */
  allowTyped?: boolean;
  /** tashqi chegarasiz (menyu ichida) */
  flat?: boolean;
  /** menyuda har doim qidiruv paneli */
  forceSearch?: boolean;
}

// Qidiruvli model ro'yxati. Ro'yxatda yo'q nomni yozsa, "shu nomni ishlatish" qatori chiqadi.
export default function ModelList({ items, value, onChange, heightClass = "max-h-60", allowTyped = true, flat = false, forceSearch = false }: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const base = value && !items.some((i) => i.id === value)
      ? [{ id: value, name: value, free: false, recommended: false } as ModelItem, ...items]
      : items;
    if (!q) return base;
    return base.filter((i) => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  }, [items, value, q]);

  const canUseTyped = allowTyped && q.length > 0 && !items.some((i) => i.id.toLowerCase() === q);

  return (
    <div className={flat ? "overflow-hidden bg-neutral-950" : "rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden"}>
      {(forceSearch || items.length > 6 || q) && (
        <label className="flex items-center gap-2 px-3 h-10 border-b border-neutral-800 text-neutral-500 focus-within:text-neutral-300">
          <Search className="w-4 h-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={allowTyped ? "Model qidirish yoki nomini yozish" : "Model qidirish"}
            className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
          />
        </label>
      )}

      <div role="listbox" className={`${heightClass} overflow-y-auto py-1`}>
        {canUseTyped && (
          <button
            type="button"
            onClick={() => {
              onChange(query.trim());
              setQuery("");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900 focus-visible:bg-neutral-900 focus-visible:outline-none cursor-pointer"
          >
            <span className="truncate">
              “{query.trim()}” modelini ishlatish
            </span>
          </button>
        )}

        {rows.map((m) => {
          const selected = m.id === value;
          return (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(m.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition focus-visible:outline-none focus-visible:bg-neutral-900 cursor-pointer ${
                selected ? "bg-neutral-900" : "hover:bg-neutral-900/70"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className={`block text-sm leading-snug ${selected ? "text-white font-medium" : "text-neutral-200"}`}>
                  {m.name}
                </span>
                {m.name !== m.id && (
                  <span className="block truncate text-[11px] text-neutral-500 font-mono">{m.id}</span>
                )}
              </span>
              {m.free && <span className="text-[11px] text-emerald-400/90 shrink-0">bepul</span>}
              <Check className={`w-4 h-4 shrink-0 ${selected ? "text-white" : "text-transparent"}`} />
            </button>
          );
        })}

        {rows.length === 0 && !canUseTyped && (
          <p className="px-3 py-4 text-sm text-neutral-500">Model topilmadi.</p>
        )}
      </div>
    </div>
  );
}
