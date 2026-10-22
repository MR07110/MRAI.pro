# AI Context — mrai-next

## Oxirgi holat
- Sana: 2026-10-23
- Nima qilindi:
  - `ToolDef` ga `readOnly?: boolean` qo'shildi (tsc xatolari tuzaldi).
  - `src/lib/codingTools.ts` (Claude Code uslubidagi asboblar: Bash, Read, Write, Edit, MultiEdit, Glob, Grep, LS, TodoWrite, BashOutput, KillShell) `agent.ts` ga ulandi.
  - `agentTools.ts` ga `makeServerCtx(env)` chiqarildi (exec/sf yordamchilari builtin va coding asboblari uchun umumiy).
  - Eski `computer_exec/read_file/write_file/job_logs/job_kill` agentdan olib tashlandi (coding asboblari to'liq almashtiradi); `list_tasks/delete_task/schedule_task` va `mcp_*` saqlandi. Nom takrorlanishi yo'qligi `seen` Set bilan kafolatlanadi.
  - `agentRules` (system prompt) yangi asboblarga moslandi; `brief()` Bash/Write/Edit/MultiEdit ni ko'rsatadi.
  - Jonli test (haqiqiy sandbox server, 127.0.0.1:8080): 33 + 26 senariy, hammasi PASS. `tsc --noEmit` va `next build` xatosiz.
  - Test paytida topilgan va tuzatilgan xatolar: (1) Glob hech narsa topmasdi; (2) `cd ...` bilan boshlangan background buyruq jim yutilardi; (3) BashOutput/KillShell noma'lum id da throw qilardi.
- Hozirgi muammo/blocker: yo'q. (Test paytida bir marta ngrok uzildi — ERR_NGROK_3200 — o'z-o'zidan tiklandi.)
- Keyingi qadam:
  - Haqiqiy LLM (Anthropic/OpenAI-compat) bilan `/api/agent` orqali end-to-end tekshirish. Grep parametrlari `-i/-n/-A/-B/-C` kalitlari ba'zi OpenAI-compat providerlarda (Groq) schema validatsiyasidan o'tmasligi mumkin — kerak bo'lsa `case_insensitive`, `after` kabi nomlarga o'tkazish.
  - `readOnly` bayrog'i hozircha metadata: kelajakda read-only asboblarni parallel bajarish uchun ishlatish mumkin.
  - Glob `*.ts` rg semantikasi bo'yicha ichki papkalarni ham qaytaradi (faqat yuqori daraja emas).

## Muhim fayllar
- `src/lib/agent.ts` — agent sikli, tool yig'ish (coding + builtin + mcp), `agentRules` system prompt
- `src/lib/agentTools.ts` — `ToolDef`, `makeServerCtx`, `buildBuiltinTools` (list/delete/schedule_task)
- `src/lib/codingTools.ts` — Claude Code uslubidagi 11 ta asbob (`buildCodingTools`)
- `src/lib/serverAuth.ts` — local Python serverga autentifikatsiyalangan so'rov
- `~/MR/mrai/mrai_server.py` — bwrap sandbox `/exec`; `mrai_tasks.py` — jobs/tasks

## Eslatmalar (arxitektura, qarorlar, "buni qilma" kabi)
- Server `/exec` "cd " bilan BOSHLANGAN har qanday buyruqni o'zi yutadi (faqat cwd o'zgartiradi, bajarmaydi) — hatto background=true bilan ham. Yangi asboblarda buyruqni `{ ...\n}` ichiga o'rang yoki `cd` dan oldin boshqa narsa qo'ying (Bash va background shunday qilingan).
- Bash cwd chaqiruvlar orasida `<<MRAI_PWD:...>>` markeri orqali saqlanadi (stderr oxirida).
- Edit/Write: "Read before edit" va mtime bo'yicha stale tekshiruvi `reads` Map orqali (har `runAgent` uchun alohida).
- Zaxira nusxalar (`*.bak-*`) commit qilinmaydi.
