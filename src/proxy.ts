import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCookieValue } from "@/lib/access";
import { USER_COOKIE, verifySession } from "@/lib/session";

// Kirish tartibi (ikki bosqich):
//   1) kirish kaliti (MRAI_ACCESS_KEY) — sayt har safar so'raydi (session cookie);
//   2) kalit to'g'ri bo'lsagina ro'yxatdan o'tish yoki kirish (hisob), shundan keyin ilova.
// Istisno (ochiq): /login, /api/auth/* (har biri ichida o'zi tekshiradi) va /api/agent/run (Bearer token bilan).
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/access",
  "/api/auth/state",
  "/api/auth/register",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/agent/run",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const key = (process.env.MRAI_ACCESS_KEY || "").trim(); // /api/auth/access bilan bir xil (trim)

  if (!key) {
    // Kalit sozlanmagan: lokal developmentda ochiq, productionda yopiq (fail-closed).
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    const msg = "MRAI_ACCESS_KEY sozlanmagan. Env ga qo'shing (.env.local yoki Vercel).";
    return isApi
      ? NextResponse.json({ error: msg }, { status: 503 })
      : new NextResponse(msg, { status: 503 });
  }

  const goLogin = () => {
    if (isApi) return NextResponse.json({ error: "Kirish talab qilinadi" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (/^\/c\/[A-Za-z0-9_-]{8,64}$/.test(pathname)) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  };

  // 1-bosqich: kirish kaliti
  const access = req.cookies.get(ACCESS_COOKIE)?.value || "";
  if (!access || access !== (await accessCookieValue(key))) return goLogin();

  // 2-bosqich: hisob (imzolangan sessiya)
  const user = await verifySession(req.cookies.get(USER_COOKIE)?.value);
  if (!user) return goLogin();

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
