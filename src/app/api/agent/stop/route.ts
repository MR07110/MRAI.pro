import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { stopRun } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  if (!chatId) return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  return NextResponse.json({ ok: true, stopped: stopRun(user, chatId) });
}
