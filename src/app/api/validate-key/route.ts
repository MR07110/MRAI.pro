import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, model, baseUrl } = await req.json();

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json(
        { valid: false, error: "API kalit kiritilmadi" },
        { status: 400 }
      );
    }

    const key = apiKey.trim();
    const cleanModel = (model || "").trim();

    // 1. Anthropic uchun maxsus tekshiruv
    if (provider === "anthropic") {
      try {
        const mres = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(7000),
        });
        if (mres.status === 200) {
          const d = await mres.json();
          const models = (Array.isArray(d?.data) ? d.data : []).map((m: any) => m?.id).filter(Boolean);
          return NextResponse.json({ valid: true, models: models.length ? models : undefined });
        }
        if (mres.status === 401) {
          return NextResponse.json({
            valid: false,
            error: "Anthropic API kaliti noto‘g‘ri (401 Unauthorized)",
          });
        }
      } catch {
        // /models ishlamasa pastdagi oddiy tekshiruvga o'tamiz
      }
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: cleanModel || "claude-3-5-sonnet-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
        });

        if (res.status === 200) {
          return NextResponse.json({ valid: true });
        }

        const errText = await res.text();
        let message = `Anthropic xatosi (${res.status})`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) message = parsed.error.message;
        } catch {}

        if (res.status === 401) {
          message = "Anthropic API kaliti noto‘g‘ri (401 Unauthorized)";
        }

        return NextResponse.json({ valid: false, error: message });
      } catch (err: any) {
        return NextResponse.json({
          valid: false,
          error: `Anthropic serveriga ulanib bo‘lmadi: ${err.message}`,
        });
      }
    }

    // 2. Barcha OpenAI-mos provayderlar
    let targetBase = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
    if (!targetBase) {
      targetBase = getDefaultUrl(provider);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://mrai-uzbek.vercel.app";
      headers["X-Title"] = "MR AI Pro";
    }

    // Qadam 1: Avval /models orqali kalitning o'zini tekshirish
    // Bu usul model eskirib qolgan bo'lsa ham kalit to'g'riligini 100% aniqlaydi va faol modellarni qaytaradi
    const modelsEndpoint = targetBase.endsWith("/models")
      ? targetBase
      : `${targetBase}/models`;

    try {
      const modelsController = new AbortController();
      const modelsTimeout = setTimeout(() => modelsController.abort(), 7000);

      const modelsRes = await fetch(modelsEndpoint, {
        method: "GET",
        headers,
        signal: modelsController.signal,
      });
      clearTimeout(modelsTimeout);

      if (modelsRes.status === 200) {
        let fetchedModels: string[] = [];
        try {
          const modelsData = await modelsRes.json();
          if (Array.isArray(modelsData?.data)) {
            fetchedModels = modelsData.data
              .map((m: any) => (typeof m === "string" ? m : m?.id))
              .filter(Boolean);
          }
        } catch {}

        return NextResponse.json({
          valid: true,
          models: fetchedModels.length > 0 ? fetchedModels : undefined,
          message: "API kalit muvaffaqiyatli tasdiqlandi!",
        });
      }

      if (modelsRes.status === 401) {
        return NextResponse.json({
          valid: false,
          error: "API kalit noto‘g‘ri yoki yaroqsiz (401 Invalid API Key). Kalitni qayta tekshirib nusxalang.",
        });
      }

      if (modelsRes.status === 403) {
        return NextResponse.json({
          valid: false,
          error: "Ushbu API kalitga ruxsat yo‘q (403 Forbidden).",
        });
      }
    } catch {
      // /models ishlamasa yoki timeout bo'lsa chat/completions orqali davom etamiz
    }

    // Qadam 2: /chat/completions orqali test qilish
    const chatEndpoint = targetBase.endsWith("/chat/completions")
      ? targetBase
      : `${targetBase}/chat/completions`;

    const chatController = new AbortController();
    const chatTimeout = setTimeout(() => chatController.abort(), 10000);

    try {
      let testModel = cleanModel || getDefaultModel(provider);

      let res = await fetch(chatEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
        signal: chatController.signal,
      });

      // If 404 on Groq, attempt fallback to llama-3.1-8b-instant
      if (res.status === 404 && provider === "groq") {
        res = await fetch(chatEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          }),
          signal: chatController.signal,
        });
      }

      clearTimeout(chatTimeout);

      if (res.ok) {
        return NextResponse.json({ valid: true });
      }

      const errText = await res.text();
      let errorMsg = `Xatolik: HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg =
          parsed?.error?.message ||
          parsed?.message ||
          parsed?.error ||
          errorMsg;
      } catch {}

      if (res.status === 401) {
        errorMsg = "API kalit noto‘g‘ri yoki yaroqsiz (401 Invalid API Key). Kalitni tekshiring.";
      } else if (res.status === 403) {
        errorMsg = "Ushbu API kalitga ruxsat yo‘q (403 Forbidden).";
      } else if (res.status === 404) {
        errorMsg = `Model (${cleanModel}) provayderda mavjud emas yoki eskirgan (404). Boshqa modelni tanlang.`;
      } else if (res.status === 429) {
        if (errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("credit")) {
          errorMsg = "Hisobingizda mablag‘ yoki bepul limit tugagan (Quota exceeded).";
        } else {
          errorMsg = "Juda ko‘p so‘rov yuborildi (429 Rate limit). Biroz kuting.";
        }
      }

      return NextResponse.json({ valid: false, error: errorMsg });
    } catch (err: any) {
      clearTimeout(chatTimeout);
      if (err.name === "AbortError") {
        return NextResponse.json({
          valid: false,
          error: "Provayder serveri javob bermadi (Vaqt tugadi - Timeout)",
        });
      }
      return NextResponse.json({
        valid: false,
        error: `Ulanishda xatolik: ${err.message}`,
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, error: err.message || "Server xatosi" },
      { status: 500 }
    );
  }
}

function getDefaultUrl(provider: string): string {
  switch (provider) {
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "xai":
      return "https://api.x.ai/v1";
    case "mistral":
      return "https://api.mistral.ai/v1";
    case "together":
      return "https://api.together.xyz/v1";
    case "perplexity":
      return "https://api.perplexity.ai";
    default:
      return "https://api.openai.com/v1";
  }
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "groq":
      return "llama-3.3-70b-versatile";
    case "deepseek":
      return "deepseek-chat";
    case "openai":
      return "gpt-4o-mini";
    case "gemini":
      return "gemini-2.0-flash";
    case "openrouter":
      return "meta-llama/llama-3.3-70b-instruct:free";
    case "anthropic":
      return "claude-3-5-sonnet-20241022";
    default:
      return "gpt-4o-mini";
  }
}
