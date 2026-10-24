import { NextRequest, NextResponse } from "next/server";
import { hasAccess, sessionUserFromRequest } from "@/lib/session";
import { callAuth } from "@/lib/authApi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await hasAccess(req);
  const username = access ? await sessionUserFromRequest(req) : null;
  let user: { username: string; name: string } | null = null;
  if (username) {
    const r = await callAuth("/api/auth/me", { username });
    if (r.user) user = r.user;
    else if (r.status === 502) user = { username, name: username }; // server briefly down — the session stays valid
  }
  return NextResponse.json({ access, user }, { headers: { "Cache-Control": "no-store" } });
}
