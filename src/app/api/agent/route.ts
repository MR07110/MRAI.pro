import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { startRun, sseForRun } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Agent ishi SERVERDA boshlanadi va brauzerga bog'liq emas (src/lib/runs.ts).
// Bu yerdagi oqim faqat "ko'rinish": brauzer uzilsa ish davom etadi, /api/agent/attach orqali qayta ulanish mumkin.
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
  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  const msgId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (!chatId || !msgId) {
    return NextResponse.json({ error: "chatId va messageId kerak" }, { status: 400 });
  }

  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Kirish talab qilinadi" }, { status: 401 });

  const run = startRun({
    chatId,
    user,
    msgId,
    input: {
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
    },
  });
  return sseForRun(run, req.signal);
}
