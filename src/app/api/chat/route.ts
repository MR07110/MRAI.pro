import { applyPromptVars } from "@/lib/promptVars";
import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { recordUsage, estTok } from "@/lib/usage";
import { getMemory } from "@/lib/stateStore";

// providers known to reliably accept stream_options.include_usage (others may error on the unknown field)
const USAGE_STREAM_PROVIDERS = new Set(["openai", "groq", "openrouter", "deepseek", "xai", "together"]);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      apiKey,
      provider,
      model,
      baseUrl,
      systemPrompt,
      temperature = 0.7,
      maxTokens = 4096,
      stream = true,
      chatId,
      keyId,
    } = await req.json();

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json(
        { error: "No API key entered. Please add one in Settings." },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "The message list cannot be empty." },
        { status: 400 }
      );
    }

    const cleanKey = apiKey.trim();
    const cleanModel = sanitizeModel(provider, model);
    const usageUser = (await sessionUserFromRequest(req).catch(() => null)) || "";
    let usedModel = cleanModel;
    const track = (input: number, output: number, estimated = false) =>
      recordUsage(usageUser, undefined, {
        provider: String(provider || "custom"),
        model: usedModel,
        keyId: typeof keyId === "string" ? keyId : "",
        source: "chat",
        chatId: typeof chatId === "string" ? chatId : "",
        input,
        output,
        estimated,
      });
    const finalMaxTokens = Math.min(Math.max(1, Number(maxTokens) || 4096), 8192);
    let cleanSystem = applyPromptVars(typeof systemPrompt === "string" ? systemPrompt : ""); // no hidden fallback text

    // Inject saved memory for the signed-in user (same as agent), so facts are available even in plain chat.
    try {
      const usageUser = (await sessionUserFromRequest(req).catch(() => null)) || "";
      if (usageUser) {
        const mem = await getMemory(usageUser).catch(() => null);
        if (mem && mem.enabled && mem.items?.length) {
          const items = mem.items.slice(-40);
          cleanSystem += "\n\nSAVED MEMORY (facts already known about the user — use these directly):\n" + items.map((m) => `- ${m.text}`).join("\n");
        }
      }
    } catch { /* memory is optional */ }

    // 1. ANTHROPIC CLAUDE NATIVE API
    if (provider === "anthropic") {
      return handleAnthropic({
        messages,
        apiKey: cleanKey,
        model: cleanModel,
        systemPrompt: cleanSystem,
        temperature,
        maxTokens: finalMaxTokens,
        stream,
        track,
      });
    }

    // 2. OPENAI VA OPENAI-MOS PROVAYDERLAR
    let targetBase = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
    if (!targetBase) {
      targetBase = getDefaultUrl(provider);
    }

    const endpoint = targetBase.endsWith("/chat/completions")
      ? targetBase
      : `${targetBase}/chat/completions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${cleanKey}`,
      "Content-Type": "application/json",
    };

    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://mrai-uzbek.vercel.app";
      headers["X-Title"] = "MR AI Pro";
    }

    // Prepare message payload with system instruction
    const apiMessages: Array<{ role: string; content: string }> = [];
    if (cleanSystem) {
      apiMessages.push({ role: "system", content: cleanSystem });
    }
    for (const m of messages) {
      if (m.role === "user" || m.role === "assistant") {
        apiMessages.push({ role: m.role, content: m.content || "" });
      }
    }

    const inChars = JSON.stringify(apiMessages).length;
    const bodyPayload: Record<string, any> = {
      model: cleanModel,
      messages: apiMessages,
      temperature: Math.min(Math.max(0, Number(temperature) || 0.7), 2),
      max_tokens: finalMaxTokens,
      stream,
    };
    if (stream && USAGE_STREAM_PROVIDERS.has(String(provider))) {
      bodyPayload.stream_options = { include_usage: true };
    }

    let res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
    });

    // Auto-fallback on 404 for Groq if requested model is unavailable/deprecated
    if (res.status === 404 && provider === "groq") {
      const groqCandidates = [
        "llama-3.1-8b-instant",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "mixtral-8x7b-32768",
        "llama-3.3-70b-versatile",
      ];
      for (const fallbackModel of groqCandidates) {
        if (fallbackModel !== cleanModel) {
          const fallbackRes = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ ...bodyPayload, model: fallbackModel }),
          });
          if (fallbackRes.ok) {
            res = fallbackRes;
            usedModel = fallbackModel;
            break;
          }
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Error: HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg =
          parsed?.error?.message ||
          parsed?.message ||
          parsed?.error ||
          errorMsg;
      } catch {}

      if (res.status === 401) {
        errorMsg =
          "API key error: the key is invalid or expired (401 Invalid API Key). Please enter a new key in Settings.";
      } else if (res.status === 404) {
        errorMsg = `Model (${cleanModel}) was not found at the provider (404). Please choose an active model in Settings.`;
      } else if (res.status === 429) {
        errorMsg =
          "The provider's rate limit or balance is exhausted (429 Rate limit / Quota exceeded). Wait a moment or choose another model/key.";
      }

      return NextResponse.json({ error: errorMsg }, { status: res.status });
    }

    // NON-STREAMING RESPONSE
    if (!stream || !res.body) {
      const json = await res.json();
      const content =
        json.choices?.[0]?.message?.content ||
        json.choices?.[0]?.delta?.content ||
        "";
      const ju = json.usage;
      if (ju && (ju.prompt_tokens || ju.completion_tokens)) track(Number(ju.prompt_tokens) || 0, Number(ju.completion_tokens) || 0);
      else track(estTok(inChars), estTok(String(content).length), true);
      return NextResponse.json({ content });
    }

    // STREAMING SSE RESPONSE (OpenAI -> Client standard SSE)
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const streamResponse = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let insideReasoning = false;
        let uIn = 0;
        let uOut = 0;
        let uGot = false;
        let outChars = 0;
        let flushed = false;
        const flushUsage = () => {
          if (flushed) return;
          flushed = true;
          if (uGot) track(uIn, uOut);
          else track(estTok(inChars), estTok(outChars), true);
        };
        const capture = (parsed: any) => {
          const us = parsed?.usage ?? parsed?.x_groq?.usage;
          if (us && (us.prompt_tokens || us.completion_tokens)) {
            uIn = Number(us.prompt_tokens) || 0;
            uOut = Number(us.completion_tokens) || 0;
            uGot = true;
          }
          const d = parsed?.choices?.[0]?.delta;
          outChars += String(d?.content ?? d?.text ?? parsed?.choices?.[0]?.text ?? "").length +
            String(d?.reasoning_content ?? d?.reasoning ?? d?.thought ?? "").length;
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (buffer.trim()) {
                const remainingLines = buffer.split("\n");
                for (const line of remainingLines) {
                  const trimmed = line.trim();
                  if (!trimmed || !trimmed.startsWith("data: ")) continue;
                  const dataStr = trimmed.slice(6).trim();
                  if (dataStr === "[DONE]") break;
                  try {
                    const parsed = JSON.parse(dataStr);
                    capture(parsed);
                    const delta = parsed.choices?.[0]?.delta;
                    const text = delta?.content ?? delta?.text ?? "";
                    if (text) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
                      );
                    }
                  } catch {}
                }
              }
              if (insideReasoning) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "</think>\n\n" })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                if (insideReasoning) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "</think>\n\n" })}\n\n`));
                  insideReasoning = false;
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(dataStr);
                capture(parsed);
                const delta = parsed.choices?.[0]?.delta;
                const text = delta?.content ?? delta?.text ?? parsed.choices?.[0]?.text ?? "";
                const reasoning =
                  delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought ?? "";

                if (reasoning) {
                  if (!insideReasoning) {
                    insideReasoning = true;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: "<think>" + reasoning })}\n\n`)
                    );
                  } else {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: reasoning })}\n\n`)
                    );
                  }
                } else if (text) {
                  if (insideReasoning) {
                    insideReasoning = false;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: "</think>\n\n" + text })}\n\n`)
                    );
                  } else {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
                    );
                  }
                }
              } catch {}
            }
          }
        } catch (err: any) {
          controller.error(err);
        } finally {
          flushUsage();
        }
      },
    });

    return new Response(streamResponse, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleAnthropic(params: {
  messages: Array<{ role: string; content: string }>;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  track: (input: number, output: number, estimated?: boolean) => void;
}) {
  const anthropicMessages = params.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content || "",
    }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
      messages: anthropicMessages,
      temperature: params.temperature,
      stream: params.stream,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = `Anthropic error (${res.status})`;
    try {
      const parsed = JSON.parse(errText);
      message = parsed?.error?.message || message;
    } catch {}

    if (res.status === 401) {
      message = "The Anthropic API key is wrong or invalid (401 Unauthorized).";
    }

    return NextResponse.json({ error: message }, { status: res.status });
  }

  if (!params.stream || !res.body) {
    const data = await res.json();
    const content = data?.content?.[0]?.text || "";
    const au = data?.usage;
    if (au && (au.input_tokens || au.output_tokens)) {
      params.track((Number(au.input_tokens) || 0) + (Number(au.cache_creation_input_tokens) || 0) + (Number(au.cache_read_input_tokens) || 0), Number(au.output_tokens) || 0);
    } else {
      params.track(estTok(JSON.stringify(anthropicMessages).length + params.systemPrompt.length), estTok(String(content).length), true);
    }
    return NextResponse.json({ content });
  }

  // Anthropic SSE stream -> Standard SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const streamResponse = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let aIn = 0;
      let aOut = 0;
      let aGot = false;
      let aChars = 0;
      let aFlushed = false;
      const aFlush = () => {
        if (aFlushed) return;
        aFlushed = true;
        if (aGot) params.track(aIn, aOut);
        else params.track(estTok(JSON.stringify(anthropicMessages).length + params.systemPrompt.length), estTok(aChars), true);
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const dataStr = trimmed.slice(6).trim();
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === "message_start" && parsed.message?.usage) {
                const mu = parsed.message.usage;
                aIn = (Number(mu.input_tokens) || 0) + (Number(mu.cache_creation_input_tokens) || 0) + (Number(mu.cache_read_input_tokens) || 0);
                aOut = Number(mu.output_tokens) || 0;
                aGot = true;
              } else if (parsed.type === "message_delta" && parsed.usage?.output_tokens != null) {
                aOut = Number(parsed.usage.output_tokens) || 0;
              } else if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                aChars += String(parsed.delta.text).length;
              }
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`)
                );
              } else if (parsed.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
            } catch {}
          }
        }
      } catch (err: any) {
        controller.error(err);
      } finally {
        aFlush();
      }
    },
  });

  return new Response(streamResponse, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
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
    case "ollama":
      return "https://ollama.com/v1";
    default:
      return "https://api.openai.com/v1";
  }
}

function sanitizeModel(provider: string, model?: string): string {
  const m = (model || "").trim();
  // Always respect user's requested model if provided
  if (m) return m;

  if (provider === "groq") return "llama-3.1-8b-instant";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "openrouter") return "openrouter/free";
  if (provider === "anthropic") return "claude-3-5-sonnet-20241022";
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "ollama") return "gpt-oss:120b";
  return "gpt-4o-mini";
}
