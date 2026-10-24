import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { readState, withState, type QueueItem, type RunTemplate } from "@/lib/stateStore";
import { getRun, stopRun, startQueued, dequeueAndStart } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_QUEUE = 50;

const pub = (q: QueueItem[] | undefined) => (q || []).map((i) => ({ id: i.id, text: i.text, createdAt: i.createdAt }));

async function snapshot(user: string, chatId: string) {
  const s = await readState(user);
  const run = getRun(user, chatId);
  return { queue: pub(s.queues[chatId]), running: !!run && run.status === "running", msgId: run?.msgId };
}

// Queued messages: stored on the server; when a run finishes, the server starts the next one itself.
export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const chatId = (new URL(req.url).searchParams.get("chatId") || "").trim();
  if (!CHAT_RE.test(chatId)) return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  return NextResponse.json(await snapshot(user, chatId), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const chatId = typeof b.chatId === "string" ? b.chatId.trim() : "";
  if (!CHAT_RE.test(chatId)) return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  const action = typeof b.action === "string" ? b.action : "add";

  if (action === "add") {
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Text is empty" }, { status: 400 });
    if (!b.apiKey || !b.model || !b.provider) {
      return NextResponse.json({ error: "API key and model are required" }, { status: 400 });
    }
    const run: RunTemplate = {
      provider: b.provider,
      apiKey: b.apiKey,
      model: b.model,
      baseUrl: b.baseUrl || undefined,
      systemPrompt: b.systemPrompt || undefined,
      temperature: b.temperature,
      maxTokens: b.maxTokens,
      connectors: Array.isArray(b.connectors) ? b.connectors : [],
      serverUrl: b.serverUrl || undefined,
      appUrl: b.appUrl || new URL(req.url).origin,
      keyId: b.keyId,
      maxSteps: b.maxSteps,
    };
    const item: QueueItem = {
      id: typeof b.id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(b.id) ? b.id : crypto.randomUUID(),
      text: text.slice(0, 20000),
      createdAt: new Date().toISOString(),
      run,
    };
    const ok = await withState(user, (s) => {
      const q = (s.queues[chatId] ||= []);
      if (q.length >= MAX_QUEUE) return false;
      q.push(item);
      return true;
    });
    if (!ok) return NextResponse.json({ error: `Queue is full (${MAX_QUEUE})` }, { status: 429 });
    // If the job already finished -- start immediately without waiting
    const cur = getRun(user, chatId);
    if (!cur || cur.status !== "running") await dequeueAndStart(user, chatId);
  } else if (action === "remove") {
    const id = String(b.id || "");
    await withState(user, (s) => {
      const q = s.queues[chatId];
      if (!q) return;
      s.queues[chatId] = q.filter((i) => i.id !== id);
      if (!s.queues[chatId].length) delete s.queues[chatId];
    });
  } else if (action === "clear") {
    await withState(user, (s) => {
      delete s.queues[chatId];
    });
  } else if (action === "send-now") {
    // Stops the current job and sends the chosen message right away
    const id = String(b.id || "");
    const item = await withState(user, (s) => {
      const q = s.queues[chatId] || [];
      const it = q.find((i) => i.id === id) || null;
      if (it) {
        s.queues[chatId] = q.filter((i) => i.id !== id);
        if (!s.queues[chatId].length) delete s.queues[chatId];
      }
      return it;
    });
    if (item) {
      const cur = getRun(user, chatId);
      if (cur && cur.status === "running") {
        stopRun(user, chatId);
        for (let i = 0; i < 100 && !cur.finishedAt; i++) await new Promise((r) => setTimeout(r, 50));
      }
      await startQueued(user, chatId, item);
    }
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  return NextResponse.json(await snapshot(user, chatId));
}
