// Token spend: every model call is written to the `usage` table on the local Python server
// (Settings -> Usage reads from here). Best-effort: a write error never interrupts the chat.
import { serverFetch } from "@/lib/serverAuth";

export interface UsageRecord {
  provider: string;
  model: string;
  keyId?: string;
  source: "chat" | "agent" | "task";
  chatId?: string;
  input: number;
  output: number;
  /** The provider returned no usage: rough estimate from characters/4 */
  estimated?: boolean;
}

/** ~4 characters = 1 token (rough estimate when the provider gives no usage) */
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
