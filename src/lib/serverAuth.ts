// Server-only helpers: local MR AI server (Python) bilan aloqa.
// Sirlar KODDA saqlanmaydi: MRAI_AUTH_TOKEN va MRAI_SERVER_URL faqat env (.env.local / Vercel) orqali.
import { timingSafeEqual } from "crypto";

// Standart manzil KODDA YO'Q: faqat env (MRAI_SERVER_URL). Bo'sh bo'lsa, so'rov paytida xato beriladi.
export const DEFAULT_SERVER_URL = (process.env.MRAI_SERVER_URL || "").trim().replace(/\/+$/, "");
export const MRAI_AUTH_TOKEN = (process.env.MRAI_AUTH_TOKEN || "").trim();

function hostOf(u: string): string {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

// Token faqat ruxsat etilgan hostlarga yuboriladi (SSRF / token o'g'irlashdan himoya).
const ALLOWED_HOSTS = new Set<string>(
  [
    hostOf(DEFAULT_SERVER_URL),
    "localhost:8080",
    "127.0.0.1:8080",
    ...(process.env.MRAI_ALLOWED_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()),
  ].filter(Boolean)
);

export function cleanServerUrl(u?: string | null): string {
  const c = (u || "").trim().replace(/\/+$/, "");
  if (c && /^https?:\/\//i.test(c) && ALLOWED_HOSTS.has(hostOf(c))) return c;
  if (!DEFAULT_SERVER_URL) {
    throw new Error("MRAI_SERVER_URL sozlanmagan (.env.local yoki Vercel env)");
  }
  return DEFAULT_SERVER_URL;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAuthorized(req: Request): boolean {
  if (!MRAI_AUTH_TOKEN) return false;
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") && safeEqual(h.slice(7).trim(), MRAI_AUTH_TOKEN);
}

export async function serverFetch(
  serverUrl: string | undefined,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal; user?: string } = {}
): Promise<any> {
  if (!MRAI_AUTH_TOKEN) throw new Error("MRAI_AUTH_TOKEN sozlanmagan (.env.local yoki Vercel env)");
  const url = cleanServerUrl(serverUrl) + path;
  const signals = [AbortSignal.timeout(init.timeoutMs ?? 30000)];
  if (init.signal) signals.push(init.signal);
  const res = await fetch(url, {
    method: init.method || (init.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
      Authorization: `Bearer ${MRAI_AUTH_TOKEN}`,
      ...(init.user ? { "x-mrai-user": init.user } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.any(signals),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Server javobi JSON emas (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok && data && data.error) throw new Error(String(data.error));
  return data;
}
