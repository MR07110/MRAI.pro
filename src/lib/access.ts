// Kirish himoyasi: kirish kaliti FAQAT lokal serverda (~/MR/mrai/access.key) saqlanadi.
// To'g'ri kalit kiritilgach, Next MRAI_AUTH_TOKEN bilan imzolangan muddatli cookie beradi. Edge va Node ikkalasida ishlaydi.
export const ACCESS_COOKIE = "mrai_access";
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

async function hmacHex(data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("mrai-access-v2:" + (process.env.MRAI_AUTH_TOKEN || "").trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
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

export async function signAccess(ttlMs = ACCESS_TTL_MS): Promise<string> {
  const exp = String(Date.now() + ttlMs);
  return `${exp}.${await hmacHex("access:" + exp)}`;
}

export async function verifyAccess(value?: string | null): Promise<boolean> {
  if (!value || !(process.env.MRAI_AUTH_TOKEN || "").trim()) return false;
  const i = value.indexOf(".");
  if (i < 1) return false;
  const expStr = value.slice(0, i);
  const sig = value.slice(i + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return ctEqual(sig, await hmacHex("access:" + expStr));
}
