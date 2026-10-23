"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserApiKey } from "@/types";
import ModelList from "./ModelList";
import { buildModelItems, fetchModelsCached, peekModels, shortProviderName } from "@/lib/modelsCatalog";

interface Props {
  keyItem: UserApiKey;
  onClose: () => void;
  /** Tanlov DARHOL qo'llanadi (optimistik); saqlash fonda ketadi */
  onPick: (modelId: string) => void;
  onOpenSettings?: () => void;
}

// Kiritish joyidagi model chip'i ustida (yuqoriga) ochiladigan menyu: alohida modal EMAS.
// Tez ochilishi uchun: faol kalit tayyor (tarmoq yo'q), ro'yxat darhol keshdan/katalogdan chiqadi,
// provayderning to'liq ro'yxati esa fonda yangilanadi.
export default function ModelMenu({ keyItem, onClose, onPick, onOpenSettings }: Props) {
  const [discovered, setDiscovered] = useState<string[]>(() => peekModels(keyItem.id, keyItem.api_key) || []);

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

  const items = useMemo(() => buildModelItems(keyItem.provider, discovered), [keyItem.provider, discovered]);

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute bottom-full left-0 mb-2 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#161616] shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        <ModelList
          flat
          items={items}
          value={keyItem.model || ""}
          onChange={onPick}
          heightClass="max-h-72"
          allowTyped={keyItem.provider === "custom"}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-white/[0.06] text-[11px] text-neutral-500">
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
