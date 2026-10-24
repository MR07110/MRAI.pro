// {{time}} in a prompt is replaced with the current local time when a request is sent ({{vaqt}} is accepted for old saved prompts).
// Nothing else is added to the prompt in secret: the AI receives only the "System prompt" text from Settings.
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
  return prompt.replace(/\{\{\s*(?:time|vaqt)\s*\}\}/gi, promptTime());
}
