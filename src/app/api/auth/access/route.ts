import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, signAccess } from "@/lib/access";
import { serverFetch } from "@/lib/serverAuth";
import { sessionCookieOpts, clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

// 1-qadam: kirish kaliti lokal serverda (access.key) saqlanadi, urinishlar cheklovi ham o'sha yerda.
// Next kalitni bilmaydi: faqat serverdan tekshirishni so'raydi va to'g'ri bo'lsa imzolangan cookie beradi.
export async function POST(req: NextRequest) {
  if (!(process.env.MRAI_AUTH_TOKEN || "").trim()) {
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "MRAI_AUTH_TOKEN sozlanmagan" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const given = typeof body?.key === "string" ? body.key.trim() : "";
  if (!given) return NextResponse.json({ error: "Kalit noto'g'ri" }, { status: 401 });

  try {
    await serverFetch(undefined, "/api/auth/access", { body: { key: given, ip: clientIp(req) }, timeoutMs: 15000 });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (/ko'p urinish/i.test(msg)) return NextResponse.json({ error: msg }, { status: 429 });
    if (/noto'g'ri|noto‘g‘ri/i.test(msg)) return NextResponse.json({ error: "Kalit noto'g'ri" }, { status: 401 });
    if (/access\.key/.test(msg)) return NextResponse.json({ error: "Kirish kaliti serverda sozlanmagan" }, { status: 503 });
    return NextResponse.json({ error: "Server bilan aloqa yo'q. Birozdan keyin qayta urinib ko'ring." }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  // maxAge yo'q: session cookie — brauzer yopilsa kalit qayta so'raladi.
  res.cookies.set(ACCESS_COOKIE, await signAccess(), sessionCookieOpts(req));
  return res;
}
