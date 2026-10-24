// A single tool: Bash. Reading, writing and searching files also go through bash (cat, ls, find, sed...).
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
        "Runs a bash command on the user's REAL Linux computer (no sandbox). Default folder ~/MR/mrai/work; the working directory is kept between calls. Read files: cat/sed/head; list: ls; search: find/rg/grep; write: cat > / tee / sed -i. Default timeout 120s (max 600). Use run_in_background=true for long processes (dev server).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to run" },
          timeout: { type: "number", description: "Timeout ms (default 120000, max 600000)" },
          run_in_background: { type: "boolean", description: "Run in the background" },
        },
        required: ["command"],
      },
      async run(args) {
        const command = String(args.command ?? "").trim();
        if (!command) return fail("command is empty");
        const timeoutMs = Math.min(Math.max(Number(args.timeout) || 120000, 1000), 600000);
        const timeoutSec = Math.ceil(timeoutMs / 1000);
        const background = !!args.run_in_background;
        try {
          const r = await ctx.exec(command, timeoutSec, cwd, background);
          // update cwd from cd commands
          if (typeof r?.cwd === "string" && r.cwd) cwd = r.cwd;
          if (background || r.job_id) {
            return ok(`Background shell started. bash_id=${r.job_id || r.id || "?"}. Follow its output later through Bash, or keep the job_id.`);
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
