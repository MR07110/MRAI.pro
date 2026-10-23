"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UserApiKey } from "@/types";
import ModelList from "./ModelList";
import { buildModelItems, fetchModelsCached, peekModels, shortProviderName } from "@/lib/modelsCatalog";

interface Props {
  keyItem: UserApiKey;
  onClose: () => void;
  onPick: (modelId: string) => void;
  onOpenSettings?: () => void;
}

// Kiritish joyidagi model chip ustida ochiladi (modal emas).
export default function ModelMenu({ keyItem, onClose, onPick, onOpenSettings }: Props) {
  const [discovered, setDiscovered] = useState<string[]>(() => peekModels(keyItem.id, keyItem.api_key) || []);
  const panelRef = useRef<HTMLDivElement>(null);
  const [openUp, setOpenUp] = useState(false);

  useEffect(() => {
    let dead = false;
    fetchModelsCached(keyItem.id, keyItem.provider, keyItem.api_key, keyItem.base_url, keyItem.model || undefined)
      .then((m) => {
        if (!dead && m.length) setDiscovered(m);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [keyItem.id, keyItem.provider, keyItem.api_key, keyItem.base_url, keyItem.model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pastga ochish afzal (bo'sh ekranda greetingni yopmasin).
  // Faqat pastki chetga yaqin bo'lsa — yuqoriga.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const anchor = el.offsetParent as HTMLElement | null;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const need = 320;
    setOpenUp(spaceBelow < need && spaceAbove > spaceBelow);
  }, [discovered.length]);

  const items = useMemo(() => buildModelItems(keyItem.provider, discovered), [keyItem.provider, discovered]);

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className={`absolute left-0 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/12 bg-neutral-950 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden ring-1 ring-black/40 ${
          openUp ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        <ModelList
          flat
          items={items}
          value={keyItem.model || ""}
          onChange={onPick}
          heightClass="max-h-72"
          allowTyped={keyItem.provider === "custom"}
          forceSearch
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-white/[0.08] bg-neutral-950 text-[11px] text-neutral-500">
          <span className="truncate">{shortProviderName(keyItem.provider)}</span>
          {onOpenSettings && (
            <button type="button" onClick={onOpenSettings} className="shrink-0 hover:text-neutral-200 transition cursor-pointer">
              Provayder / kalit
            </button>
          )}
        </div>
      </div>
    </>
  );
}
