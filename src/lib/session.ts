// Foydalanuvchi sessiyasi: imzolangan (HMAC-SHA256) cookie. Edge (proxy) va Node ikkalasida ishlaydi.
// Maxfiy kalit MRAI_AUTH_TOKEN dan olinadi (alohida sir kiritish shart emas).
import { ACCESS_COOKIE, verifyAccess } from "@/lib/access";

export const USER_COOKIE = "mrai_user";
export const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  return "mrai-session-v1:" + (process.env.MRAI_AUTH_TOKEN || "").trim();
}

async function hmacHex(data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function signSession(username: string, ttlMs = SESSION_TTL_MS): Promise<string> {
  const exp = Date.now() + ttlMs;
  const payload = `${username}:${exp}`;
  return `${payload}:${await hmacHex(payload)}`;
}

export async function verifySession(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (!(process.env.MRAI_AUTH_TOKEN || "").trim()) return null;
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  if (!USERNAME_RE.test(username)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if (!ctEqual(sig, await hmacHex(`${username}:${expStr}`))) return null;
  return username;
}

export function readCookie(header: string | null, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

// Kirish kaliti to'g'ri kiritilganmi (imzolangan muddatli cookie). Token yo'q bo'lsa: developmentda ochiq, productionda yopiq.
export async function hasAccess(req: Request): Promise<boolean> {
  if (!(process.env.MRAI_AUTH_TOKEN || "").trim()) return process.env.NODE_ENV !== "production";
  return verifyAccess(readCookie(req.headers.get("cookie"), ACCESS_COOKIE));
}

export async function sessionUserFromRequest(req: Request): Promise<string | null> {
  return verifySession(readCookie(req.headers.get("cookie"), USER_COOKIE));
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
}

// Session cookie: brauzer yopilganda o'chadi -> sayt har safar kirish kalitini qayta so'raydi.
// Secure bayrog'i so'rov haqiqatan HTTPS bo'lsagina qo'yiladi (http://IP:3000 da Secure cookie brauzer tomonidan tashlab yuboriladi).
export function sessionCookieOpts(req: Request) {
  const proto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() || new URL(req.url).protocol.replace(":", "");
  return {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax" as const,
    path: "/",
  };
}
