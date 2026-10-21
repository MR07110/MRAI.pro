export type Provider =
  | 'groq'
  | 'deepseek'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'anthropic'
  | 'xai'
  | 'mistral'
  | 'together'
  | 'perplexity'
  | 'custom'
  | string;

export interface UserApiKey {
  id: string;
  user_id: string;
  provider: Provider;
  name: string;
  api_key: string;
  base_url?: string | null;
  model: string;
  is_default: boolean;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface Connector {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
  created_at?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  kind: 'ai' | 'shell';
  prompt: string;
  command: string;
  schedule: string;
  enabled: boolean;
  next_run: number | null;
  last_run: number | null;
  last_status: string;
  running?: boolean;
  app_url?: string;
  server_url?: string;
  key_id?: string;
  created_at?: string;
}

export interface TaskRun {
  id: string;
  task_id: string;
  started_at: number;
  finished_at: number | null;
  status: 'running' | 'ok' | 'error';
  trigger: string;
  output: string;
}
