# MR AI Pro

AI chat ilovasi: foydalanuvchining o'z API kalitlari bilan ishlaydi. Barcha ma'lumotlar (hisoblar, suhbatlar,
kalitlar, vazifalar) **faqat o'z serveringizda** (Python + SQLite, `~/MR/mrai`) saqlanadi. Tashqi baza (Supabase) yo'q.

## Imkoniyatlar

- Kirish kaliti + hisoblar (ro'yxatdan o'tish / kirish), har foydalanuvchi ma'lumoti alohida; kompyuterda buyruq bajarish faqat egasi uchun (sandbox yo'q, haqiqiy kompyuterda)
- **Sozlamalar → API kalitlar**: istalgan provayder (Groq, OpenAI, OpenRouter, Anthropic, Custom)
- Streaming javoblar, suhbatlar tarixi (`/c/<id>` manzili)
- Agent asboblari (Bash, Read, Write, Edit, Grep...), MCP ulanishlari, rejalashtirilgan vazifalar

## Muhit o'zgaruvchilari (Vercel yoki `.env.local`)

```
MRAI_AUTH_TOKEN=   # ~/MR/mrai/token.key bilan BIR XIL (Next -> Python server)
MRAI_SERVER_URL=   # MAJBURIY: ngrok/tunnel manzili (kodda standart yo'q)
```

Saytga kirish kaliti env'da emas, lokal serverda `~/MR/mrai/access.key` faylida turadi. Boshqa o'zgaruvchi kerak emas.

## Ishga tushirish (kompyuterda)

Hammasi systemd (user) servislari sifatida ishlaydi va **kompyuter yoqilganda o'zi ishga tushadi** (`linger`):
`mrai.service` (Python server :8080), `mrai-web.service` (Next :3000), `mrai-edge.service` (edge proxy :7780).

```bash
bash deploy/install.sh   # bir marta: servislar + `mrai` buyrug'ini o'rnatadi
mrai status              # holat
mrai stop                # hammasini to'xtatadi (kompyuter qayta yonsa yana o'zi ishga tushadi)
mrai start               # faqat stop'dan keyin qayta yoqish uchun (odatda kerak emas)
mrai restart | mrai logs
```

Yangi kod chiqargach: `npm run build && mrai restart`.

## Papkalar

- `src/`, `public/` — Next.js ilova
- `server/` — Python server (`mrai_server.py`, `mrai_tasks.py`, `start.sh`). Ish nusxasi `~/MR/mrai` da turadi;
  maxfiy fayllar (`token.key`, `access.key`, `mrai.db`) repoga KIRMAYDI
- `scripts/edge-proxy.js` — ngrok uchun yagona kirish (`/mcp` -> cmc, `/pyserver/*` -> Python, qolgani -> web)
- `deploy/` — servis fayllari, `mrai` buyrug'i va o'rnatuvchi

Holat va qarorlar: `STATUS.md`.
