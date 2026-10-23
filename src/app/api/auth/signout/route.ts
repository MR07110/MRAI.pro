import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/access";
import { USER_COOKIE, sessionCookieOpts } from "@/lib/session";

export const dynamic = "force-dynamic";

// Chiqishda ikkala cookie ham o'chadi: keyingi kirishda kalit yana so'raladi.
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const opts = sessionCookieOpts(req);
  res.cookies.set(USER_COOKIE, "", { ...opts, maxAge: 0 });
  res.cookies.set(ACCESS_COOKIE, "", { ...opts, maxAge: 0 });
  return res;
}
