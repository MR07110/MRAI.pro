import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { isAuthorized } from "@/lib/serverAuth";
import { USERNAME_RE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduler (local server) shu yerni chaqiradi: bir martalik agent ishga tushirish.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Ruxsat yo'q (token)" }, { status: 401 });
  }
  try {
    const b = await req.json();
    if (!b.prompt || !b.apiKey) return NextResponse.json({ ok: false, error: "prompt va apiKey kerak" }, { status: 400 });
    const user = typeof b.user === "string" && USERNAME_RE.test(b.user) ? b.user : "";
    if (!user) return NextResponse.json({ ok: false, error: "user kerak" }, { status: 400 });
    const r = await runAgent({
      provider: b.provider,
      apiKey: b.apiKey,
      model: b.model,
      baseUrl: b.baseUrl || undefined,
      system: b.system || undefined,
      messages: [{ role: "user", content: String(b.prompt) }],
      connectors: Array.isArray(b.connectors) ? b.connectors : [],
      serverUrl: b.serverUrl || undefined,
      user,
      appUrl: b.appUrl || undefined,
      keyId: b.keyId || undefined,
      maxSteps: b.maxSteps ?? 60,
      scheduled: true,
      signal: req.signal,
    });
    return NextResponse.json({
      ok: true,
      text: r.final.trim() || r.transcript.slice(-4000),
      steps: r.steps,
      log: r.transcript.slice(-12000),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "agent xatosi" }, { status: 200 });
  }
}
