# MR AI Pro

AI chat ilovasi: foydalanuvchining o'z API kalitlari bilan ishlaydi. Barcha ma'lumotlar (hisoblar, suhbatlar,
kalitlar, vazifalar) **faqat o'z serveringizda** (Python + SQLite, `~/MR/mrai`) saqlanadi. Tashqi baza (Supabase) yo'q.

## Imkoniyatlar

- Kirish kaliti + hisoblar (ro'yxatdan o'tish / kirish), har foydalanuvchi ma'lumoti va sandboxi alohida
- **Sozlamalar → API kalitlar**: istalgan provayder (Groq, OpenAI, OpenRouter, Anthropic, Custom)
- Streaming javoblar, suhbatlar tarixi (`/c/<id>` manzili)
- Agent asboblari (Bash, Read, Write, Edit, Grep...), MCP ulanishlari, rejalashtirilgan vazifalar

## Muhit o'zgaruvchilari (Vercel yoki `.env.local`)

```
MRAI_AUTH_TOKEN=   # ~/MR/mrai/token.key bilan BIR XIL (Next -> Python server)
MRAI_SERVER_URL=   # MAJBURIY: ngrok/tunnel manzili (kodda standart yo'q)
```

Saytga kirish kaliti env'da emas, lokal serverda `~/MR/mrai/access.key` faylida turadi. Boshqa o'zgaruvchi kerak emas.

## Ishga tushirish

```bash
npm install
npm run dev        # lokal
npm run build && npm start
```

Python server: `~/MR/mrai/start.sh` (port 8080). Holat va qarorlar: `STATUS.md`.
