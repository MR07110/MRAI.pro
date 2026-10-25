"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey } from "@/types";
import ModelList from "./ModelList";
import { buildModelItems, fetchModelsCached } from "@/lib/modelsCatalog";

interface Props {
  keyItem: UserApiKey;
  /** the list stays open (in the quick dialog) */
  alwaysOpen?: boolean;
  /** called once a model is chosen and saved */
  onChanged?: (saved: UserApiKey) => void;
  heightClass?: string;
}

// Model field: clicking it shows ONLY the models for this key's provider, and the chosen one is saved.
export default function ModelField({ keyItem, alwaysOpen = false, onChanged, heightClass = "max-h-56" }: Props) {
  const [open, setOpen] = useState(alwaysOpen);
  const [loading, setLoading] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [current, setCurrent] = useState(keyItem.model || "");

  useEffect(() => {
    setCurrent(keyItem.model || "");
  }, [keyItem.model, keyItem.id]);

  // Catalog immediately; API in the background (also for Ollama — so it does not freeze).
  useEffect(() => {
    if (!open) return;
    let dead = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      if (!dead) setLoading(false); // the spinner disappears after 2.5s and the catalog shows
    }, 2500);
    fetchModelsCached(keyItem.id, keyItem.provider, keyItem.api_key, keyItem.base_url, keyItem.model || undefined)
      .then((m) => {
        if (!dead && m.length) setDiscovered(m);
      })
      .catch(() => {})
      .finally(() => {
        if (!dead) {
          setLoading(false);
          window.clearTimeout(t);
        }
      });
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
  }, [open, keyItem.id, keyItem.provider, keyItem.api_key, keyItem.base_url, keyItem.model]);

  const items = useMemo(
    () => buildModelItems(keyItem.provider, discovered),
    [keyItem.provider, discovered]
  );

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
      setErr(e?.message || "Could not save");
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
          className={`w-full h-10 px-3 flex items-center justify-between gap-2 border bg-black text-sm text-left transition cursor-pointer ${
            open ? "border-white/35" : "border-white/15 hover:border-white/30"
          }`}
        >
          <span className={`truncate ${current ? "text-neutral-100" : "text-neutral-300"}`}>
            {current || "Select a model"}
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
          Model: <span className={current ? "text-neutral-100" : "text-neutral-300"}>{current || "not selected"}</span>
        </p>
      )}

      {open && (
        <div className="mt-2">
          {loading && items.length === 0 ? (
            <div className="py-6 flex justify-center text-neutral-500">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-xs text-neutral-500">No models found</p>
          ) : (
            <>
              {loading && (
                <div className="pb-2 flex justify-center text-neutral-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                </div>
              )}
              <ModelList
                items={items}
                value={current}
                onChange={pick}
                heightClass={heightClass}
                allowTyped={keyItem.provider === "custom"}
              />
            </>
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
