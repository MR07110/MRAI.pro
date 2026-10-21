// Minimal MCP client (server-side): Streamable HTTP + eski SSE transport fallback.
export interface McpConnector {
  id?: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

const PROTOCOL = "2025-06-18";
const RESULT_CAP = 20000;

type Rpc = { jsonrpc: "2.0"; id?: number; result?: any; error?: { code: number; message: string } };

export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL noto'g'ri");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Faqat http(s) URL");
  if (/^(169\.254\.|metadata\.google\.internal)/.test(u.hostname)) throw new Error("Bu manzilga ruxsat yo'q");
  return u;
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let m: RegExpExecArray | null;
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const raw = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        let event = "message";
        const data: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export class McpClient {
  private sessionId?: string;
  private nextId = 1;
  private mode: "http" | "sse" = "http";
  private ssePost?: string;
  private sseAbort?: AbortController;
  private pending = new Map<number, { resolve: (m: Rpc) => void; reject: (e: Error) => void }>();

  constructor(private conn: McpConnector, private timeoutMs = 60000) {
    assertSafeUrl(conn.url);
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      ...(this.conn.headers || {}),
    };
  }

  private async httpRpc(method: string, params: any, notify = false): Promise<any> {
    const id = notify ? undefined : this.nextId++;
    const res = await fetch(this.conn.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (notify) {
      await res.arrayBuffer().catch(() => {});
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const ct = res.headers.get("content-type") || "";
    let msg: Rpc | undefined;
    if (ct.includes("text/event-stream") && res.body) {
      for await (const ev of sseEvents(res.body)) {
        try {
          const j = JSON.parse(ev.data);
          if (j && j.id === id) {
            msg = j;
            break;
          }
        } catch {}
      }
    } else {
      const j = await res.json();
      msg = Array.isArray(j) ? j.find((m: Rpc) => m.id === id) : j;
    }
    if (!msg) throw new Error("MCP javobi topilmadi");
    if (msg.error) throw new Error(msg.error.message || "MCP xatosi");
    return msg.result;
  }

  private async connectSse(): Promise<void> {
    this.sseAbort = new AbortController();
    const res = await fetch(this.conn.url, {
      headers: { Accept: "text/event-stream", ...(this.conn.headers || {}) },
      signal: this.sseAbort.signal,
    });
    if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
    const events = sseEvents(res.body);
    const endpoint = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SSE endpoint kelmadi")), 15000);
      (async () => {
        try {
          for await (const ev of events) {
            if (ev.event === "endpoint") {
              clearTimeout(timer);
              resolve(ev.data.trim());
            } else if (ev.event === "message") {
              try {
                const j: Rpc = JSON.parse(ev.data);
                if (j.id !== undefined) this.pending.get(j.id)?.resolve(j);
              } catch {}
            }
          }
          clearTimeout(timer);
          reject(new Error("SSE oqimi yopildi"));
        } catch (e: any) {
          clearTimeout(timer);
          reject(e);
        }
      })();
    });
    this.ssePost = new URL(endpoint, this.conn.url).toString();
    this.mode = "sse";
  }

  private async sseRpc(method: string, params: any, notify = false): Promise<any> {
    const id = notify ? undefined : this.nextId++;
    let wait: Promise<Rpc> | undefined;
    if (id !== undefined) {
      wait = new Promise<Rpc>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("MCP javob vaqti tugadi")), this.timeoutMs);
        this.pending.set(id, {
          resolve: (m) => {
            clearTimeout(t);
            resolve(m);
          },
          reject,
        });
      });
    }
    const res = await fetch(this.ssePost!, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.conn.headers || {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.arrayBuffer().catch(() => {});
    if (!wait) return null;
    const msg = await wait;
    if (msg.error) throw new Error(msg.error.message || "MCP xatosi");
    return msg.result;
  }

  private rpc(method: string, params: any, notify = false) {
    return this.mode === "sse" ? this.sseRpc(method, params, notify) : this.httpRpc(method, params, notify);
  }

  async connect(): Promise<void> {
    const init = { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "mrai", version: "1.0" } };
    try {
      await this.httpRpc("initialize", init);
      await this.httpRpc("notifications/initialized", {}, true);
    } catch (e: any) {
      const legacy = /\/sse\/?(\?|$)/.test(this.conn.url) || /HTTP (400|404|405)/.test(String(e?.message));
      if (!legacy) throw e;
      await this.connectSse();
      await this.rpc("initialize", init);
      await this.rpc("notifications/initialized", {}, true);
    }
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await this.rpc("tools/list", cursor ? { cursor } : {});
      tools.push(...(r?.tools || []));
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, any>): Promise<{ text: string; isError: boolean }> {
    const r = await this.rpc("tools/call", { name, arguments: args || {} });
    const parts: string[] = [];
    for (const c of r?.content || []) {
      if (c.type === "text") parts.push(c.text);
      else if (c.type === "image") parts.push(`[rasm: ${c.mimeType || "image"}]`);
      else if (c.type === "resource") parts.push(c.resource?.text || JSON.stringify(c.resource).slice(0, 2000));
      else parts.push(JSON.stringify(c).slice(0, 2000));
    }
    if (!parts.length && r?.structuredContent) parts.push(JSON.stringify(r.structuredContent));
    let text = parts.join("\n");
    if (text.length > RESULT_CAP) text = text.slice(0, RESULT_CAP) + `\n...[${text.length - RESULT_CAP} belgi qisqartirildi]`;
    return { text: text || "(bo'sh natija)", isError: !!r?.isError };
  }

  async close(): Promise<void> {
    this.sseAbort?.abort();
    if (this.mode === "http" && this.sessionId) {
      fetch(this.conn.url, { method: "DELETE", headers: this.headers(), signal: AbortSignal.timeout(3000) }).catch(() => {});
    }
  }
}
