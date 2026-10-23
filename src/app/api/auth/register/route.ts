import { NextRequest, NextResponse } from "next/server";
import { hasAccess, clientIp, USERNAME_RE } from "@/lib/session";
import { callAuth, makeLimiter, withSession } from "@/lib/authApi";

export const dynamic = "force-dynamic";

// 2-qadam (A): ro'yxatdan o'tish — faqat kirish kaliti kiritilgan bo'lsa. Soatiga 10 ta.
const limiter = makeLimiter(10, 60 * 60 * 1000);

export async function POST(req: NextRequest) {
  if (!(await hasAccess(req))) return NextResponse.json({ error: "Avval kirish kalitini kiriting" }, { status: 401 });
  const ip = clientIp(req);
  if (limiter.blocked(ip)) return NextResponse.json({ error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." }, { status: 429 });

  const b = await req.json().catch(() => ({}));
  const username = String(b?.username || "").trim().toLowerCase();
  const name = String(b?.name || "").trim();
  const password = String(b?.password || "");
  if (!name) return NextResponse.json({ error: "Ismingizni kiriting" }, { status: 400 });
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Username 3-32 belgi: a-z, 0-9, _ . -" }, { status: 400 });
  }
  if (password.length < 6) return NextResponse.json({ error: "Parol kamida 6 ta belgi bo'lishi kerak" }, { status: 400 });

  limiter.hit(ip);
  const r = await callAuth("/api/auth/register", { username, name, password });
  if (!r.user) return NextResponse.json({ error: r.error }, { status: r.status });
  return withSession(r.user, req);
}
