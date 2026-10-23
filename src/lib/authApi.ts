// Next route'lar uchun: Python server /api/auth/* ga murojaat va xatoni HTTP statusga aylantirish.
import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/serverAuth";
import { signSession, USER_COOKIE, sessionCookieOpts } from "@/lib/session";

export type AuthUser = { username: string; name: string };

export async function callAuth(path: string, body: Record<string, unknown>): Promise<{ user?: AuthUser; error?: string; status: number }> {
  try {
    const data = await serverFetch(undefined, path, { body, timeoutMs: 15000 });
    return { user: data?.user, status: 200 };
  } catch (e: any) {
    const msg = String(e?.message || "Xatolik");
    if (/Serverga|fetch failed|timeout|aborted|JSON emas|sozlanmagan/i.test(msg)) {
      return { error: "Server bilan aloqa yo'q. Birozdan keyin qayta urinib ko'ring.", status: 502 };
    }
    if (/band/i.test(msg)) return { error: msg, status: 409 };
    if (/noto'g'ri|noto‘g‘ri/i.test(msg)) return { error: msg, status: 401 };
    return { error: msg, status: 400 };
  }
}

export async function withSession(user: AuthUser, req: Request): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(USER_COOKIE, await signSession(user.username), sessionCookieOpts(req));
  return res;
}

// Oddiy xotiradagi urinish cheklovchi
export function makeLimiter(max: number, windowMs: number) {
  const m = new Map<string, { n: number; t: number }>();
  return {
    blocked(k: string) {
      const r = m.get(k);
      return !!r && Date.now() - r.t < windowMs && r.n >= max;
    },
    hit(k: string) {
      const now = Date.now();
      const r = m.get(k);
      if (r && now - r.t < windowMs) r.n++;
      else m.set(k, { n: 1, t: now });
    },
    reset(k: string) {
      m.delete(k);
    },
  };
}
