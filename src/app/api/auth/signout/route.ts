import { NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/access";
import { USER_COOKIE, SESSION_COOKIE_OPTS } from "@/lib/session";

export const dynamic = "force-dynamic";

// Chiqishda ikkala cookie ham o'chadi: keyingi kirishda kalit yana so'raladi.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_COOKIE, "", { ...SESSION_COOKIE_OPTS, maxAge: 0 });
  res.cookies.set(ACCESS_COOKIE, "", { ...SESSION_COOKIE_OPTS, maxAge: 0 });
  return res;
}
