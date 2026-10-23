// Token sarfi: har bir model chaqiruvi lokal Python serverdagi `usage` jadvaliga yoziladi
// (Sozlamalar -> Usage shu yerdan o'qiydi). Yozish "yoq-yo'qolgan"dan afzal: xato bo'lsa suhbatni to'xtatmaydi.
import { serverFetch } from "@/lib/serverAuth";

export interface UsageRecord {
  provider: string;
  model: string;
  keyId?: string;
  source: "chat" | "agent" | "task";
  chatId?: string;
  input: number;
  output: number;
  /** Provayder usage qaytarmagan: belgilar/4 bo'yicha taxminiy hisob */
  estimated?: boolean;
}

/** ~4 belgi = 1 token (provayder usage bermaganda taxminiy hisob uchun) */
export function estTok(chars: number): number {
  return Math.max(0, Math.ceil((chars || 0) / 4));
}

export function recordUsage(user: string | undefined | null, serverUrl: string | undefined, r: UsageRecord): void {
  if (!user) return;
  const input = Math.max(0, Math.round(r.input || 0));
  const output = Math.max(0, Math.round(r.output || 0));
  if (!input && !output) return;
  serverFetch(serverUrl, "/api/db/usage", {
    user,
    timeoutMs: 8000,
    body: {
      ts: Date.now() / 1000,
      provider: r.provider,
      model: r.model,
      key_id: r.keyId || "",
      source: r.source,
      chat_id: r.chatId || "",
      input,
      output,
      estimated: !!r.estimated,
    },
  }).catch((e) => console.error("[usage] yozilmadi:", e?.message || e));
}
