"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey } from "@/types";
import KeyEditor from "./KeyEditor";
import ModelField from "./ModelField";
import { maskKey, shortProviderName } from "@/lib/modelsCatalog";

interface Props {
  compact?: boolean;
  /** kalit tanlanganda yoki saqlanganda chaqiriladi (tezkor oynani yopish uchun) */
  onSelected?: () => void;
}

type Mode = { type: "list" } | { type: "edit"; key: UserApiKey | null };

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mr_ai_keys_updated"));
}

// Kalitlar ro'yxati + qo'shish/o'zgartirish. Sozlamalarda ham, chat kiritish joyidan ochiladigan oynada ham shu ishlatiladi.
export default function KeysManager({ compact = false, onSelected }: Props) {
  const [keys, setKeys] = useState<UserApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys((await serverDb.getKeys()) || []);
    } catch {
      setKeys([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pick(k: UserApiKey) {
    if (busyId) return;
    if (!k.is_default) {
      setBusyId(k.id);
      await serverDb.setDefaultKey(k.id);
      notify();
      await load();
      setBusyId(null);
    }
    onSelected?.();
  }

  async function remove(k: UserApiKey) {
    if (!confirm("Bu kalitni o‘chirmoqchimisiz?")) return;
    setBusyId(k.id);
    await serverDb.deleteKey(k.id);
    const rest = keys.filter((x) => x.id !== k.id);
    if (k.is_default && rest[0]) await serverDb.setDefaultKey(rest[0].id);
    notify();
    await load();
    setBusyId(null);
  }

  if (loading) {
    return (
      <div className="py-10 flex justify-center text-neutral-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  // Kalit yo'q bo'lsa — to'g'ridan-to'g'ri kiritish maydoni.
  const view: Mode = keys.length === 0 ? { type: "edit", key: null } : mode;

  if (view.type === "edit") {
    return (
      <div>
        {keys.length > 0 && (
          <button
            type="button"
            onClick={() => setMode({ type: "list" })}
            className="mb-3 text-xs text-neutral-400 hover:text-white transition cursor-pointer"
          >
            ← Orqaga
          </button>
        )}
        <KeyEditor
          key={view.key?.id || "new"}
          existing={view.key}
          compact={compact}
          onCancel={() => (keys.length > 0 ? setMode({ type: "list" }) : onSelected?.())}
          onDone={async () => {
            await load();
            setMode({ type: "list" });
            onSelected?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <div
          key={k.id}
          className={`rounded-xl border transition ${
            k.is_default
              ? "border-neutral-600 bg-neutral-950"
              : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-700"
          }`}
        >
          <div className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => pick(k)}
              title="Faol provayder qilish"
              className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer"
            >
              <span
                className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                  k.is_default ? "border-emerald-400 bg-emerald-400" : "border-neutral-600"
                }`}
              >
                {busyId === k.id ? (
                  <Loader2 className="w-3 h-3 animate-spin text-neutral-300" />
                ) : (
                  k.is_default && <Check className="w-3 h-3 text-neutral-950" strokeWidth={3} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-neutral-100 truncate">
                  {shortProviderName(k.provider)}
                  {k.is_default && <span className="ml-2 text-[11px] text-emerald-400">faol</span>}
                </span>
                <span className="block text-[11px] text-neutral-500 font-mono mt-0.5">{maskKey(k.api_key)}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode({ type: "edit", key: k })}
              title="Kalitni o‘zgartirish"
              aria-label="O‘zgartirish"
              className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => remove(k)}
              title="O‘chirish"
              aria-label="O‘chirish"
              className="p-2 mr-1 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-950/40 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3.5 pb-3">
            <ModelField keyItem={k} onChanged={() => load()} />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setMode({ type: "edit", key: null })}
        className="w-full h-11 rounded-xl border border-dashed border-neutral-800 text-sm text-neutral-400 hover:text-white hover:border-neutral-600 transition cursor-pointer flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Yangi kalit
      </button>
    </div>
  );
}
