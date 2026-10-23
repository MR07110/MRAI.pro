"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey } from "@/types";
import ModelList from "./ModelList";
import { buildModelItems, fetchModelsCached } from "@/lib/modelsCatalog";

interface Props {
  keyItem: UserApiKey;
  /** ro'yxat doim ochiq turadi (tezkor oynada) */
  alwaysOpen?: boolean;
  /** model tanlanib saqlangach chaqiriladi */
  onChanged?: (saved: UserApiKey) => void;
  heightClass?: string;
}

// Model maydoni: bosilsa FAQAT shu kalitning provayderiga tegishli modellar chiqadi, tanlangani saqlanadi.
export default function ModelField({ keyItem, alwaysOpen = false, onChanged, heightClass = "max-h-56" }: Props) {
  const [open, setOpen] = useState(alwaysOpen);
  const [loading, setLoading] = useState(false);
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [current, setCurrent] = useState(keyItem.model || "");

  useEffect(() => {
    setCurrent(keyItem.model || "");
  }, [keyItem.model, keyItem.id]);

  // Ro'yxat faqat ochilganda, bir marta yuklanadi.
  useEffect(() => {
    if (!open || discovered !== null) return;
    let dead = false;
    setLoading(true);
    fetchModelsCached(keyItem.id, keyItem.provider, keyItem.api_key, keyItem.base_url, keyItem.model || undefined)
      .then((m) => {
        if (!dead) setDiscovered(m);
      })
      .catch(() => {
        if (!dead) setDiscovered([]);
      })
      .finally(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [open, discovered, keyItem.id, keyItem.provider, keyItem.api_key, keyItem.base_url, keyItem.model]);

  const items = useMemo(() => buildModelItems(keyItem.provider, discovered || []), [keyItem.provider, discovered]);

  async function pick(id: string) {
    if (saving) return;
    if (id === current) {
      if (alwaysOpen) onChanged?.(keyItem);
      else setOpen(false);
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const saved = await serverDb.updateKey(keyItem.id, { model: id });
      setCurrent(id);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("mr_ai_keys_updated"));
      onChanged?.(saved);
      if (!alwaysOpen) setOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Saqlab bo‘lmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!alwaysOpen && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`w-full h-10 px-3 flex items-center justify-between gap-2 rounded-lg border bg-neutral-950 text-sm text-left transition cursor-pointer ${
            open ? "border-neutral-600" : "border-neutral-800 hover:border-neutral-700"
          }`}
        >
          <span className={`truncate ${current ? "text-neutral-100" : "text-amber-300"}`}>
            {current || "Model tanlang"}
          </span>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin text-neutral-400 shrink-0" />
          ) : (
            <ChevronDown className={`w-4 h-4 text-neutral-500 shrink-0 transition ${open ? "rotate-180" : ""}`} />
          )}
        </button>
      )}

      {alwaysOpen && (
        <p className="text-xs text-neutral-400 mb-1.5">
          Model: <span className={current ? "text-neutral-100" : "text-amber-300"}>{current || "tanlanmagan"}</span>
        </p>
      )}

      {open && (
        <div className="mt-2">
          {loading ? (
            <div className="py-6 flex justify-center text-neutral-500">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : (
            <ModelList
              items={items}
              value={current}
              onChange={pick}
              heightClass={heightClass}
              allowTyped={keyItem.provider === "custom"}
            />
          )}
        </div>
      )}

      {err && (
        <p className="mt-1.5 text-xs text-red-400" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
