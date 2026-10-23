import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { getRun, sseForRun } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sahifa yangilangach/qayta ochilganda: shu suhbatdagi ishlayotgan agentga qayta ulanish.
//  204 -- ish yo'q; JSON {done:true} -- yaqinda tugagan (xabarlarni bazadan qayta yuklang); aks holda SSE.
export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Kirish talab qilinadi" }, { status: 401 });
  const chatId = (new URL(req.url).searchParams.get("chatId") || "").trim();
  if (!chatId) return NextResponse.json({ error: "chatId kerak" }, { status: 400 });
  const run = getRun(user, chatId);
  if (!run) return new Response(null, { status: 204 });
  if (run.status !== "running") return NextResponse.json({ done: true, msgId: run.msgId });
  return sseForRun(run, req.signal);
}
