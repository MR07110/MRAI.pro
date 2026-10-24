import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { getRun, sseForRun } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On page refresh / reopen: reattach to the agent still running for this chat.
//  204 -- no job; JSON {done:true} -- recently finished (reload messages from the DB); otherwise SSE.
export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const chatId = (new URL(req.url).searchParams.get("chatId") || "").trim();
  if (!chatId) return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  const run = getRun(user, chatId);
  if (!run) return new Response(null, { status: 204 });
  if (run.status !== "running") return NextResponse.json({ done: true, msgId: run.msgId });
  return sseForRun(run, req.signal);
}
