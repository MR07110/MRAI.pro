// Promptdagi {{vaqt}} belgisi so'rov yuborilayotganda joriy mahalliy vaqt bilan almashtiriladi.
// Boshqa hech narsa promptga yashirin qo'shilmaydi: AI ga nima aytilsa, faqat Sozlamalardagi "Tizim ko'rsatmasi" matni yuboriladi.
export function promptTime(): string {
  const tz = process.env.MRAI_TZ || "Asia/Tashkent";
  try {
    return `${new Date().toLocaleString("sv-SE", { timeZone: tz })} (${tz})`;
  } catch {
    return new Date().toISOString();
  }
}

export function applyPromptVars(prompt: string): string {
  if (!prompt) return "";
  return prompt.replace(/\{\{\s*vaqt\s*\}\}/gi, promptTime());
}
