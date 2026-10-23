"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Check, ShieldAlert, TriangleAlert } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey, Provider } from "@/types";
import ModelList from "./ModelList";
import {
  PROVIDERS,
  buildModelItems,
  detectProvider,
  shortProviderName,
  validateKey,
} from "@/lib/modelsCatalog";

interface Props {
  /** berilsa — mavjud kalitni o'zgartirish, aks holda yangi kalit qo'shish */
  existing?: UserApiKey | null;
  compact?: boolean;
  onDone: (saved: UserApiKey) => void;
  onCancel: () => void;
}

type Status = "idle" | "checking" | "ok" | "auth" | "offline";

const LOCAL_URL = "http://localhost:11434/v1";

// Bitta maydon: kalitni joylaysiz → provayder aniqlanadi → kalit tekshiriladi → modellar chiqadi.
export default function KeyEditor({ existing = null, compact = false, onDone, onCancel }: Props) {
  const [keyInput, setKeyInput] = useState(existing?.api_key || "");
  const [reveal, setReveal] = useState(false);
  const [manualProvider, setManualProvider] = useState<Provider | null>(
    existing?.provider === "custom" ? "custom" : null
  );
  const [baseUrl, setBaseUrl] = useState(existing?.base_url || LOCAL_URL);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ provider: string; id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const trimmed = keyInput.trim();
  const det = useMemo(() => detectProvider(trimmed), [trimmed]);

  const provider: Provider | null = useMemo(() => {
    if (manualProvider === "custom") return "custom";
    if (det.provider) return det.provider;
    if (det.candidates.length) {
      const pick = manualProvider ?? (existing && det.candidates.includes(existing.provider) ? existing.provider : null);
      return pick && det.candidates.includes(pick) ? pick : null;
    }
    return manualProvider ?? existing?.provider ?? null;
  }, [det, manualProvider, existing]);

  const isCustom = provider === "custom";
  const effectiveBase = isCustom
    ? baseUrl.trim()
    : provider && existing && provider === existing.provider
      ? existing.base_url || undefined
      : undefined;

  // Kalit/provayder o'zgarsa — debounce bilan tekshirib, modellarni olamiz.
  useEffect(() => {
    if (!provider || (!isCustom && trimmed.length < 10)) {
      setStatus("idle");
      setModels([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("checking");
      setError("");
      try {
        const r = await validateKey(provider, trimmed || "ollama", effectiveBase, existing?.model, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (r.valid) {
          setStatus("ok");
          setModels(r.models);
        } else {
          setStatus(r.auth ? "auth" : "offline");
          setError(r.error || "");
          setModels([]);
        }
      } catch {
        /* bekor qilindi */
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, trimmed, effectiveBase]);

  const items = useMemo(() => buildModelItems(provider, models), [provider, models]);

  const model = useMemo(() => {
    if (!provider) return "";
    if (picked && picked.provider === provider) return picked.id;
    if (existing && existing.provider === provider && existing.model) return existing.model;
    const def = PROVIDERS.find((p) => p.value === provider)?.defaultModel;
    if (def && items.some((i) => i.id === def)) return def;
    return items[0]?.id || "";
  }, [picked, existing, provider, items]);

  const showModels =
    !!provider &&
    (status === "ok" ||
      status === "offline" ||
      (status === "checking" && !!existing && existing.provider === provider));

  const needsProvider = !provider && trimmed.length >= 8;
  const canSave = !!provider && !!model && status !== "checking" && status !== "auth" && (status !== "idle" || !!existing);

  async function save() {
    if (!provider || !model || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const key = trimmed || "ollama";
      const base_url = isCustom ? baseUrl.trim() || null : existing && existing.provider === provider ? existing.base_url ?? null : null;
      let saved: UserApiKey;
      if (existing) {
        saved = await serverDb.updateKey(existing.id, {
          provider,
          api_key: key,
          model,
          base_url,
          name: existing.provider === provider ? existing.name : shortProviderName(provider),
        });
      } else {
        saved = await serverDb.saveKey({
          provider,
          name: shortProviderName(provider),
          api_key: key,
          model,
          base_url,
          is_default: true,
        });
      }
      if (typeof window !== "undefined") window.dispatchEvent(new Event("mr_ai_keys_updated"));
      onDone(saved);
    } catch (e: any) {
      setSaveError(e?.message || "Saqlab bo‘lmadi");
      setSaving(false);
    }
  }

  const inputCls =
    "w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none transition";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <div className="relative">
          <input
            autoFocus={!existing}
            type={reveal ? "text" : "password"}
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              setPicked(null);
              setSaveError("");
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label="API kalit"
            placeholder={isCustom ? "API kalit (Ollama uchun shart emas)" : "API kalitni shu yerga joylang"}
            className={`${inputCls} pr-11 font-mono`}
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Kalitni yashirish" : "Kalitni ko‘rsatish"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-neutral-500 hover:text-neutral-200 transition cursor-pointer"
          >
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* holat qatori */}
        <div className="min-h-6 mt-2 text-xs leading-5" aria-live="polite">
          {status === "checking" && (
            <span className="inline-flex items-center gap-1.5 text-neutral-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Tekshirilmoqda…
            </span>
          )}
          {status === "ok" && provider && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              {shortProviderName(provider)} kaliti tasdiqlandi
              {items.length > 0 && <span className="text-neutral-500">· {items.length} ta model</span>}
            </span>
          )}
          {status === "auth" && (
            <span className="inline-flex items-start gap-1.5 text-red-400">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error || "Kalit yaroqsiz"}</span>
            </span>
          )}
          {status === "offline" && (
            <span className="inline-flex items-start gap-1.5 text-amber-400">
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Kalitni tekshirib bo‘lmadi{error ? ` (${error})` : ""}. Baribir saqlash mumkin.</span>
            </span>
          )}
          {status === "idle" && !trimmed && !isCustom && !existing && (
            <span className="text-neutral-500">
              Groq, OpenAI, Claude, Gemini va boshqalar. Kalit turi o‘zi aniqlanadi.
            </span>
          )}
        </div>
      </div>

      {/* Provayderni aniqlab bo'lmasa — bitta teging */}
      {needsProvider && (
        <div>
          <p className="text-xs text-neutral-400 mb-2">
            {det.candidates.length ? "Bu kalit qaysi xizmatniki?" : "Kalit turi aniqlanmadi. Xizmatni tanlang."}
          </p>
          {det.candidates.length ? (
            <div className="flex flex-wrap gap-2">
              {det.candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setManualProvider(c)}
                  className="px-3.5 h-9 rounded-lg border border-neutral-800 text-sm text-neutral-200 hover:border-neutral-600 hover:text-white transition cursor-pointer"
                >
                  {shortProviderName(c)}
                </button>
              ))}
            </div>
          ) : (
            <select
              value=""
              onChange={(e) => e.target.value && setManualProvider(e.target.value as Provider)}
              className={`${inputCls} cursor-pointer`}
              aria-label="Xizmat"
            >
              <option value="" className="bg-neutral-900">
                Xizmatni tanlang
              </option>
              {PROVIDERS.filter((p) => p.value !== "custom").map((p) => (
                <option key={p.value} value={p.value} className="bg-neutral-900">
                  {shortProviderName(p.value)}
                </option>
              ))}
              <option value="custom" className="bg-neutral-900">
                Ollama (mahalliy)
              </option>
            </select>
          )}
        </div>
      )}

      {/* Mahalliy / boshqa manzil */}
      {isCustom ? (
        <div>
          <label className="block text-xs text-neutral-400 mb-1.5">Manzil (Base URL)</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={LOCAL_URL}
            spellCheck={false}
            className={`${inputCls} font-mono text-xs`}
          />
          {!existing && (
            <button
              type="button"
              onClick={() => setManualProvider(null)}
              className="mt-2 text-xs text-neutral-500 hover:text-neutral-200 transition cursor-pointer"
            >
              Oddiy kalitga qaytish
            </button>
          )}
        </div>
      ) : (
        !existing &&
        !trimmed && (
          <button
            type="button"
            onClick={() => setManualProvider("custom")}
            className="text-xs text-neutral-500 hover:text-neutral-200 transition cursor-pointer"
          >
            Mahalliy model (Ollama) yoki o‘z manzilim bor
          </button>
        )
      )}

      {showModels && (
        <div>
          <p className="text-xs font-medium text-neutral-300 mb-1.5">Model</p>
          <ModelList
            items={items}
            value={model}
            onChange={(id) => provider && setPicked({ provider, id })}
            heightClass={compact ? "max-h-44" : "max-h-60"}
          />
        </div>
      )}

      {saveError && (
        <p className="text-xs text-red-400" role="alert">
          {saveError}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 h-11 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800 transition cursor-pointer disabled:opacity-50"
        >
          Bekor qilish
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="flex-1 h-11 rounded-xl bg-white text-neutral-950 text-sm font-semibold hover:bg-neutral-200 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {existing ? "Saqlash" : "Qo‘shish"}
        </button>
      </div>
    </div>
  );
}
