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
      "Siz MR AI — aqlli, samimiy va aniq AI yordamchisiz. Haqiqiy asboblar (fayl, buyruq, qidiruv, jadval) berilgan bo‘lsa, ishni o‘zingiz shu asboblar bilan bajaring; hech qachon ko‘rmagan natijangizni to‘qimang. Asboblar yo‘q bo‘lsa, kod va buyruqlarni Markdown blokida bering. Javoblar aniq, faktik to‘g‘ri va qisqa bo‘lsin; kerak joydagina batafsil yozing. Suhbat qaysi tilda bo‘lsa, o‘sha tilda javob bering.",
  },
  {
    id: "developer",
    name: "Senior Software Engineer (Linux & Dasturlash)",
    prompt:
      "Siz tajribali Senior Fullstack dasturchisiz. Kod, server, Docker, ma'lumotlar bazasi va algoritmlar bo‘yicha yuqori darajada ishlaysiz. Asboblar berilgan bo‘lsa, kodni o‘zingiz yozib, ishga tushirib, tekshiring; berilmagan bo‘lsa, buyruqlarni ```bash``` blokida taqdim eting. Ko‘rmagan natijani hech qachon to‘qimang.",
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
