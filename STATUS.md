# AI Context — mrai-next

## Oxirgi holat
- Sana: 2026-10-23
- Nima qilindi:
  - Settings qayta ishlandi: API kalit bo'limi endi `KeysManager` (ro'yxat + `KeyEditor`). Kalit joylanadi -> provayder o'zi aniqlanadi -> kalit tekshiriladi -> modellar chiqadi (`ModelList`). Eski katta forma va katalog `SettingsModal` dan olib tashlandi (1176 -> ~350 qator).
  - Chat kiritish joyi tagidagi chip va sarlavhadagi model tugmasi `QuickModel` ni ochadi: Sozlamalarga kirmasdan model/kalitni almashtirish, o'zgartirish, qo'shish.
  - `ToolDef` ga `readOnly?: boolean` qo'shildi (tsc xatolari tuzaldi).
  - `src/lib/codingTools.ts` (Claude Code uslubidagi asboblar: Bash, Read, Write, Edit, MultiEdit, Glob, Grep, LS, TodoWrite, BashOutput, KillShell) `agent.ts` ga ulandi.
  - `agentTools.ts` ga `makeServerCtx(env)` chiqarildi (exec/sf yordamchilari builtin va coding asboblari uchun umumiy).
  - Eski `computer_exec/read_file/write_file/job_logs/job_kill` agentdan olib tashlandi (coding asboblari to'liq almashtiradi); `list_tasks/delete_task/schedule_task` va `mcp_*` saqlandi. Nom takrorlanishi yo'qligi `seen` Set bilan kafolatlanadi.
  - `agentRules` (system prompt) yangi asboblarga moslandi; `brief()` Bash/Write/Edit/MultiEdit ni ko'rsatadi.
  - Jonli test (haqiqiy sandbox server, 127.0.0.1:8080): 33 + 26 senariy, hammasi PASS. `tsc --noEmit` va `next build` xatosiz.
  - End-to-end: `/api/agent/run` orqali mock OpenAI-compat server (10 qadamli zanjir) va haqiqiy Groq `openai/gpt-oss-120b` (5 qadam: Write, Grep, Read, Edit, Bash) — ikkalasi OK.
  - Haqiqiy model `-i` o'rniga `i` yuborib Grep ni xato ishlatdi -> Grep parametrlari `case_insensitive/line_numbers/after/before/context` ga o'tkazildi (eski `-i/-A/-B/-C` va qisqa `i/A/B/C` ham qabul qilinadi).
  - `openaiAdapter` da 429 (TPM) uchun "try again in N s" bo'yicha qayta urinish (<=30s, 4 martagacha, abort-safe) qo'shildi.
  - Test paytida topilgan va tuzatilgan xatolar: (1) Glob hech narsa topmasdi; (2) `cd ...` bilan boshlangan background buyruq jim yutilardi; (3) BashOutput/KillShell noma'lum id da throw qilardi.
- Hozirgi muammo/blocker: yo'q. (Test paytida bir marta ngrok uzildi — ERR_NGROK_3200 — o'z-o'zidan tiklandi.)
- Keyingi qadam:
  - Anthropic adapteri va brauzerdan `/api/agent` (SSE, cookie auth) yo'li hali haqiqiy kalit bilan sinalmagan.
  - Groq standart modeli `llama-3.3-70b-versatile` (providers.ts) bu akkauntda 404 beradi — modelni yangilash kerak (ishlaydi: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`).
  - Prompt+asboblar ~2.5k token/qadam: Groq bepul tarifida (8000 TPM) 429 ga olib keladi (retry bilan hal bo'ladi, lekin sekin). Kerak bo'lsa tavsiflarni/system promptni qisqartirish.
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

## Hisoblar, suhbat manzillari va izolyatsiya (2026-10-23)
- Kirish tartibi: **kirish kaliti (har safar, session cookie)** -> faqat kalit to'g'ri bo'lsa **ro'yxatdan o'tish / kirish** -> ilova. `src/proxy.ts` ikkala cookie'ni talab qiladi (`mrai_access`, `mrai_user` imzolangan HMAC, 24 soat).
- Hisoblar Python serverda (`users` jadvali, scrypt). Next route'lar: `/api/auth/{access,state,register,signin,signout,profile}`. Login sahifa 2 bosqichli (`/login`, `?next=/c/<id>` qo'llab-quvvatlanadi).
- Har suhbatning manzili: `/c/<id>` (`src/app/c/[id]/page.tsx`, `AppShell`, ChatApp `pushUrl` + `usePathname`). Suhbat shu hisobniki bo'lmasa — "topilmadi" xabari va `/` ga qaytish.
- Izolyatsiya (Python server, `x-mrai-user` faqat Next proxy qo'shadi, token bilan): `chats/messages/api_keys/connectors/tasks` — `user_id` ustuni, hamma so'rov scoping; har foydalanuvchiga alohida sandbox (`workspace/users/<user>` bwrap'da `WORKSPACE_DIR` ga bind), jobs egasiga bog'liq; scheduler vazifa egasining kalit/connectorlari bilan ishlaydi (`/api/agent/run` ga `user` yuboriladi).
- Egasi: `mrqosimov2011` — ro'yxatdan o'tkazib bo'lmaydi (egallab olishdan himoya); hisob serverda yaratilgan, vaqtinchalik parol `~/MR/mrai/owner-temp-password.txt` (600) — kirgach Sozlamalar -> Hisob'dan almashtirib, faylni o'chirish kerak. Eski ma'lumotlar shu hisobda.
- Sinov: `scripts/isolation-test.py` (32 ta tekshiruv, ikki vaqtinchalik hisob, oxirida o'zini tozalaydi) — 32/32 PASS.
- Zaxira: `*.bak-20261023-pre-auth|pre-urls`, Python: `mrai_server.py.bak-20261023-pre-users|pre-isolation`, `mrai_tasks.py.bak-20261023-pre-users`.

## 2026-10-23 (kech): serverda ishlaydigan agent, sandbox'siz, avto-ishga tushish
- Sandbox olib tashlandi: buyruqlar egasining haqiqiy kompyuterida (`~/MR/mrai` standart papka), faqat egasi hisobi uchun (`EXEC_ALLOWED`). Agent promptlari shunga moslandi.
- Agent ishi brauzerga bog'liq emas: `src/lib/runs.ts` (run manager), `/api/agent` (boshlash), `/api/agent/attach` (qayta ulanish), `/api/agent/stop`. Sahifa yangilansa ham davom etadi; provayder limiti kutishi (`[[wait:<ms>]]`) ham serverda.
- Faqat agent rejimi: oddiy `/api/chat` hamon brauzerga bog'liq. Web servis qayta ishga tushsa, ketayotgan ish to'xtaydi (oxirgi saqlangan qism bazada qoladi).
- Yon paneldagi "MR AI" -> `/`.
- Avto-ishga tushish: `deploy/install.sh` (systemd user + linger), boshqaruv: `mrai start|stop|restart|status|logs`.

## 2026-10-23: Usage (token sarfi)
- Sozlamalar -> **Usage** tabi (`src/components/UsagePanel.tsx`): davr tanlash (7/30/90 kun), jami token + kirish/chiqish progress, Bugun/7 kun/30 kun/Jami, kunlar bo'yicha ustunli grafik, modellar va manbalar (chat/agent/vazifa) bo'yicha progress, oxirgi so'rovlar. 15s da avtomatik yangilanadi.
- Yozish: Python serverda `usage` jadvali (user_id bo'yicha izolyatsiya), `POST/GET /api/db/usage` (`mrai_server.py`, `usage_summary`). Next tomonda `src/lib/usage.ts` (`recordUsage`, fire-and-forget).
- Yozuv manbalari: agent (`agent.ts`, har qadam, `source=agent|task`) va oddiy chat (`/api/chat`, stream ham). Provayder usage qaytarmasa — belgilar/4 bo'yicha taxminiy (`estimated=1`, UI da "≈").
- Oddiy chat streamida `stream_options.include_usage` faqat openai/groq/openrouter/deepseek/xai/together ga yuboriladi (boshqalarda noma'lum maydon xato berishi mumkin).
- Tarix faqat shu paytdan boshlab yoziladi (eski so'rovlar yo'q).

---
### 2026-10-24 02:46
- Qilindi: skills/ .gitignore ga qo'shildi va git indeksidan chiqarildi (lokal commit ded6836, push qilinmagan; diskdagi 27 skill papka joyida). origin/main da hali 543 skill fayl bor.
- Keyingi qadam: MR dan push va tarixdan tozalash uchun ruxsat kutiladi
- Git holati: ded6836 chore: skills/ git dan chiqarildi (faqat lokal diskda qoladi, fayllar o'chirilmadi)

---
### 2026-10-24 03:15
- Qilindi: ToolStep — yangi Bash ishga tushganda tool list reset bo'lib qayta chiqish muammosi tuzatildi (stream paytida list yashirilmasin; key barqaror).
