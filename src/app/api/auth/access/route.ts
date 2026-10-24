import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, signAccess } from "@/lib/access";
import { serverFetch } from "@/lib/serverAuth";
import { sessionCookieOpts, clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 1: the access key is stored on the local server (access.key), and the attempt limit lives there too.
// Next never knows the key: it only asks the server to verify it and, if valid, issues a signed cookie.
export async function POST(req: NextRequest) {
  if (!(process.env.MRAI_AUTH_TOKEN || "").trim()) {
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "MRAI_AUTH_TOKEN is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const given = typeof body?.key === "string" ? body.key.trim() : "";
  if (!given) return NextResponse.json({ error: "Wrong access key" }, { status: 401 });

  try {
    await serverFetch(undefined, "/api/auth/access", { body: { key: given, ip: clientIp(req) }, timeoutMs: 15000 });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (/too many/i.test(msg)) return NextResponse.json({ error: msg }, { status: 429 });
    if (/wrong/i.test(msg)) return NextResponse.json({ error: "Wrong access key" }, { status: 401 });
    if (/access\.key/.test(msg)) return NextResponse.json({ error: "The access key is not configured on the server" }, { status: 503 });
    return NextResponse.json({ error: "Cannot reach the server. Try again in a moment." }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  // no maxAge: a session cookie — the key is asked again once the browser closes.
  res.cookies.set(ACCESS_COOKIE, await signAccess(), sessionCookieOpts(req));
  return res;
}
