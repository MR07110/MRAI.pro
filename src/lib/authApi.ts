// For the Next routes: call the Python server /api/auth/* and turn errors into HTTP statuses.
import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/serverAuth";
import { signSession, USER_COOKIE, sessionCookieOpts } from "@/lib/session";

export type AuthUser = { username: string; name: string };

export async function callAuth(path: string, body: Record<string, unknown>): Promise<{ user?: AuthUser; error?: string; status: number }> {
  try {
    const data = await serverFetch(undefined, path, { body, timeoutMs: 15000 });
    return { user: data?.user, status: 200 };
  } catch (e: any) {
    const msg = String(e?.message || "Error");
    if (/connect to the server|Serverga|fetch failed|timeout|aborted|not JSON|not configured/i.test(msg)) {
      return { error: "Cannot reach the server. Try again in a moment.", status: 502 };
    }
    if (/taken|already/i.test(msg)) return { error: msg, status: 409 };
    if (/wrong|incorrect|invalid|not found/i.test(msg)) return { error: msg, status: 401 };
    return { error: msg, status: 400 };
  }
}

export async function withSession(user: AuthUser, req: Request): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(USER_COOKIE, await signSession(user.username), sessionCookieOpts(req));
  return res;
}

// Simple in-memory attempt limiter
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
