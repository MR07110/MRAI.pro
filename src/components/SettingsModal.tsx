"use client";

import { useEffect, useState } from "react";
import {
  Key,
  Plus,
  Trash2,
  Check,
  X,
  ShieldAlert,
  Loader2,
  Download,
  Zap,
  Crown,
} from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import ConnectorsPanel from "./ConnectorsPanel";
import TasksPanel from "./TasksPanel";
import { useAuth } from "@/hooks/useAuth";
import type { UserApiKey, Provider } from "@/types";
import {
  AppSettings,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from "@/lib/settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

export interface ModelOption {
  id: string;
  name: string;
  isFree?: boolean;
}

export interface ProviderOption {
  value: Provider;
  label: string;
  placeholder: string;
  defaultModel: string;
  defaultBaseUrl: string;
  hasFree: boolean;
  hasPaid: boolean;
  models: ModelOption[];
}

export const PROVIDERS: ProviderOption[] = [
  {
    value: "groq",
    label: "Groq (Ultra tez, bepul limitlar)",
    placeholder: "gsk_...",
    defaultModel: "openai/gpt-oss-120b",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    hasFree: true,
    hasPaid: true,
    models: [
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B (OpenAI Open-Weights)", isFree: true },
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B (Ultra tezkor)", isFree: true },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Ultra tezkor)", isFree: true },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", isFree: true },
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B (Reasoning)", isFree: true },
      { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B (Mantiq va kod)", isFree: true },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B (32k kontekst)", isFree: true },
      { id: "gemma2-9b-it", name: "Google Gemma 2 9B", isFree: true },
      { id: "llama3-70b-8192", name: "Llama 3 70B (8k)", isFree: true },
      { id: "llama3-8b-8192", name: "Llama 3 8B (8k)", isFree: true },
    ],
  },
  {
    value: "gemini",
    label: "Google Gemini (Google AI Studio)",
    placeholder: "AIzaSy...",
    defaultModel: "gemini-2.0-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    hasFree: true,
    hasPaid: true,
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Tezkor va bepul)", isFree: true },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (1M kontekst)", isFree: true },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (2M ulkan kontekst)", isFree: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Pullik flagman)", isFree: false },
    ],
  },
  {
    value: "openrouter",
    label: "OpenRouter (Bepul va Pullik)",
    placeholder: "sk-or-v1-...",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    hasFree: true,
    hasPaid: true,
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (:free)", isFree: true },
      { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (:free)", isFree: true },
      { id: "deepseek/deepseek-chat:free", name: "DeepSeek V3 (:free)", isFree: true },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (:free)", isFree: true },
      { id: "qwen/qwen-2.5-coder-32b-instruct:free", name: "Qwen 2.5 Coder 32B (:free)", isFree: true },
      { id: "mistralai/mistral-small-3:free", name: "Mistral Small 3 (:free)", isFree: true },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", isFree: false },
      { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", isFree: false },
      { id: "openai/gpt-4o", name: "OpenAI GPT-4o", isFree: false },
      { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o Mini", isFree: false },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Premium pullik)", isFree: false },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (Yuqori tezlik)", isFree: false },
    ],
  },
  {
    value: "openai",
    label: "OpenAI (ChatGPT)",
    placeholder: "sk-proj-...",
    defaultModel: "gpt-4o",
    defaultBaseUrl: "https://api.openai.com/v1",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "gpt-4o", name: "GPT-4o (Eng aqlli flagman)", isFree: false },
      { id: "gpt-4o-mini", name: "GPT-4o Mini (Tezkor va arzon)", isFree: false },
      { id: "o3-mini", name: "o3-mini (Reasoning & Fikrlash)", isFree: false },
      { id: "o1", name: "o1 (Chuqur tahlil)", isFree: false },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", isFree: false },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", isFree: false },
    ],
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-api03-...",
    defaultModel: "claude-3-5-sonnet-20241022",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Yetakchi model)", isFree: false },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku (Tezkor)", isFree: false },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus (Gigant)", isFree: false },
    ],
  },
  {
    value: "deepseek",
    label: "DeepSeek (R1 & V3)",
    placeholder: "sk-...",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "deepseek-chat", name: "DeepSeek-V3 (Universal)", isFree: false },
      { id: "deepseek-reasoner", name: "DeepSeek-R1 (Fikrlash - Reasoning)", isFree: false },
    ],
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    placeholder: "xai-...",
    defaultModel: "grok-2-latest",
    defaultBaseUrl: "https://api.x.ai/v1",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "grok-2-latest", name: "Grok 2", isFree: false },
      { id: "grok-2-vision-latest", name: "Grok 2 Vision", isFree: false },
      { id: "grok-beta", name: "Grok Beta", isFree: false },
    ],
  },
  {
    value: "mistral",
    label: "Mistral AI",
    placeholder: "mistral_api_key...",
    defaultModel: "mistral-large-latest",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "mistral-large-latest", name: "Mistral Large", isFree: false },
      { id: "mistral-small-latest", name: "Mistral Small", isFree: false },
      { id: "codestral-latest", name: "Codestral (Dasturchilar uchun)", isFree: false },
      { id: "open-mistral-nemo", name: "Mistral Nemo", isFree: false },
    ],
  },
  {
    value: "together",
    label: "Together AI",
    placeholder: "together_api_key...",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    defaultBaseUrl: "https://api.together.xyz/v1",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", isFree: false },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1", isFree: false },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", isFree: false },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", name: "Qwen 2.5 72B Turbo", isFree: false },
    ],
  },
  {
    value: "perplexity",
    label: "Perplexity AI (Qidiruv)",
    placeholder: "pplx-...",
    defaultModel: "sonar-pro",
    defaultBaseUrl: "https://api.perplexity.ai",
    hasFree: false,
    hasPaid: true,
    models: [
      { id: "sonar-pro", name: "Sonar Pro (Qidiruvli chuqur)", isFree: false },
      { id: "sonar", name: "Sonar (Tezkor qidiruv)", isFree: false },
      { id: "sonar-reasoning", name: "Sonar Reasoning", isFree: false },
    ],
  },
  {
    value: "custom",
    label: "Custom / Local (Ollama, vLLM)",
    placeholder: "sk-... yoki ollama",
    defaultModel: "llama3",
    defaultBaseUrl: "http://localhost:11434/v1",
    hasFree: true,
    hasPaid: true,
    models: [
      { id: "llama3", name: "Ollama Llama 3 (Mahalliy bepul)", isFree: true },
      { id: "mistral", name: "Ollama Mistral (Mahalliy bepul)", isFree: true },
      { id: "qwen2.5", name: "Ollama Qwen 2.5 (Mahalliy bepul)", isFree: true },
      { id: "deepseek-r1", name: "Ollama DeepSeek R1 (Mahalliy bepul)", isFree: true },
      { id: "custom-paid", name: "Custom Pullik Proxy / Model", isFree: false },
    ],
  },
];

export function isModelFree(modelId: string): boolean {
  if (!modelId) return false;
  if (modelId.endsWith(":free")) return true;
  const lower = modelId.toLowerCase();
  if (
    lower.includes("gpt-oss") ||
    lower.includes("qwen3.8") ||
    lower.includes("llama-3.3-70b-versatile") ||
    lower.includes("llama-3.1-8b") ||
    lower.includes("distill-llama") ||
    lower.includes("mixtral") ||
    lower.includes("gemma2") ||
    lower.includes("llama3-") ||
    lower.includes("ollama") ||
    lower.includes("vllm") ||
    lower === "llama3" ||
    lower === "mistral" ||
    lower === "qwen2.5" ||
    lower === "deepseek-r1"
  ) {
    return true;
  }
  if (lower.startsWith("gemini-") && !lower.includes("2.5-pro")) {
    return true;
  }
  for (const p of PROVIDERS) {
    const found = p.models.find((m) => m.id === modelId);
    if (found && typeof found.isFree === "boolean") return found.isFree;
  }
  return false;
}

type SettingsTab = "keys" | "connectors" | "tasks" | "general" | "account";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "keys", label: "API kalitlar" },
  { id: "connectors", label: "Connectorlar" },
  { id: "tasks", label: "Vazifalar" },
  { id: "general", label: "Umumiy" },
  { id: "account", label: "Hisob" },
];

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-11 h-6 rounded-full transition cursor-pointer p-0.5 shrink-0 ${on ? "bg-white" : "bg-neutral-800"}`}
    >
      <div className={`w-5 h-5 rounded-full bg-neutral-950 transition transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function SettingsModal({ open, onClose }: Props) {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("keys");

  // API Keys state
  const [keys, setKeys] = useState<UserApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [keyTestStatus, setKeyTestStatus] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  // Pricing toggle state (Free vs Paid)
  const [pricingTier, setPricingTier] = useState<"free" | "paid">("free");

  // New key form state
  const [provider, setProvider] = useState<Provider>("groq");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelName, setCustomModelName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.groq.com/openai/v1");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  // App settings state (Model, Appearance)
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Account profile state
  const [newName, setNewName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passMessage, setPassMessage] = useState("");
  const [passError, setPassError] = useState("");

  const currentProvider = PROVIDERS.find((p) => p.value === provider) || PROVIDERS[0];

  useEffect(() => {
    if (open && user) {
      loadKeys();
      setAppSettings(loadSettings());
      setNewName(user.user_metadata?.full_name || "");
    }
  }, [open, user]);

  async function loadKeys() {
    setLoading(true);
    try {
      const data = await serverDb.getKeys();
      setKeys(data || []);
    } catch {}
    setLoading(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("mr_ai_keys_updated"));
    }
  }

  function onPricingTierChange(tier: "free" | "paid") {
    setPricingTier(tier);
    setError("");
    const available = PROVIDERS.filter((p) => (tier === "free" ? p.hasFree : p.hasPaid));
    const targetProvider = available.find((p) => p.value === provider) || available[0];
    if (targetProvider) {
      setProvider(targetProvider.value);
      const targetModels = targetProvider.models.filter((m) =>
        tier === "free" ? m.isFree : !m.isFree
      );
      if (targetModels.length > 0) {
        setIsCustomModel(false);
        setCustomModelName("");
        setModel(targetModels[0].id);
      } else if (targetProvider.models.length > 0) {
        setIsCustomModel(false);
        setCustomModelName("");
        setModel(targetProvider.models[0].id);
      } else {
        setIsCustomModel(true);
        setCustomModelName("");
        setModel("");
      }
      setBaseUrl(targetProvider.defaultBaseUrl);
    }
  }

  function onProviderChange(p: Provider) {
    setProvider(p);
    setError("");
    setDiscoveredModels([]);
    const found = PROVIDERS.find((x) => x.value === p);
    if (found) {
      const tierModels = found.models.filter((m) =>
        pricingTier === "free" ? m.isFree : !m.isFree
      );
      if (tierModels.length > 0) {
        setIsCustomModel(false);
        setCustomModelName("");
        setModel(tierModels[0].id);
      } else if (found.models.length > 0) {
        setIsCustomModel(false);
        setCustomModelName("");
        setModel(found.models[0].id);
      } else {
        setIsCustomModel(true);
        setCustomModelName("");
        setModel("");
      }
      setBaseUrl(found.defaultBaseUrl);
    }
  }

  async function testExistingKey(k: UserApiKey) {
    setTestingKeyId(k.id);
    setKeyTestStatus(null);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: k.provider,
          apiKey: k.api_key,
          model: k.model,
          baseUrl: k.base_url || undefined,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setKeyTestStatus({ id: k.id, ok: true, msg: "Kalit yaroqli va faol!" });
      } else {
        setKeyTestStatus({ id: k.id, ok: false, msg: data.error || "Kalit yaroqsiz!" });
      }
    } catch (err: any) {
      setKeyTestStatus({ id: k.id, ok: false, msg: err.message });
    }
    setTestingKeyId(null);
  }

  async function saveKeyDirectly() {
    const trimmedKey = apiKey.trim();
    const finalModel = isCustomModel ? customModelName.trim() : model.trim();

    if (!trimmedKey) {
      setError("Iltimos, API kalitni kiriting");
      return;
    }
    if (!finalModel) {
      setError("Iltimos, modelni tanlang yoki nomini kiriting");
      return;
    }

    setSaving(true);
    setStatusMessage("Kalit saqlanmoqda...");
    setError("");

    try {
      const shouldBeDefault = isDefault || keys.length === 0;

      await serverDb.saveKey({
        provider,
        name: name.trim() || `${currentProvider.label.split(" ")[0]} (${finalModel})`,
        api_key: trimmedKey,
        model: finalModel,
        base_url: baseUrl.trim() || null,
        is_default: shouldBeDefault,
      });

      setName("");
      setApiKey("");
      setIsDefault(false);
      setShowForm(false);
      setSaving(false);
      setStatusMessage("");
      loadKeys();
    } catch (err: any) {
      setError("Saqlashda xatolik: " + err.message);
      setSaving(false);
      setStatusMessage("");
    }
  }

  async function handleSaveKey() {
    setError("");
    const trimmedKey = apiKey.trim();
    const finalModel = isCustomModel ? customModelName.trim() : model.trim();

    if (!trimmedKey) {
      setError("Iltimos, API kalitni kiriting");
      return;
    }
    if (!finalModel) {
      setError("Iltimos, modelni tanlang yoki nomini kiriting");
      return;
    }

    setSaving(true);
    setStatusMessage("API kalit tekshirilmoqda...");

    try {
      const validateRes = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: trimmedKey,
          model: finalModel,
          baseUrl: baseUrl.trim() || undefined,
        }),
      });

      const validateData = await validateRes.json();

      if (Array.isArray(validateData?.models) && validateData.models.length > 0) {
        setDiscoveredModels(validateData.models);
      }

      if (!validateData.valid) {
        setError(validateData.error || "API kalit yaroqsiz!");
        setSaving(false);
        setStatusMessage("");
        return;
      }
    } catch (err: any) {
      setError("Tekshirishda xatolik: " + err.message);
      setSaving(false);
      setStatusMessage("");
      return;
    }

    await saveKeyDirectly();
  }

  async function setAsDefault(id: string) {
    await serverDb.setDefaultKey(id);
    loadKeys();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu API keyni o‘chirmoqchimisiz?")) return;
    await serverDb.deleteKey(id);
    loadKeys();
  }

  // Update Settings helper
  function updateAppSettings(patch: Partial<AppSettings>) {
    const updated = { ...appSettings, ...patch };
    setAppSettings(updated);
    saveSettings(updated);
  }

  // Update Profile Name
  async function handleUpdateName() {
    if (!newName.trim()) return;
    try {
      const savedUserStr = localStorage.getItem("mrai_auth_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : {};
      savedUser.user_metadata = { ...(savedUser.user_metadata || {}), full_name: newName.trim() };
      localStorage.setItem("mrai_auth_user", JSON.stringify(savedUser));
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch {}
  }

  // Change password
  async function handleChangePassword() {
    setPassError("");
    setPassMessage("");
    if (!newPassword || newPassword.length < 6) {
      setPassError("Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError("Parollar mos kelmadi");
      return;
    }
    try {
      localStorage.setItem("mrai_auth_password", newPassword);
      setPassMessage("Parol muvaffaqiyatli yangilandi!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setPassError(e?.message || "Xatolik yuz berdi");
    }
  }

  // Export chats
  async function handleExportChats() {
    try {
      const chats = await serverDb.getChats();
      const fullData = await Promise.all(
        chats.map(async (c) => ({
          ...c,
          messages: await serverDb.getMessages(c.id),
        }))
      );

      const blob = new Blob([JSON.stringify(fullData || [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mr-ai-chats-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  // Clear all chats
  async function handleClearAllChats() {
    if (!confirm("DIQQAT: Barcha suhbatlar va xabarlar o‘chiriladi. Ushbu amalni ortga qaytarib bo‘lmaydi. Rozimisiz?"))
      return;
    await serverDb.deleteAllChats();
    window.location.reload();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-neutral-900 text-neutral-100 rounded-2xl shadow-2xl border border-neutral-800 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-semibold text-neutral-100">Sozlamalar</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-5 border-b border-neutral-800 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2.5 text-xs font-medium transition cursor-pointer border-b-2 -mb-px ${
                activeTab === t.id
                  ? "border-white text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "connectors" && <ConnectorsPanel />}
          {activeTab === "tasks" && <TasksPanel />}

          {/* API KEYS */}
          {activeTab === "keys" && (
            <div>
              {!showForm ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-100">Mening API Kalitlarim</h3>
                      <p className="text-xs text-neutral-400">
                        Suhbat uchun provayder kalitlari.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowForm(true);
                        onPricingTierChange("free");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Yangi kalit
                    </button>
                  </div>

                  {loading ? (
                    <div className="text-center py-10 text-neutral-500 text-sm">Yuklanmoqda...</div>
                  ) : keys.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-neutral-800 rounded-xl bg-neutral-950/40">
                      <Key className="w-9 h-9 text-neutral-600 mx-auto mb-3" />
                      <p className="text-sm font-medium text-neutral-300">Hali kalit qo‘shilmagan</p>
                      <p className="text-xs text-neutral-500 mt-1 mb-4 max-w-sm mx-auto">
                        Suhbatlashish uchun provayderdan kalit qo‘shing.
                      </p>
                      <button
                        onClick={() => {
                          setShowForm(true);
                          onPricingTierChange("free");
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-neutral-950 text-xs font-medium hover:bg-neutral-200 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Birinchi kalitni qo‘shish
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {keys.map((k) => {
                          return (
                            <div
                              key={k.id}
                              className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:border-neutral-700/80 transition"
                            >
                              <div className="flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-neutral-100 truncate">
                                      {k.name}
                                    </span>
                                    {k.is_default && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800/80 text-emerald-300">
                                        Asosiy
                                      </span>
                                    )}
                                  </div>
                              <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[11px] uppercase">
                                  {k.provider}
                                </span>
                                <span>{k.model}</span>
                              </div>
                              <div className="text-xs text-neutral-500 mt-1 font-mono">
                                {k.api_key.slice(0, 8)}••••••••••••
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-3">
                              <button
                                onClick={() => testExistingKey(k)}
                                disabled={testingKeyId === k.id}
                                title="Kalitni tekshirish"
                                className="px-2.5 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                              >
                                {testingKeyId === k.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                                ) : (
                                  "Tekshirish"
                                )}
                              </button>

                              {!k.is_default && (
                                <button
                                  onClick={() => setAsDefault(k.id)}
                                  title="Asosiy qilish"
                                  className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-white cursor-pointer"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}

                              <button
                                onClick={() => handleDelete(k.id)}
                                title="O‘chirish"
                                className="p-1.5 rounded-lg hover:bg-red-950/50 transition text-neutral-500 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {keyTestStatus && keyTestStatus.id === k.id && (
                            <div
                              className={`mt-2.5 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${
                                keyTestStatus.ok
                                  ? "bg-emerald-950/50 text-emerald-300 border border-emerald-900/50"
                                  : "bg-red-950/50 text-red-300 border border-red-900/50"
                              }`}
                            >
                              {keyTestStatus.ok ? (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{keyTestStatus.msg}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </>
              ) : (
                /* ADD NEW KEY FORM */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                    <h3 className="text-sm font-semibold text-neutral-100">Yangi kalit</h3>
                    <button
                      onClick={() => setShowForm(false)}
                      className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                    >
                      Orqaga
                    </button>
                  </div>

                  {/* TOGGLE: BEPUL (FREE) VS PULLIK (PAID) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-neutral-300">
                      Toifa
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-neutral-950 border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => onPricingTierChange("free")}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          pricingTier === "free"
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                            : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Bepul</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPricingTierChange("paid")}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          pricingTier === "paid"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                            : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                        }`}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>Pullik</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                      Provayder
                    </label>
                    <select
                      value={provider}
                      onChange={(e) => onProviderChange(e.target.value as Provider)}
                      className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 text-sm bg-neutral-950 text-neutral-100 focus:border-neutral-600 focus:outline-none cursor-pointer"
                    >
                      {PROVIDERS.filter((p) => (pricingTier === "free" ? p.hasFree : p.hasPaid)).map((p) => (
                        <option key={p.value} value={p.value} className="bg-neutral-900 text-neutral-100">
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-neutral-300">
                        API kalit
                      </label>
                    </div>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setError("");
                      }}
                      placeholder={currentProvider.placeholder}
                      className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm font-mono focus:border-neutral-600 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                      Model
                    </label>
                    {(() => {
                      const combinedModels = [
                        ...currentProvider.models,
                        ...discoveredModels
                          .filter((id) => !currentProvider.models.some((m) => m.id === id))
                          .map((id) => ({
                            id,
                            name: `${id} (Hisobingizdagi faol)`,
                            isFree: pricingTier === "free",
                          })),
                      ];

                      const tierFiltered = combinedModels.filter((m) =>
                        pricingTier === "free" ? m.isFree === true : m.isFree !== true
                      );

                      return tierFiltered.length > 0 ? (
                        <div className="space-y-2">
                          <select
                            value={isCustomModel ? "__custom__" : model}
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setIsCustomModel(true);
                                setCustomModelName("");
                              } else {
                                setIsCustomModel(false);
                                setModel(e.target.value);
                              }
                            }}
                            className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 text-sm focus:border-neutral-600 focus:outline-none cursor-pointer"
                          >
                            {tierFiltered.map((m) => (
                              <option key={m.id} value={m.id} className="bg-neutral-900 text-neutral-100">
                                {m.name} {m.isFree ? "(Bepul)" : "(Pullik)"}
                              </option>
                            ))}
                            <option value="__custom__" className="bg-neutral-900 text-neutral-100">
                              + Boshqa model (Nomini qo‘lda yozish)...
                            </option>
                          </select>

                          {isCustomModel && (
                            <input
                              value={customModelName}
                              onChange={(e) => setCustomModelName(e.target.value)}
                              placeholder="Aniq model nomini kiriting (masalan: gpt-4o)"
                              className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <input
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="Model nomini kiriting (masalan: gpt-4o)"
                            className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none"
                          />
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                      Nomi (ixtiyoriy)
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`Masalan: Mening ${currentProvider.label.split(" ")[0]} kalitim`}
                      className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none"
                    />
                  </div>

                  {(provider === "custom" || provider === "openrouter") && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                        Base URL
                      </label>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="w-full h-11 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-xs font-mono focus:border-neutral-600 focus:outline-none"
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-white cursor-pointer"
                    />
                    Asosiy kalit qilish
                  </label>

                  {statusMessage && (
                    <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-950/40 border border-blue-900/50 px-3.5 py-2.5 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{statusMessage}</span>
                    </div>
                  )}

                  {error && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/60 border border-red-900/60 px-3.5 py-2.5 rounded-lg">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="flex-1">{error}</span>
                      </div>
                      <button
                        type="button"
                        onClick={saveKeyDirectly}
                        disabled={saving}
                        className="w-full py-2 px-3 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:text-white hover:bg-neutral-800 text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        Tekshiruvsiz saqlash
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setError("");
                      }}
                      disabled={saving}
                      className="flex-1 h-11 rounded-xl border border-neutral-800 text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition cursor-pointer"
                    >
                      Bekor qilish
                    </button>
                    <button
                      onClick={handleSaveKey}
                      disabled={saving}
                      className="flex-1 h-11 rounded-xl bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Tekshirilmoqda...
                        </>
                      ) : (
                        "Kalitni tekshirib saqlash"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


          {activeTab === "general" && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-neutral-300">Tizim ko‘rsatmasi</label>
                  <button
                    onClick={() =>
                      updateAppSettings({
                        systemPrompt: DEFAULT_SETTINGS.systemPrompt,
                        systemPromptPreset: DEFAULT_SETTINGS.systemPromptPreset,
                      })
                    }
                    className="text-xs text-neutral-500 hover:text-white transition cursor-pointer"
                  >
                    Standartga qaytarish
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={appSettings.systemPrompt}
                  onChange={(e) =>
                    updateAppSettings({ systemPrompt: e.target.value, systemPromptPreset: "custom" })
                  }
                  placeholder="AI qanday javob berishi kerakligini yozing..."
                  className="w-full p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 text-xs placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Shrift o‘lchami</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "sm", label: "Kichik" },
                    { id: "base", label: "Standart" },
                    { id: "lg", label: "Katta" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => updateAppSettings({ fontSize: f.id as AppSettings["fontSize"] })}
                      className={`py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                        appSettings.fontSize === f.id
                          ? "bg-white text-neutral-950 border-white"
                          : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-neutral-200">Agent rejimi</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    AI kompyuter, connectorlar va vazifalarni o‘zi ishlatadi (tool-calling qo‘llaydigan model kerak)
                  </p>
                </div>
                <Toggle
                  on={appSettings.agentMode !== false}
                  onChange={() => updateAppSettings({ agentMode: appSettings.agentMode === false })}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-neutral-200">Enter bilan yuborish</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {appSettings.sendOnEnter ? "Shift+Enter — yangi qator" : "Ctrl+Enter — yuborish"}
                  </p>
                </div>
                <Toggle
                  on={appSettings.sendOnEnter}
                  onChange={() => updateAppSettings({ sendOnEnter: !appSettings.sendOnEnter })}
                />
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-neutral-100 truncate">
                  {user?.user_metadata?.full_name || "Foydalanuvchi"}
                </p>
                <p className="text-xs text-neutral-500 font-mono">
                  @{user?.user_metadata?.username || user?.email?.split("@")[0]}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Ism</label>
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Yangi ism"
                    className="flex-1 h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  <button
                    onClick={handleUpdateName}
                    className="px-4 h-10 rounded-xl bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
                  >
                    {nameSaved ? "Saqlandi" : "Saqlash"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Parol</label>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Yangi parol (kamida 6 belgi)"
                    className="w-full h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Parolni takrorlang"
                    className="w-full h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  {passError && <p className="text-xs text-red-400">{passError}</p>}
                  {passMessage && <p className="text-xs text-emerald-400">{passMessage}</p>}
                  <button
                    onClick={handleChangePassword}
                    className="w-full h-10 rounded-xl border border-neutral-800 text-neutral-200 text-xs font-medium hover:bg-neutral-800 transition cursor-pointer"
                  >
                    Parolni yangilash
                  </button>
                </div>
              </div>

              <div className="pt-5 border-t border-neutral-800 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportChats}
                    className="h-10 rounded-xl border border-neutral-800 text-neutral-200 text-xs font-medium hover:bg-neutral-800 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Suhbatlarni yuklab olish
                  </button>
                  <button
                    onClick={handleClearAllChats}
                    className="h-10 rounded-xl border border-neutral-800 text-red-400 text-xs font-medium hover:bg-red-950/40 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Suhbatlarni tozalash
                  </button>
                </div>
                <button
                  onClick={signOut}
                  className="w-full h-10 rounded-xl border border-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-800 transition cursor-pointer"
                >
                  Chiqish
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
