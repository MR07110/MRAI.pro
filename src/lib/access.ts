// Kirish himoyasi: MRAI_ACCESS_KEY (env) bilan cookie. Edge va Node ikkalasida ishlaydi.
export const ACCESS_COOKIE = "mrai_access";

export async function accessCookieValue(key: string): Promise<string> {
  const data = new TextEncoder().encode("mrai-access-v1:" + key);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
