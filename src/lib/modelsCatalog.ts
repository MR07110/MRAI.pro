// Provayderlar katalogi, kalit turini aniqlash va model ro'yxatini olish yordamchilari.
// Settings (KeysPanel) va chat input (ModelSwitcher) bir xil mantiqdan foydalanadi.
import type { Provider } from "@/types";

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
    hasPaid: false,
    models: [
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B (OpenAI Open-Weights)", isFree: true },
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B (Ultra tezkor)", isFree: true },
      { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B (Mantiq va kod)", isFree: true },
    ],
  },
  {
    value: "gemini",
    label: "Google Gemini (Google AI Studio)",
    placeholder: "AIzaSy...",
    defaultModel: "gemini-2.0-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    hasFree: true,
    hasPaid: false,
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Tezkor va bepul)", isFree: true },
    ],
  },
  {
    value: "openrouter",
    label: "OpenRouter (faqat bepul modellar)",
    placeholder: "sk-or-v1-...",
    defaultModel: "openrouter/free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    hasFree: true,
    hasPaid: false,
    models: [
      { id: "openrouter/free", name: "Avto-tanlov (bepul modellardan eng mosi)", isFree: true },
      { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (Google)", isFree: true },
      { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B A4B (Google)", isFree: true },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra 550B (NVIDIA)", isFree: true },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (NVIDIA)", isFree: true },
      { id: "nvidia/nemotron-3.5-lightning:free", name: "Nemotron 3.5 Lightning (NVIDIA)", isFree: true },
      { id: "nvidia/nemotron-3.5-super-vl:free", name: "Nemotron 3.5 Super VL (NVIDIA)", isFree: true },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano Omni 30B (NVIDIA)", isFree: true },
      { id: "thinkingmachines/inkling:free", name: "Inkling (Thinking Machines)", isFree: true },
      { id: "thinkingmachines/inkling-small:free", name: "Inkling Small (Thinking Machines)", isFree: true },
      { id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Poolside)", isFree: true },
      { id: "poolside/laguna-xs-2.1:free", name: "Laguna XS 2.1 (Poolside)", isFree: true },
      { id: "cohere/north-mini-code:free", name: "North Mini Code (Cohere)", isFree: true },
      { id: "liquid/lfm-2.5-2.6b:free", name: "LFM 2.5 2.6B (Liquid)", isFree: true },
      { id: "recursive/flint-v1.0:free", name: "Flint v1.0 (Recursive)", isFree: true },
      { id: "xingchen-agi/xing4.0-29b-a4b:free", name: "Xing 4.0 29B (Xingchen)", isFree: true },
      { id: "dots-studio/dots-3-note-preview:free", name: "Dots 3 Note (Dots Studio)", isFree: true },
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
    value: "ollama",
    label: "Ollama Cloud (bepul modellar)",
    placeholder: "kalit.xxxxxxxx (ollama.com/settings/keys)",
    defaultModel: "gpt-oss:120b",
    defaultBaseUrl: "https://ollama.com/v1",
    hasFree: true,
    hasPaid: false,
    models: [
      { id: "gpt-oss:120b", name: "GPT-OSS 120B (OpenAI ochiq model, kuchli)", isFree: true },
      { id: "gpt-oss:20b", name: "GPT-OSS 20B (tezkor)", isFree: true },
      { id: "gemma4:31b", name: "Gemma 4 31B (Google, tezkor va aniq)", isFree: true },
      { id: "nemotron-3-ultra", name: "Nemotron 3 Ultra (NVIDIA, eng kuchli)", isFree: true },
      { id: "nemotron-3-super", name: "Nemotron 3 Super (NVIDIA)", isFree: true },
      { id: "nemotron-3-nano:30b", name: "Nemotron 3 Nano 30B (NVIDIA, sekin: uzoq o‘ylaydi)", isFree: true },
      { id: "beam", name: "Beam", isFree: true },
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

/** Ilovada FAQAT bepul modellar ko‘rsatiladi. Provayderga qarab aniq qoida. */
export function isFreeFor(provider: string | null, id: string): boolean {
  switch (provider) {
    case "ollama":
      return !!PROVIDERS.find((p) => p.value === "ollama")?.models.some((m) => m.id === id);
    case "groq":
      return true; // Groq: barcha chat modellar bepul limit bilan ishlaydi
    case "openrouter":
      return id.endsWith(":free") || id === "openrouter/free";
    case "gemini":
      return /^gemini-/.test(id) && !/(pro|image|tts|embed|live|robotics|computer|audio|imagen)/i.test(id);
    case "custom":
      return true; // mahalliy server
    default:
      return false;
  }
}

/** Bu xizmatda umuman bepul model bormi (OpenAI, Claude va h.k. — yo‘q). */
export function providerHasFree(provider: string | null): boolean {
  if (!provider) return true;
  return PROVIDERS.find((p) => p.value === provider)?.hasFree ?? false;
}

// ---------------------------------------------------------------------------
// Nomlar va maska
// ---------------------------------------------------------------------------
const SHORT_NAMES: Record<string, string> = {
  groq: "Groq",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  xai: "Grok",
  mistral: "Mistral",
  together: "Together",
  perplexity: "Perplexity",
  ollama: "Ollama",
  custom: "Mahalliy",
};

export function shortProviderName(provider: string): string {
  return SHORT_NAMES[provider] || provider;
}

export function maskKey(key: string): string {
  const k = (key || "").trim();
  if (!k) return "";
  if (k.length <= 10) return "••••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Kalit turini aniqlash. Tarmoqqa chiqmaydi: kalit faqat o'zining provayderiga yuboriladi.
// provider      — aniq bitta provayder topilsa
// candidates    — bir nechta mumkin bo'lsa (masalan "sk-..." OpenAI yoki DeepSeek)
// ikkalasi ham bo'sh — format tanish emas, foydalanuvchi o'zi tanlaydi
// ---------------------------------------------------------------------------
export interface Detection {
  provider: Provider | null;
  candidates: Provider[];
}

export function detectProvider(rawKey: string): Detection {
  const key = (rawKey || "").trim();
  if (/^gsk_/.test(key)) return { provider: "groq", candidates: [] };
  if (/^[a-f0-9]{32}\.[A-Za-z0-9_-]{16,}$/.test(key)) return { provider: "ollama", candidates: [] };
  if (/^sk-ant-/.test(key)) return { provider: "anthropic", candidates: [] };
  if (/^sk-or-/.test(key)) return { provider: "openrouter", candidates: [] };
  if (/^AIza/.test(key)) return { provider: "gemini", candidates: [] };
  if (/^xai-/.test(key)) return { provider: "xai", candidates: [] };
  if (/^pplx-/.test(key)) return { provider: "perplexity", candidates: [] };
  if (/^sk-(proj|svcacct|admin)-/.test(key)) return { provider: "openai", candidates: [] };
  if (/^sk-[a-f0-9]{32}$/.test(key)) return { provider: "deepseek", candidates: [] };
  if (/^sk-/.test(key)) return { provider: null, candidates: ["openai", "deepseek"] };
  return { provider: null, candidates: [] };
}

// ---------------------------------------------------------------------------
// Model ro'yxati
// ---------------------------------------------------------------------------
export interface ModelItem {
  id: string;
  name: string;
  free: boolean;
  recommended: boolean;
}

const NON_CHAT =
  /(whisper|tts|embed|guard|safety|moderation|rerank|dall-e|imagen|veo|transcribe|audio|realtime|davinci|babbage|aqa|speech|image-)/i;

export function normalizeModelId(id: string): string {
  return id.replace(/^models\//, "");
}

export function isChatModel(id: string): boolean {
  return !NON_CHAT.test(id);
}

export function buildModelItems(provider: string | null, discovered: string[]): ModelItem[] {
  if (!provider) return [];
  const catalog = PROVIDERS.find((p) => p.value === provider)?.models || [];
  const names = new Map(catalog.map((m) => [m.id, m.name]));
  const order = new Map(catalog.map((m, i) => [m.id, i]));

  // Ollama Cloud: faqat bepul (tekshirilgan) modellar ko‘rsatiladi, pullik modellar yashiriladi.
  const ids = provider === "ollama"
    ? catalog.map((m) => m.id)
    : discovered.length
    ? Array.from(new Set(discovered.map(normalizeModelId).filter(isChatModel)))
    : catalog.map((m) => m.id);

  const items: ModelItem[] = ids.map((id) => ({
    id,
    name: names.get(id) || id,
    free: isFreeFor(provider, id),
    recommended: order.has(id),
  })).filter((it) => it.free);

  items.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (a.recommended && b.recommended) return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    return a.id.localeCompare(b.id);
  });
  return items;
}

// ---------------------------------------------------------------------------
// Kalitni tekshirish (/api/validate-key) va modellarni olish
// ---------------------------------------------------------------------------
export interface ValidateResult {
  valid: boolean;
  models: string[];
  error?: string;
  /** true — kalitning o'zi rad etildi (401/403); false bo'lsa tarmoq/boshqa xato */
  auth?: boolean;
}

const AUTH_ERR = /401|403|noto.g.ri|yaroqsiz|ruxsat yo/i;

export async function validateKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
  model?: string,
  signal?: AbortSignal
): Promise<ValidateResult> {
  try {
    const res = await fetch("/api/validate-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, model, baseUrl: baseUrl || undefined }),
      signal,
    });
    const data = await res.json();
    if (data?.valid) {
      const models: string[] = Array.isArray(data.models) ? data.models : [];
      return { valid: true, models: models.map(normalizeModelId) };
    }
    const error: string = data?.error || "Kalit yaroqsiz";
    return { valid: false, models: [], error, auth: AUTH_ERR.test(error) };
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    return { valid: false, models: [], error: `Ulanib bo‘lmadi: ${e?.message || "noma’lum xato"}`, auth: false };
  }
}

// Chat inputdagi tez almashtirgich uchun: bir xil kalit uchun modellarni qayta-qayta so'ramaslik.
const modelsCache = new Map<string, { at: number; models: string[] }>();
const CACHE_MS = 10 * 60 * 1000;

export async function fetchModelsCached(
  id: string,
  provider: string,
  apiKey: string,
  baseUrl?: string | null,
  model?: string
): Promise<string[]> {
  const ck = `${id}:${apiKey.slice(-6)}`;
  const hit = modelsCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.models;
  const r = await validateKey(provider, apiKey, baseUrl || undefined, model);
  if (r.valid) modelsCache.set(ck, { at: Date.now(), models: r.models });
  return r.valid ? r.models : [];
}
