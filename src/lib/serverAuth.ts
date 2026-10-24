// Server-only helpers: talking to the local MR AI server (Python).
// Secrets are never in code: MRAI_AUTH_TOKEN and MRAI_SERVER_URL come only from env (.env.local / Vercel).
import { timingSafeEqual } from "crypto";

// No default URL in code: only env (MRAI_SERVER_URL). When empty, requests throw an error.
export const DEFAULT_SERVER_URL = (process.env.MRAI_SERVER_URL || "").trim().replace(/\/+$/, "");
export const MRAI_AUTH_TOKEN = (process.env.MRAI_AUTH_TOKEN || "").trim();

function hostOf(u: string): string {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

// The token is only sent to allowed hosts (protection against SSRF / token theft).
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
    throw new Error("MRAI_SERVER_URL is not configured (.env.local or Vercel env)");
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
  if (!MRAI_AUTH_TOKEN) throw new Error("MRAI_AUTH_TOKEN is not configured (.env.local or Vercel env)");
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
    throw new Error(`The server response is not JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok && data && data.error) throw new Error(String(data.error));
  return data;
}
