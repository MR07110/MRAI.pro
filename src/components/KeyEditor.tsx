"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Check, ShieldAlert, TriangleAlert } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey, Provider } from "@/types";
import { PROVIDERS, providerHasFree, detectProvider, shortProviderName, validateKey } from "@/lib/modelsCatalog";

interface Props {
 /** if given — edit an existing key, otherwise add a new key */
 existing?: UserApiKey | null;
 compact?: boolean;
 onDone: (saved: UserApiKey) => void;
 onCancel: () => void;
}

type Status = "idle" | "checking" | "ok" | "auth" | "offline";

const LOCAL_URL = "http://localhost:11434/v1";

// Add a key: paste the key → the provider is detected (or picked from the list) → the key is verified →
// and only saved if valid. No MODEL is chosen here and no models are shown: the model is chosen later in Settings.
export default function KeyEditor({ existing = null, compact = false, onDone, onCancel }: Props) {
 const [keyInput, setKeyInput] = useState(existing?.api_key || "");
 const [reveal, setReveal] = useState(false);
 const [manualProvider, setManualProvider] = useState<Provider | null>(
 existing?.provider === "custom" ? "custom" : null
 );
 const [baseUrl, setBaseUrl] = useState(existing?.base_url || LOCAL_URL);

 const [status, setStatus] = useState<Status>("idle");
 const [error, setError] = useState("");
 const [saving, setSaving] = useState(false);
 const [saveError, setSaveError] = useState("");

 const trimmed = keyInput.trim();
 const det = useMemo(() => detectProvider(trimmed), [trimmed]);

 const provider: Provider | null = useMemo(() => {
 if (manualProvider === "custom") return "custom";
 if (det.provider) return det.provider;
 return manualProvider ?? existing?.provider ?? null;
 }, [det, manualProvider, existing]);

 const isCustom = provider === "custom";
 const paidOnly = !!provider && !providerHasFree(provider);
 const effectiveBase = isCustom
 ? baseUrl.trim()
 : provider && existing && provider === existing.provider
 ? existing.base_url || undefined
 : undefined;

 // When the key/provider changes — validate with a debounce (no models, just whether the key is valid).
 useEffect(() => {
 if (!provider || paidOnly || (!isCustom && trimmed.length < 10)) {
 setStatus("idle");
 setError("");
 return;
 }
 const ctrl = new AbortController();
 const t = setTimeout(async () => {
 setStatus("checking");
 setError("");
 try {
 const r = await validateKey(provider, trimmed || "ollama", effectiveBase, existing?.model || undefined, ctrl.signal);
 if (ctrl.signal.aborted) return;
 if (r.valid) {
 setStatus("ok");
 } else {
 setStatus(r.auth ? "auth" : "offline");
 setError(r.error || "");
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
 }, [provider, paidOnly, trimmed, effectiveBase]);

 // Only a verified key is saved. A local server (Custom) may be invisible from Vercel, so it is an exception.
 const canSave = !!provider && !paidOnly && (status === "ok" || (isCustom && status === "offline"));
 const showProviderSelect = !det.provider && !isCustom && trimmed.length >= 8;

 async function save() {
 if (!provider || !canSave || saving) return;
 setSaving(true);
 setSaveError("");
 try {
 const key = trimmed || "ollama";
 const sameProvider = !!existing && existing.provider === provider;
 const base_url = isCustom ? baseUrl.trim() || null : sameProvider ? existing!.base_url ?? null : null;
 // No model is chosen here: empty for a new key; editing an existing key keeps its previous model.
 const model = sameProvider ? existing!.model || "" : "";
 let saved: UserApiKey;
 if (existing) {
 saved = await serverDb.updateKey(existing.id, {
 provider,
 api_key: key,
 model,
 base_url,
 name: sameProvider ? existing.name : shortProviderName(provider),
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
 setSaveError(e?.message || "Could not save");
 setSaving(false);
 }
 }

 const inputCls =
 "w-full h-11 px-3.5 border border-white/15 bg-black text-neutral-100 placeholder:text-neutral-600 text-sm focus:border-white/40 focus:outline-none transition";

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
 setSaveError("");
 }}
 autoComplete="off"
 spellCheck={false}
 aria-label="API key"
 placeholder={isCustom ? "API key (not required for Ollama)" : "Paste your API key here"}
 className={`${inputCls} pr-11 font-mono`}
 />
 <button
 type="button"
 onClick={() => setReveal((v) => !v)}
 aria-label={reveal ? "Hide key" : "Show key"}
 className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-neutral-500 hover:text-neutral-200 transition cursor-pointer"
 >
 {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
 </button>
 </div>

 {/* holat qatori */}
 <div className="min-h-6 mt-2 text-xs leading-5" aria-live="polite">
 {status === "checking" && (
 <span className="inline-flex items-center gap-1.5 text-neutral-400">
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 Checking…
 </span>
 )}
 {status === "ok" && provider && !paidOnly && (
 <span className="inline-flex items-center gap-1.5 text-emerald-400">
 <Check className="w-3.5 h-3.5" />
 {shortProviderName(provider)} key verified
 </span>
 )}
 {status === "auth" && (
 <span className="inline-flex items-start gap-1.5 text-red-400">
 <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
 <span>{error || "Invalid key"}</span>
 </span>
 )}
 {status === "offline" && (
 <span className="inline-flex items-start gap-1.5 text-neutral-300">
 <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
 <span>
 Could not verify key{error ? ` (${error})` : ""}.{" "}
 {isCustom ? "It is a local server, so you can still save it." : "Check that the right service is selected, or try again later."}
 </span>
 </span>
 )}
 {paidOnly && provider && (
 <span className="inline-flex items-start gap-1.5 text-neutral-300">
 <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
 <span>
 {shortProviderName(provider)} has no free models. Only free models work in this app: enter a Groq, Gemini, OpenRouter or Ollama key.
 </span>
 </span>
 )}
 {status === "idle" && !paidOnly && !trimmed && !isCustom && !existing && (
 <span className="text-neutral-500">
 Key type is detected automatically. Pick a model later in Settings.
 </span>
 )}
 </div>
 </div>

 {/* If the provider cannot be detected — pick it from the list */}
 {showProviderSelect && (
 <div>
 <p className="text-xs text-neutral-400 mb-2">Could not detect key type. Choose a provider from the list.</p>
 <select
 value={provider && provider !== "custom" ? provider : ""}
 onChange={(e) => setManualProvider((e.target.value || null) as Provider | null)}
 className={`${inputCls} cursor-pointer`}
 aria-label="Xizmat"
 >
 <option value="" className="bg-[#0a0a0a]">
 Choose a service
 </option>
 {PROVIDERS.filter((p) => p.hasFree && p.value !== "custom").map((p) => (
 <option key={p.value} value={p.value} className="bg-[#0a0a0a]">
 {shortProviderName(p.value)}
 </option>
 ))}
 </select>
 <button
 type="button"
 onClick={() => setManualProvider("custom")}
 className="mt-2 text-xs text-neutral-500 hover:text-neutral-200 transition cursor-pointer"
 >
 I have a local server or my own endpoint
 </button>
 </div>
 )}

 {/* Local / other URL */}
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
 Back to a regular key
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
 I have a local server or my own endpoint
 </button>
 )
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
 className="flex-1 h-11 border border-white/15 text-sm text-neutral-300 hover:bg-white/[0.07] transition cursor-pointer disabled:opacity-50"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={save}
 disabled={!canSave || saving}
 className="flex-1 h-11 bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
 >
 {saving && <Loader2 className="w-4 h-4 animate-spin" />}
 {existing ? "Save" : "Add"}
 </button>
 </div>
 </div>
 );
}
