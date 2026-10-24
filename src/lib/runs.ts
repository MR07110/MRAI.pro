// Server tomonidagi "ish sessiyalari": agent generatsiyasi brauzerga BOG'LIQ EMAS.
// The browser is only a viewer (like screen sharing): the job continues even if the page is refreshed or closed,
// qayta ochilganda esa /api/agent/attach orqali shu ishga qayta ulanadi.
// State (text + the provider-limit wait marker [[wait:...]]) lives on this Next server, every ~2s and at the end
// and is saved (as a message) to the database on the local Python server.
import { runAgent, AgentInput } from "@/lib/agent";
import { serverFetch } from "@/lib/serverAuth";
import { withState, type QueueItem } from "@/lib/stateStore";

export type RunStatus = "running" | "done" | "stopped" | "error";

export interface Run {
  id: string;
  chatId: string;
  user: string;
  msgId: string;
  serverUrl?: string;
  text: string;
  status: RunStatus;
  createdAt: string;
  finishedAt?: number;
  controller: AbortController;
  listeners: Set<(delta: string) => void>;
  endListeners: Set<() => void>;
}

const g = globalThis as typeof globalThis & { __mraiRuns?: Map<string, Run> };
const runs: Map<string, Run> = g.__mraiRuns || (g.__mraiRuns = new Map());
const keyOf = (user: string, chatId: string) => user + "\u0000" + chatId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getRun(user: string, chatId: string): Run | null {
  return runs.get(keyOf(user, chatId)) || null;
}

export function stopRun(user: string, chatId: string): boolean {
  const run = getRun(user, chatId);
  if (!run || run.status !== "running") return false;
  run.controller.abort();
  return true;
}

async function persist(run: Run) {
  if (!run.text.trim()) return;
  // Do not persist a message that is only an error (previous behaviour: errors show on screen only)
  if (run.status === "error" && run.text.trimStart().startsWith("Error:")) return;
  try {
    await serverFetch(run.serverUrl, "/api/db/messages", {
      user: run.user,
      timeoutMs: 10000,
      body: { id: run.msgId, chat_id: run.chatId, role: "assistant", content: run.text, created_at: run.createdAt },
    });
  } catch (e) {
    console.error("[runs] save failed:", (e as Error)?.message);
  }
}

export function startRun(p: {
  chatId: string;
  user: string;
  msgId: string;
  input: Omit<AgentInput, "signal" | "emit" | "onWait" | "user">;
}): Run {
  const k = keyOf(p.user, p.chatId);
  const old = runs.get(k);
  if (old && old.status === "running") old.controller.abort();

  const run: Run = {
    id: crypto.randomUUID(),
    chatId: p.chatId,
    user: p.user,
    msgId: p.msgId,
    serverUrl: p.input.serverUrl,
    text: "",
    status: "running",
    createdAt: new Date().toISOString(),
    controller: new AbortController(),
    listeners: new Set(),
    endListeners: new Set(),
  };
  runs.set(k, run);

  const emit = (s: string) => {
    if (!s) return;
    run.text += s;
    for (const l of run.listeners) {
      try {
        l(s);
      } catch {}
    }
  };

  let saving: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (saving) return;
    saving = persist(run).finally(() => {
      saving = null;
    });
  }, 2000);

  (async () => {
    try {
      await runAgent({ ...p.input, user: p.user, chatId: p.chatId, signal: run.controller.signal, emit });
      run.status = run.controller.signal.aborted ? "stopped" : "done";
    } catch (e: any) {
      if (e?.name === "AbortError" || run.controller.signal.aborted) {
        run.status = "stopped";
      } else {
        emit(`\n\nError: ${e?.message || "unknown error"}`);
        run.status = "error";
      }
    } finally {
      clearInterval(timer);
      while (saving) await sleep(30); // so an older write does not overwrite the newer one
      await persist(run);
      run.finishedAt = Date.now();
      // If there is a queued message, the SERVER starts the next one itself (even if the browser is closed).
      // BEFORE notifying listeners: when the browser reconnects, the new job is already ready.
      // If the user "stopped" it or there was an error, the queue pauses.
      if (run.status === "done") {
        try {
          await dequeueAndStart(run.user, run.chatId);
        } catch (e) {
          console.error("[runs] navbat:", (e as Error)?.message);
        }
      }
      for (const l of run.endListeners) {
        try {
          l();
        } catch {}
      }
      const t = setTimeout(() => {
        if (runs.get(k) === run) runs.delete(k);
      }, 120000);
      (t as any).unref?.();
    }
  })();

  return run;
}

// SSE stream attached to a job: first the text gathered so far (snapshot), then new chunks.
// Brauzer uzilsa FAQAT tinglovchi olib tashlanadi; ish to'xtamaydi.
export function sseForRun(run: Run, reqSignal: AbortSignal): Response {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {}
      };
      const onDelta = (d: string) => send({ content: d });
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 15000);
      cleanup = () => {
        clearInterval(ping);
        run.listeners.delete(onDelta);
        run.endListeners.delete(finish);
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {}
      };
      if (run.text) send({ snapshot: run.text, msgId: run.msgId });
      if (run.status !== "running") {
        finish();
        return;
      }
      run.listeners.add(onDelta);
      run.endListeners.add(finish);
      reqSignal.addEventListener("abort", () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "x-run-msg-id": run.msgId,
    },
  });
}

// ---- Navbat (queued messages) ----
// Takes the first queued message, saves it as a user message and starts a new job.
export async function dequeueAndStart(user: string, chatId: string): Promise<boolean> {
  const item = await withState(user, (st) => {
    const q = st.queues[chatId];
    if (!q || !q.length) return null;
    const it = q.shift()!;
    if (!q.length) delete st.queues[chatId];
    return it;
  });
  if (!item) return false;
  return startQueued(user, chatId, item);
}

export async function startQueued(user: string, chatId: string, item: QueueItem): Promise<boolean> {
  const t = item.run;
  try {
    await serverFetch(t.serverUrl, "/api/db/messages", {
      user,
      timeoutMs: 10000,
      body: { id: item.id, chat_id: chatId, role: "user", content: item.text, created_at: new Date().toISOString() },
    });
    const rows = await serverFetch(t.serverUrl, `/api/db/messages?chat_id=${encodeURIComponent(chatId)}`, { user, timeoutMs: 10000 });
    const messages = (Array.isArray(rows) ? rows : [])
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content ?? "") }));
    if (!messages.length) return false;
    startRun({
      chatId,
      user,
      msgId: crypto.randomUUID(),
      input: {
        provider: t.provider as any,
        apiKey: t.apiKey,
        model: t.model,
        baseUrl: t.baseUrl,
        system: t.systemPrompt,
        messages,
        temperature: t.temperature,
        maxTokens: t.maxTokens,
        connectors: (t.connectors as any[]) || [],
        serverUrl: t.serverUrl,
        appUrl: t.appUrl,
        keyId: t.keyId,
        maxSteps: t.maxSteps,
      },
    });
    return true;
  } catch (e) {
    console.error("[runs] could not start the queued message:", (e as Error)?.message);
    return false;
  }
}
