import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCookieValue } from "@/lib/access";

// Hamma sahifa va /api/* kirish kaliti bilan himoyalangan.
// Istisno: /login, /api/auth/login va /api/agent/run (u o'zining Bearer tokeni bilan tekshiriladi).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/agent/run"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const key = process.env.MRAI_ACCESS_KEY || "";

  if (!key) {
    // Kalit sozlanmagan: lokal developmentda ochiq, productionda yopiq (fail-closed).
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    const msg = "MRAI_ACCESS_KEY sozlanmagan. Env ga qo'shing (.env.local yoki Vercel).";
    return isApi
      ? NextResponse.json({ error: msg }, { status: 503 })
      : new NextResponse(msg, { status: 503 });
  }

  const cookie = req.cookies.get(ACCESS_COOKIE)?.value || "";
  if (cookie && cookie === (await accessCookieValue(key))) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Kirish talab qilinadi" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
