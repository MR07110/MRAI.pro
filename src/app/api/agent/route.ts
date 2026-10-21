import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Kirish: src/proxy.ts (login cookie) shu routeni himoya qiladi; Bearer faqat /api/agent/run uchun.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON noto'g'ri" }, { status: 400 });
  }
  if (!body.apiKey || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    return NextResponse.json({ error: "API kalit kiritilmagan. Sozlamalardan kalit qo'shing." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Xabarlar ro'yxati bo'sh" }, { status: 400 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {}
      };
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 15000);
      try {
        await runAgent({
          provider: body.provider,
          apiKey: body.apiKey,
          model: body.model,
          baseUrl: body.baseUrl,
          system: body.systemPrompt,
          messages: body.messages.filter((m: any) => m && (m.role === "user" || m.role === "assistant")),
          temperature: body.temperature,
          maxTokens: body.maxTokens,
          connectors: Array.isArray(body.connectors) ? body.connectors : [],
          serverUrl: body.serverUrl,
          appUrl: body.appUrl || new URL(req.url).origin,
          keyId: body.keyId,
          maxSteps: body.maxSteps,
          signal: req.signal,
          emit: (content) => send({ content }),
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") send({ content: `\n\nXatolik: ${e?.message || "noma'lum xato"}` });
      } finally {
        clearInterval(ping);
        try {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
