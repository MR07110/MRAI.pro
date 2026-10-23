// Faqat bitta asbob: Bash. Fayl o'qish/yozish/qidirish ham bash orqali (cat, ls, find, sed...).
import type { ToolDef } from "@/lib/agentTools";

export interface CodingCtx {
  exec: (command: string, timeoutSec?: number, cwd?: string, background?: boolean) => Promise<any>;
  sf: (path: string, body?: any, method?: string, timeoutMs?: number) => Promise<any>;
}

const BASH_LIMIT = 30000;

function clip(s: string, limit = BASH_LIMIT): string {
  if (s.length <= limit) return s;
  const head = Math.floor(limit * 0.6);
  return `${s.slice(0, head)}\n...[${s.length - limit} chars truncated]...\n${s.slice(-(limit - head))}`;
}

const fail = (output: string) => ({ output, isError: true });
const ok = (output: string) => ({ output });

export function buildCodingTools(ctx: CodingCtx): ToolDef[] {
  let cwd: string | undefined;

  return [
    {
      name: "Bash",
      label: "Bash",
      description:
        "Foydalanuvchining HAQIQIY Linux kompyuterida bash buyruq bajaradi (sandbox yo'q). Standart papka ~/MR/mrai; cwd chaqiruvlar orasida saqlanadi. Fayl o'qish: cat/sed/head; ro'yxat: ls; qidirish: find/rg/grep; yozish: cat > / tee / sed -i. Timeout default 120s (max 600). Uzoq jarayon (dev server) uchun run_in_background=true.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Bajariladigan bash buyruq" },
          timeout: { type: "number", description: "Timeout ms (default 120000, max 600000)" },
          run_in_background: { type: "boolean", description: "Fon rejimida ishga tushirish" },
        },
        required: ["command"],
      },
      async run(args) {
        const command = String(args.command ?? "").trim();
        if (!command) return fail("command bo'sh");
        const timeoutMs = Math.min(Math.max(Number(args.timeout) || 120000, 1000), 600000);
        const timeoutSec = Math.ceil(timeoutMs / 1000);
        const background = !!args.run_in_background;
        try {
          const r = await ctx.exec(command, timeoutSec, cwd, background);
          // cwd yangilash: cd buyruqlari
          if (typeof r?.cwd === "string" && r.cwd) cwd = r.cwd;
          if (background || r.job_id) {
            return ok(`Background shell started. bash_id=${r.job_id || r.id || "?"}. Output keyin Bash orqali kuzating yoki job_id ni saqlang.`);
          }
          const out = [r.stdout, r.stderr].filter(Boolean).join("\n");
          const code = r.exit_code ?? r.code ?? 0;
          if (code !== 0) return fail(clip(`exit ${code}\n${out || "(no output)"}`));
          return ok(clip(out || "(empty)"));
        } catch (e: any) {
          return fail(e?.message || String(e));
        }
      },
    },
  ];
}
