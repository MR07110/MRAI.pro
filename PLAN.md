# MR AI — PLAN (loyiha kontrakti)

## Arxitektura
- **Web (Next.js)**: `~/Claude/work/mrai-next` — chat UI + `/api/*` route'lar.
- **Local server (Python)**: `~/MR/mrai/mrai_server.py` (systemd user: `mrai.service`, port 8080, ngrok tunnel orqali tashqariga).
  SQLite (`mrai.db`) + bwrap sandbox (`workspace/`) + scheduler + MCP connector ma'lumotlari.

## Agent rejimi (yangi)
- `POST /api/agent` — SSE (`data: {"content": "..."}` — eski `/api/chat` formati bilan bir xil), tool-loop serverda.
- `POST /api/agent/run` — bir martalik (JSON), scheduler ishlatadi. Auth: `Authorization: Bearer <server token>`.
- `POST /api/mcp/test` — connector'ni tekshirish + tool ro'yxati.
- Toollar: `computer_exec`, `computer_read_file`, `computer_write_file`, `computer_job_*`, `schedule_task`, `list_tasks`, `delete_task`, + har bir yoqilgan MCP connector toollari (`mcp_<n>_<tool>`).

## Local server endpointlari (qo'shilgan)
- `/exec` — `timeout` (<=900s), `background:true` (job id qaytaradi).
- `GET/POST/DELETE /api/db/connectors` — MCP connectorlar (`id,name,url,headers{},enabled`).
- `GET/POST/DELETE /api/db/tasks`, `POST /api/db/tasks/run`, `POST /api/db/tasks/toggle`, `GET /api/db/task-runs?task_id=`.
- `GET /api/jobs`, `GET /api/jobs/logs?id=&tail=`, `POST /api/jobs/kill`.

## Schedule formati
`every 15m|2h|1d`, `daily 09:00`, `weekdays 18:30`, `once 2026-10-25 09:00`, `cron: */5 * * * *` (mahalliy vaqt).

## Xavfsizlik (majburiy)
- **Sirlar kodda YO'Q.** `MRAI_AUTH_TOKEN` (= `~/MR/mrai/token.key`) va `MRAI_ACCESS_KEY` faqat env (`.env.local` / Vercel).
- **Brauzer serverga to'g'ridan-to'g'ri bormaydi.** Hamma narsa Next orqali: `/api/server/proxy/*` (faqat `api/db`, `api/jobs`) va `/api/server/exec`. Token faqat Next serverida qo'shiladi.
- **Kirish himoyasi:** `src/proxy.ts` — hamma sahifa va `/api/*` cookie (`/login`) talab qiladi. Istisno: `/login`, `/api/auth/login`, `/api/agent/run` (u Bearer token bilan). `MRAI_ACCESS_KEY` yo'q bo'lsa productionda 503 (fail-closed).
- **SSRF himoyasi:** `x-server-url` faqat ruxsat etilgan hostlar (`MRAI_SERVER_URL` hosti, localhost:8080, `MRAI_ALLOWED_HOSTS`); boshqasi e'tiborsiz, default ishlatiladi.
- Python server tokensiz hech narsa bermaydi (token.key bo'lmasa avtomatik yaratiladi).
