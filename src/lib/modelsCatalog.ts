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
  /(whisper|tts|embed|guard|moderation|rerank|dall-e|imagen|veo|transcribe|audio|realtime|davinci|babbage|aqa|speech|image-)/i;

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
    free: isModelFree(id),
    recommended: order.has(id),
  }));

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
