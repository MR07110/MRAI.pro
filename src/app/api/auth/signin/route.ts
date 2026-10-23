import { NextRequest, NextResponse } from "next/server";
import { hasAccess, clientIp } from "@/lib/session";
import { callAuth, makeLimiter, withSession } from "@/lib/authApi";

export const dynamic = "force-dynamic";

// 2-qadam (B): kirish — faqat kirish kaliti kiritilgan bo'lsa. 10 daqiqada 6 ta xato (ip+username).
const limiter = makeLimiter(6, 10 * 60 * 1000);

export async function POST(req: NextRequest) {
  if (!(await hasAccess(req))) return NextResponse.json({ error: "Avval kirish kalitini kiriting" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const username = String(b?.username || "").trim().toLowerCase();
  const password = String(b?.password || "");
  if (!username || !password) return NextResponse.json({ error: "Username va parolni kiriting" }, { status: 400 });

  const k = clientIp(req) + ":" + username;
  if (limiter.blocked(k)) return NextResponse.json({ error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." }, { status: 429 });

  const r = await callAuth("/api/auth/verify", { username, password });
  if (!r.user) {
    if (r.status === 401) limiter.hit(k);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  limiter.reset(k);
  return withSession(r.user, req);
}
