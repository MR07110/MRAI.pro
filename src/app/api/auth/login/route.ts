import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCookieValue } from "@/lib/access";
import { safeEqual } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

// Oddiy brute-force himoyasi (har instance uchun xotirada): 10 daqiqada 5 ta xato.
const fails = new Map<string, { n: number; t: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

export async function POST(req: NextRequest) {
  const key = (process.env.MRAI_ACCESS_KEY || "").trim();
  if (!key) {
    return NextResponse.json({ error: "MRAI_ACCESS_KEY sozlanmagan" }, { status: 503 });
  }

  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const rec = fails.get(ip);
  if (rec && now - rec.t < WINDOW_MS && rec.n >= MAX_FAILS) {
    return NextResponse.json({ error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const given = typeof body?.key === "string" ? body.key.trim() : "";

  if (given && safeEqual(given, key)) {
    fails.delete(ip);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACCESS_COOKIE, await accessCookieValue(key), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  fails.set(ip, { n: rec && now - rec.t < WINDOW_MS ? rec.n + 1 : 1, t: rec && now - rec.t < WINDOW_MS ? rec.t : now });
  await new Promise((r) => setTimeout(r, 600));
  return NextResponse.json({ error: "Kalit noto'g'ri" }, { status: 401 });
}
