"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey } from "@/types";
import KeyEditor from "./KeyEditor";
import ModelField from "./ModelField";
import { maskKey, shortProviderName } from "@/lib/modelsCatalog";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Provayderni almashtirish Sozlamalarda qilinadi */
  onOpenSettings?: () => void;
}

// Chat kiritish joyidan model tanlash oynasi: FAQAT faol provayder (bitta) va uning modellari ko'rinadi.
// Provayder Sozlamalar -> API kalitlar bo'limidan tanlanadi.
export default function QuickModel({ open, onClose, onOpenSettings }: Props) {
  const [keys, setKeys] = useState<UserApiKey[] | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys((await serverDb.getKeys()) || []);
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setKeys(null);
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, load]);

  if (!open) return null;

  const active = keys?.find((k) => k.is_default) || keys?.[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-neutral-900 text-neutral-100 border border-neutral-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-sm font-semibold">{active ? "Model tanlash" : "API kalit qo‘shish"}</h2>
          <button
            onClick={onClose}
            aria-label="Yopish"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5 pt-2">
          {keys === null ? (
            <div className="py-10 flex justify-center text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !active ? (
            <KeyEditor compact onCancel={onClose} onDone={() => load()} />
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-3">
                <p className="text-sm text-neutral-100">{shortProviderName(active.provider)}</p>
                <p className="text-[11px] text-neutral-500 font-mono mt-0.5">{maskKey(active.api_key)}</p>
              </div>

              <ModelField key={active.id} keyItem={active} alwaysOpen heightClass="max-h-64" onChanged={() => onClose()} />

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-xs text-neutral-500 hover:text-neutral-200 transition cursor-pointer"
                >
                  Provayderni o‘zgartirish: Sozlamalar → API kalitlar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
