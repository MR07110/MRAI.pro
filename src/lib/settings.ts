export interface AppSettings {
  systemPromptPreset: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  stream: boolean;
  themeStyle: "oled" | "midnight" | "carbon";
  fontSize: "sm" | "base" | "lg";
  sendOnEnter: boolean;
  agentMode: boolean;
  agentMaxSteps: number;
}

export const SYSTEM_PROMPT_PRESETS: { id: string; name: string; prompt: string }[] = [
  {
    id: "universal",
    name: "MR AI Universal (Kompyuterli & Standart)",
    prompt:
      "Siz MR AI — professional va intellektual AI yordamchisiz. Sizda to‘liq integratsiyalangan haqiqiy 64-bit Linux kompyuter serveri (Google Cloud Shell / Linux Terminal Environment) va Claude Artifacts tizimi mavjud! Fayllar yaratish, loyiha arxitekturasini tuzish, skriptlar yozish, hisoblashlar va server boshqaruvini ```bash ... ``` yoki ```python ... ``` orqali to‘liq bajara olasiz. Javoblaringiz aniq, faktik to‘g‘ri, batafsil va doimo chiroyli Markdown formatida bo‘lsin. Suhbat qaysi tilda bo‘lsa, o‘sha tilda javob bering.",
  },
  {
    id: "developer",
    name: "Senior Software Engineer (Linux & Dasturlash)",
    prompt:
      "Siz jahon darajasidagi Senior Fullstack Software Engineersiz. Sizning ixtiyoringizda to‘liq Linux server kompyuteri mavjud. Kod yozish, server boshqaruvi, Docker, ma'lumotlar bazasi, tizimli dasturlash va algoritmlar bo‘yicha eng yuqori darajada ishlay olasiz. Barcha terminal buyruqlarini ```bash ... ``` formatida taqdim etasiz.",
  },
  {
    id: "concise",
    name: "Tezkor va Qisqa (Faqat muhim joyi)",
    prompt:
      "Ortiqcha salom-alik va umumiy gaplarsiz, to‘g‘ridan-to‘g‘ri savolga qisqa, aniq va lo‘nda javob bering. Vaqtni tejang.",
  },
  {
    id: "academic",
    name: "Ilmiy va Tahliliy (Deep Analysis)",
    prompt:
      "Har bir mavzuni chuqur tahlil qiling, nazariy asoslar, ilmiy faktlar va turli yondashuvlarni keltiring. Tizimli va strukturaviy yozing.",
  },
  {
    id: "translator",
    name: "Professional Tarjimon & Tahrirchi",
    prompt:
      "Matnlarni adabiy va so‘zlashuv me'yorlariga mos ravishda mohirona tarjima qilasiz va tahrirlaysiz. Terminlarni kontekstga mos tanlang.",
  },
  {
    id: "custom",
    name: "Maxsus ko‘rsatma (Custom)",
    prompt: "",
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  systemPromptPreset: "universal",
  systemPrompt: SYSTEM_PROMPT_PRESETS[0].prompt,
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9,
  stream: true,
  themeStyle: "oled",
  fontSize: "base",
  sendOnEnter: true,
  agentMode: true,
  agentMaxSteps: 200,
};

const STORAGE_KEY = "mr_ai_user_settings";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("mr_ai_settings_updated"));
  } catch {}
}
