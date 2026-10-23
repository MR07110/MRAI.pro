// Provayder yordamchilari (chat route bilan bir xil qiymatlar).
export function getDefaultUrl(provider: string): string {
  switch (provider) {
    case "groq": return "https://api.groq.com/openai/v1";
    case "deepseek": return "https://api.deepseek.com/v1";
    case "openai": return "https://api.openai.com/v1";
    case "gemini": return "https://generativelanguage.googleapis.com/v1beta/openai";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "xai": return "https://api.x.ai/v1";
    case "mistral": return "https://api.mistral.ai/v1";
    case "together": return "https://api.together.xyz/v1";
    case "perplexity": return "https://api.perplexity.ai";
    case "ollama": return "https://ollama.com/v1";
    default: return "https://api.openai.com/v1";
  }
}

export function defaultModel(provider: string, model?: string): string {
  const m = (model || "").trim();
  if (m) return m;
  if (provider === "groq") return "llama-3.3-70b-versatile";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "openrouter") return "meta-llama/llama-3.3-70b-instruct:free";
  if (provider === "anthropic") return "claude-3-5-sonnet-20241022";
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "ollama") return "gpt-oss:120b";
  return "gpt-4o-mini";
}
