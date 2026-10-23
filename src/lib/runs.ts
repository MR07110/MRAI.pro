// Server tomonidagi "ish sessiyalari": agent generatsiyasi brauzerga BOG'LIQ EMAS.
// Brauzer faqat ko'ruvchi (screen sharing kabi): sahifa yangilansa yoki yopilsa ham ish davom etadi,
// qayta ochilganda esa /api/agent/attach orqali shu ishga qayta ulanadi.
// Holat (matn + provayder limit kutish belgisi [[wait:...]]) shu Next serverda, har ~2s da va oxirida
// lokal Python serverdagi bazaga (xabar sifatida) saqlanadi.
import { runAgent, AgentInput } from "@/lib/agent";
import { serverFetch } from "@/lib/serverAuth";

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
  // Faqat xatodan iborat bo'lsa saqlamaymiz (avvalgi xatti-harakat: xato faqat ekranda ko'rinadi)
  if (run.status === "error" && run.text.trimStart().startsWith("Xatolik:")) return;
  try {
    await serverFetch(run.serverUrl, "/api/db/messages", {
      user: run.user,
      timeoutMs: 10000,
      body: { id: run.msgId, chat_id: run.chatId, role: "assistant", content: run.text, created_at: run.createdAt },
    });
  } catch (e) {
    console.error("[runs] saqlashda xato:", (e as Error)?.message);
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
        emit(`\n\nXatolik: ${e?.message || "noma'lum xato"}`);
        run.status = "error";
      }
    } finally {
      clearInterval(timer);
      while (saving) await sleep(30); // eski yozuv yangisini ustidan yozib yubormasin
      await persist(run);
      run.finishedAt = Date.now();
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

// Ishga ulangan SSE oqim: avval hozirgacha yig'ilgan matn (snapshot), keyin yangi qismlar.
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
