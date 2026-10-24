import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { addMemory, clearMemory, deleteMemory, getMemory, setMemoryEnabled } from "@/lib/stateStore";

// Claude-style memory: durable facts the assistant saves and reuses. Per user, server-side.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const m = await getMemory(user);
  return NextResponse.json(m, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const op = String(body?.op || "");
  switch (op) {
    case "add":
      await addMemory(user, String(body?.text || ""));
      break;
    case "delete":
      await deleteMemory(user, String(body?.id || ""));
      break;
    case "clear":
      await clearMemory(user);
      break;
    case "toggle":
      await setMemoryEnabled(user, !!body?.enabled);
      break;
    default:
      return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  }
  return NextResponse.json(await getMemory(user), { headers: { "Cache-Control": "no-store" } });
}
