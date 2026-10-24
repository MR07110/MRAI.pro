import { NextRequest, NextResponse } from "next/server";
import { hasAccess, clientIp, USERNAME_RE } from "@/lib/session";
import { callAuth, makeLimiter, withSession } from "@/lib/authApi";

export const dynamic = "force-dynamic";

// Step 2 (A): registration — only once the access key has been entered. 10 per hour.
const limiter = makeLimiter(10, 60 * 60 * 1000);

export async function POST(req: NextRequest) {
  if (!(await hasAccess(req))) return NextResponse.json({ error: "Enter the access key first" }, { status: 401 });
  const ip = clientIp(req);
  if (limiter.blocked(ip)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const b = await req.json().catch(() => ({}));
  const username = String(b?.username || "").trim().toLowerCase();
  const name = String(b?.name || "").trim();
  const password = String(b?.password || "");
  if (!name) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Username must be 3-32 characters: a-z, 0-9, _ . -" }, { status: 400 });
  }
  if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  limiter.hit(ip);
  const r = await callAuth("/api/auth/register", { username, name, password });
  if (!r.user) return NextResponse.json({ error: r.error }, { status: r.status });
  return withSession(r.user, req);
}
