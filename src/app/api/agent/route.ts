import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { startRun, sseForRun } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The agent job starts on the SERVER and is independent of the browser (src/lib/runs.ts).
// The stream here is only a "view": if the browser drops, the job continues and can be reattached via /api/agent/attach.
export async function POST(req: NextRequest) {
  // Access: src/proxy.ts (login cookie) protects this route; Bearer is only for /api/agent/run.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.apiKey || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    return NextResponse.json({ error: "No API key entered. Add one in Settings." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "The message list is empty" }, { status: 400 });
  }
  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  const msgId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (!chatId || !msgId) {
    return NextResponse.json({ error: "chatId and messageId are required" }, { status: 400 });
  }

  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

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
