import { NextRequest, NextResponse } from "next/server";
import { hasAccess, sessionUserFromRequest } from "@/lib/session";
import { callAuth } from "@/lib/authApi";

export const dynamic = "force-dynamic";

// Update the name or password (changing the password requires the current one).
export async function POST(req: NextRequest) {
  const username = (await hasAccess(req)) ? await sessionUserFromRequest(req) : null;
  if (!username) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = { username };
  if (typeof b?.name === "string") payload.name = b.name;
  if (typeof b?.new_password === "string") {
    payload.new_password = b.new_password;
    payload.old_password = String(b?.old_password || "");
  }
  const r = await callAuth("/api/auth/update", payload);
  if (!r.user) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, user: r.user });
}
