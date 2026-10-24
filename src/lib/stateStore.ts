// User state is kept on the SERVER (not the browser): the message queue + interface state.
// The browser is only a viewer: everything returns exactly the same even after a refresh.
// Fayl: <MRAI_STATE_DIR | cwd/.mrai-state>/<user>.json (atomik yozuv, 0600).
import { promises as fs } from "fs";
import path from "path";

export interface RunTemplate {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  connectors?: unknown[];
  serverUrl?: string;
  appUrl?: string;
  keyId?: string;
  maxSteps?: number;
}
export interface QueueItem {
  id: string;
  text: string;
  createdAt: string;
  run: RunTemplate; // stays on the server only, never returned to the browser
}
export interface StoredFile {
  name: string;
  path: string;
  size?: number;
}
export interface UiState {
  sidebarOpen?: boolean;
  panelWidth?: number | null;
  openFiles: Record<string, StoredFile>;
  drafts: Record<string, string>;
}
export interface MemoryItem {
  id: string;
  text: string;
  ts: number; // seconds
}
export interface MemoryState {
  enabled: boolean; // default true
  items: MemoryItem[];
}
export interface UserState {
  queues: Record<string, QueueItem[]>;
  ui: UiState;
  memory: MemoryState;
}

const DIR = process.env.MRAI_STATE_DIR || path.join(process.cwd(), ".mrai-state");
const g = globalThis as typeof globalThis & {
  __mraiState?: Map<string, UserState>;
  __mraiStateLocks?: Map<string, Promise<void>>;
};
const cache: Map<string, UserState> = g.__mraiState || (g.__mraiState = new Map());
const locks: Map<string, Promise<void>> = g.__mraiStateLocks || (g.__mraiStateLocks = new Map());

const fileOf = (user: string) => path.join(DIR, user.replace(/[^A-Za-z0-9_.-]/g, "_") + ".json");
const empty = (): UserState => ({ queues: {}, ui: { openFiles: {}, drafts: {} }, memory: { enabled: true, items: [] } });

async function load(user: string): Promise<UserState> {
  const hit = cache.get(user);
  if (hit) return hit;
  let s = empty();
  try {
    const raw = JSON.parse(await fs.readFile(fileOf(user), "utf-8"));
    s = {
      queues: raw.queues && typeof raw.queues === "object" ? raw.queues : {},
      ui: {
        sidebarOpen: raw.ui?.sidebarOpen,
        panelWidth: raw.ui?.panelWidth ?? null,
        openFiles: raw.ui?.openFiles || {},
        drafts: raw.ui?.drafts || {},
      },
      memory: {
        enabled: raw.memory?.enabled !== false, // default on
        items: Array.isArray(raw.memory?.items) ? raw.memory.items : [],
      },
    };
  } catch {}
  cache.set(user, s);
  return s;
}

async function save(user: string, s: UserState) {
  await fs.mkdir(DIR, { recursive: true, mode: 0o700 });
  const f = fileOf(user);
  const tmp = f + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
  await fs.rename(tmp, f);
}

export async function readState(user: string): Promise<UserState> {
  return load(user);
}

// Writes for a single user are serialized (to avoid races)
export async function withState<T>(user: string, fn: (s: UserState) => T | Promise<T>): Promise<T> {
  const prev = locks.get(user) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(
    user,
    prev.then(() => next)
  );
  await prev;
  try {
    const s = await load(user);
    const r = await fn(s);
    await save(user, s);
    return r;
  } finally {
    release();
  }
}

// ---- Memory (Claude-style): durable facts the assistant may save and reuse. Default enabled. ----
export async function getMemory(user: string): Promise<MemoryState> {
  const s = await readState(user);
  return s.memory || { enabled: true, items: [] };
}

export async function addMemory(user: string, text: string): Promise<MemoryItem | null> {
  const clean = (text || "").trim().slice(0, 2000);
  if (!clean) return null;
  return withState(user, (s) => {
    if (!s.memory) s.memory = { enabled: true, items: [] };
    // Skip near-duplicates.
    if (s.memory.items.some((m) => m.text.trim().toLowerCase() === clean.toLowerCase())) return null;
    const item: MemoryItem = { id: Math.random().toString(36).slice(2, 10), text: clean, ts: Math.floor(Date.now() / 1000) };
    s.memory.items.push(item);
    if (s.memory.items.length > 200) s.memory.items = s.memory.items.slice(-200);
    return item;
  });
}

export async function deleteMemory(user: string, id: string): Promise<void> {
  await withState(user, (s) => {
    if (s.memory) s.memory.items = s.memory.items.filter((m) => m.id !== id);
  });
}

export async function clearMemory(user: string): Promise<void> {
  await withState(user, (s) => {
    if (s.memory) s.memory.items = [];
  });
}

export async function setMemoryEnabled(user: string, enabled: boolean): Promise<void> {
  await withState(user, (s) => {
    if (!s.memory) s.memory = { enabled: true, items: [] };
    s.memory.enabled = !!enabled;
  });
}
