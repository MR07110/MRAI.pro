import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCookieValue } from "@/lib/access";
import { safeEqual } from "@/lib/serverAuth";
import { SESSION_COOKIE_OPTS, clientIp } from "@/lib/session";
import { makeLimiter } from "@/lib/authApi";

export const dynamic = "force-dynamic";

// 1-qadam: kirish kaliti. 10 daqiqada 5 ta xato -> bloklanadi.
const limiter = makeLimiter(5, 10 * 60 * 1000);

export async function POST(req: NextRequest) {
  const key = (process.env.MRAI_ACCESS_KEY || "").trim();
  if (!key) {
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "MRAI_ACCESS_KEY sozlanmagan" }, { status: 503 });
  }

  const ip = clientIp(req);
  if (limiter.blocked(ip)) {
    return NextResponse.json({ error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const given = typeof body?.key === "string" ? body.key.trim() : "";

  if (given && safeEqual(given, key)) {
    limiter.reset(ip);
    const res = NextResponse.json({ ok: true });
    // maxAge yo'q: session cookie — brauzer yopilsa kalit qayta so'raladi.
    res.cookies.set(ACCESS_COOKIE, await accessCookieValue(key), SESSION_COOKIE_OPTS);
    return res;
  }

  limiter.hit(ip);
  await new Promise((r) => setTimeout(r, 600));
  return NextResponse.json({ error: "Kalit noto'g'ri" }, { status: 401 });
}
