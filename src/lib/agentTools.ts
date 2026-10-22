// Agent asboblari: kompyuter (local Python server), fayllar, fon jarayonlar, scheduler.
import { serverFetch } from "@/lib/serverAuth";

export interface ToolDef {
  name: string; // provayderga ketadigan nom
  label: string; // UI uchun
  description: string;
  parameters: Record<string, any>;
  readOnly?: boolean; // true: holatni o'zgartirmaydi (Read/Glob/Grep/LS/BashOutput)
  run: (args: any) => Promise<{ output: string; isError?: boolean }>;
}

export interface ToolEnv {
  serverUrl?: string;
  appUrl?: string;
  keyId?: string;
  signal?: AbortSignal;
  allowScheduling: boolean;
}

const OUT_LIMIT = 12000;

function clip(s: string, limit = OUT_LIMIT): string {
  if (s.length <= limit) return s;
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return `${s.slice(0, head)}\n...[${s.length - limit} belgi qisqartirildi]...\n${s.slice(-tail)}`;
}

function shq(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function fmtExec(r: any): { output: string; isError: boolean } {
  const out = [`exit=${r.exit_code}`];
  if (r.stdout) out.push(String(r.stdout));
  if (r.stderr) out.push(`[stderr]\n${r.stderr}`);
  return { output: clip(out.join("\n")), isError: r.exit_code !== 0 };
}

// Local Python serverga so'rov yuboruvchi umumiy yordamchilar (builtin va coding asboblari bir xil kanaldan foydalanadi)
export function makeServerCtx(env: ToolEnv) {
  const sf = (path: string, body?: any, method?: string, timeoutMs?: number) =>
    serverFetch(env.serverUrl, path, { body, method, timeoutMs, signal: env.signal });
  const exec = (command: string, timeout = 60, cwd?: string, background = false) =>
    sf("/exec", { command, cwd, timeout, background }, "POST", (timeout + 20) * 1000);
  return { sf, exec };
}

export function buildBuiltinTools(env: ToolEnv): ToolDef[] {
  const { sf, exec: execRaw } = makeServerCtx(env);

  const tools: ToolDef[] = [
    {
      name: "computer_exec",
      label: "Kompyuter",
      description:
        "Foydalanuvchining Linux sandbox kompyuterida bash buyrug'ini bajaradi (workspace papkasida, fayllar saqlanib qoladi). Ko'p qatorli skriptlar mumkin. Uzoq ishlaydigan jarayonlar (dev server, build, kuzatuvchi) uchun background=true bering va computer_job_logs bilan kuzating.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "bash buyrug'i/skripti" },
          cwd: { type: "string", description: "ish papkasi (workspace ichida), ixtiyoriy" },
          timeout: { type: "number", description: "soniyalarda, standart 60, maksimum 600" },
          background: { type: "boolean", description: "fon jarayon sifatida ishga tushirish (job_id qaytaradi)" },
        },
        required: ["command"],
      },
      run: async (a) => {
        const t = Math.min(Math.max(Number(a.timeout) || 60, 1), 600);
        return fmtExec(await execRaw(String(a.command || ""), t, a.cwd, !!a.background));
      },
    },
    {
      name: "computer_read_file",
      label: "Fayl o'qish",
      description: "Sandbox ichidagi fayl matnini o'qiydi (standart 20000 bayt, maksimum 100000).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, max_bytes: { type: "number" } },
        required: ["path"],
      },
      run: async (a) => {
        const n = Math.min(Math.max(Number(a.max_bytes) || 20000, 1), 100000);
        return fmtExec(await execRaw(`head -c ${n} -- ${shq(a.path)}`, 30));
      },
    },
    {
      name: "computer_write_file",
      label: "Fayl yozish",
      description: "Sandbox ichida fayl yaratadi/ustidan yozadi (papkalar avtomatik yaratiladi). append=true bo'lsa oxiriga qo'shadi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" }, append: { type: "boolean" } },
        required: ["path", "content"],
      },
      run: async (a) => {
        const b64 = Buffer.from(String(a.content ?? ""), "utf8").toString("base64");
        const CH = 90000; // 4 ga karrali
        let mode = a.append ? ">>" : ">";
        let last: any = await execRaw(`mkdir -p "$(dirname -- ${shq(a.path)})"`, 30);
        for (let i = 0; i < Math.max(b64.length, 1); i += CH) {
          last = await execRaw(`printf %s ${shq(b64.slice(i, i + CH))} | base64 -d ${mode} ${shq(a.path)}`, 60);
          if (last.exit_code !== 0) return fmtExec(last);
          mode = ">>";
        }
        return { output: `yozildi: ${a.path} (${Buffer.byteLength(String(a.content ?? ""))} bayt)` };
      },
    },
    {
      name: "computer_job_logs",
      label: "Fon jarayon logi",
      description: "Fon jarayon (job_id) holati va oxirgi log qatorlarini qaytaradi.",
      parameters: {
        type: "object",
        properties: { job_id: { type: "string" }, tail: { type: "number", description: "oxirgi qatorlar soni, standart 80" } },
        required: ["job_id"],
      },
      run: async (a) => {
        const r = await sf(`/api/jobs/logs?id=${encodeURIComponent(a.job_id)}&tail=${Number(a.tail) || 80}`);
        if (r.error) return { output: r.error, isError: true };
        return { output: clip(`running=${r.running} exit=${r.exit_code}\n${r.output || ""}`) };
      },
    },
    {
      name: "computer_job_kill",
      label: "Fon jarayonni to'xtatish",
      description: "Fon jarayonni (job_id) to'xtatadi.",
      parameters: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
      run: async (a) => {
        const r = await sf("/api/jobs/kill", { id: a.job_id });
        return r.error ? { output: r.error, isError: true } : { output: "to'xtatildi" };
      },
    },
    {
      name: "list_tasks",
      label: "Vazifalar ro'yxati",
      description: "Rejalashtirilgan vazifalarni (scheduled tasks) ko'rsatadi.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const rows = await sf("/api/db/tasks");
        if (!Array.isArray(rows)) return { output: JSON.stringify(rows), isError: true };
        if (!rows.length) return { output: "Vazifalar yo'q" };
        return {
          output: rows
            .map((t: any) => `${t.id} | ${t.name} | ${t.kind} | ${t.schedule} | ${t.enabled ? "yoqilgan" : "o'chiq"} | keyingi: ${t.next_run ? new Date(t.next_run * 1000).toISOString() : "-"} | oxirgi: ${t.last_status || "-"}`)
            .join("\n"),
        };
      },
    },
    {
      name: "delete_task",
      label: "Vazifani o'chirish",
      description: "Rejalashtirilgan vazifani id bo'yicha o'chiradi.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      run: async (a) => {
        const r = await sf(`/api/db/tasks?id=${encodeURIComponent(a.id)}`, undefined, "DELETE");
        return r.error ? { output: r.error, isError: true } : { output: "o'chirildi" };
      },
    },
  ];

  if (env.allowScheduling) {
    tools.push({
      name: "schedule_task",
      label: "Vazifa rejalash",
      description:
        "Vazifani jadval bo'yicha avtomatik bajarishga qo'yadi (local server 24/7 ishlaydi). schedule formatlari: 'every 15m' | 'every 2h' | 'daily 09:00' | 'weekdays 18:30' | 'once 2026-10-25 09:00' | 'cron: */5 * * * *' (server mahalliy vaqti). kind='ai': har safar agent prompt'ni asboblar bilan bajaradi; kind='shell': oddiy buyruq.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["ai", "shell"] },
          schedule: { type: "string" },
          prompt: { type: "string", description: "kind=ai uchun: to'liq, o'zi-o'zini tushuntiradigan ko'rsatma" },
          command: { type: "string", description: "kind=shell uchun bash buyrug'i" },
        },
        required: ["name", "kind", "schedule"],
      },
      run: async (a) => {
        const r = await sf("/api/db/tasks", {
          name: a.name, kind: a.kind, schedule: a.schedule, prompt: a.prompt || "", command: a.command || "",
          app_url: env.appUrl || "", server_url: env.serverUrl || "", key_id: env.keyId || "",
        });
        if (r.error) return { output: r.error, isError: true };
        return { output: `vazifa yaratildi (id=${r.id}). Keyingi ishga tushish: ${r.next_run ? new Date(r.next_run * 1000).toString() : "-"}` };
      },
    });
  }
  return tools;
}
