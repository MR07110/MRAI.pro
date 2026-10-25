"use client";

import { useEffect, useLayoutEffect, useState, useRef } from "react";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, Code2, Compass, Loader2, PanelLeft, PenTool, Sparkles, SquarePen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFaviconStatus } from "@/hooks/useFaviconStatus";
import { useConfirm } from "./ConfirmProvider";
import * as serverDb from "@/lib/serverDb";
import SettingsModal, { SETTINGS_TAB_IDS, type SettingsTab } from "./SettingsModal";
import ModelMenu from "./ModelMenu";
import { fetchModelsCached } from "@/lib/modelsCatalog";
import type { Chat, Message, UserApiKey } from "@/types";
import { loadSettings, AppSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import Sidebar from "./chat/Sidebar";
import FilePanel from "./FilePanel";
import type { FileRef } from "./chat/fileKind";
import { fileLines } from "./chat/parse";
import MessageView from "./chat/Message";
import Composer from "./chat/Composer";
import TypedText from "./TypedText";
import QueuedMessages, { type QueuedItem } from "./chat/QueuedMessages";
import { parseThinkingAndContent } from "./chat/parse";

export default function ChatApp({ initialChatId = null }: { initialChatId?: string | null }) {
 const pathname = usePathname();
 const searchParams = useSearchParams();
 const confirm = useConfirm();
 const urlCheckedRef = useRef(false);
 const [notFound, setNotFound] = useState(false);
 const { user, signOut } = useAuth();
 const [chats, setChats] = useState<Chat[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
 const [currentChatId, setCurrentChatId] = useState<string | null>(initialChatId);
 const [messages, setMessages] = useState<Message[]>([]);
 const [input, setInput] = useState("");
 const [pending, setPending] = useState<FileRef[]>([]);
 const [uploading, setUploading] = useState(false);
 const [isStreaming, setIsStreaming] = useState(false);
 // Browser-tab favicon: blinks while generating and the tab is in the background, steady green once
 // ready, and drops back to the plain default the instant the tab regains focus.
 useFaviconStatus(isStreaming);
 const [sidebarOpen, setSidebarOpen] = useState(true);
 // Settings and its active tab live in the URL (?settings=<tab>), so every tab is directly linkable,
 // opens reliably from a fresh load, and survives a refresh — even while a specific chat is open.
 const settingsParam = searchParams.get("settings");
 const settingsOpen = !!settingsParam;
 const settingsTab: SettingsTab = (SETTINGS_TAB_IDS as readonly string[]).includes(settingsParam || "")
 ? (settingsParam as SettingsTab)
 : "keys";
 const [modelOpen, setModelOpen] = useState(false);
 const [defaultKey, setDefaultKey] = useState<UserApiKey | null>(null);
 const [mobileSidebar, setMobileSidebar] = useState(false);
 const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
 const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
 const [isScrolledUp, setIsScrolledUp] = useState(false);
 const [openFile, setOpenFile] = useState<FileRef | null>(null);
  const [filePanelWidth, setFilePanelWidth] = useState<number | null>(null);

  // ===== SERVER STATE: the browser is only a "viewer" (like an iframe) =====
  // The open file (artifact), panel width, sidebar, draft text and queued messages are stored on the server:
  // so everything comes back exactly the same even after a page refresh.
  const uiRef = useRef<{ openFiles: Record<string, FileRef>; drafts: Record<string, string> }>({ openFiles: {}, drafts: {} });
  const [uiReady, setUiReady] = useState(false);
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const queueLenRef = useRef(0);
  queueLenRef.current = queue.length;

  function putUi(body: Record<string, unknown>) {
    fetch("/api/ui-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch("/api/ui-state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.ui) return;
        const files: Record<string, FileRef> = {};
        for (const [k, f] of Object.entries<any>(j.ui.openFiles || {})) {
          if (f && f.path && f.name) files[k] = { path: f.path, name: f.name, size: f.size ?? 0 };
        }
        uiRef.current = { openFiles: files, drafts: j.ui.drafts || {} };
        if (typeof j.ui.sidebarOpen === "boolean") setSidebarOpen(j.ui.sidebarOpen);
        if (typeof j.ui.panelWidth === "number") setFilePanelWidth(j.ui.panelWidth);
      })
      .catch(() => {})
      .finally(() => alive && setUiReady(true));
    return () => {
      alive = false;
    };
  }, [user]);

  function setFilePanelWidthPersist(w: number | null) {
    setFilePanelWidth(w);
    putUi({ panelWidth: w });
  }

  function changeOpenFile(f: FileRef | null) {
    setOpenFile(f);
    const cid = currentChatIdRef.current;
    if (!cid) return;
    if (f) uiRef.current.openFiles[cid] = f;
    else delete uiRef.current.openFiles[cid];
    putUi({ openFile: { chatId: cid, file: f ? { name: f.name, path: f.path, size: f.size } : null } });
  }

  // Auto-open the artifact when the agent presents a file (Claude-style). Opens each newly presented file once;
  // if the user then closes it, it stays closed (only a different, newer file opens the panel again).
  const autoOpenedRef = useRef("");
  useEffect(() => {
    const lastA = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastA) return;
    const m = [...String(lastA.content).matchAll(/@file\t\d+\t(\/[^\n\t]+)/g)];
    if (!m.length) return;
    const p = m[m.length - 1][1];
    if (p && p !== autoOpenedRef.current) {
      autoOpenedRef.current = p;
      changeOpenFile({ path: p, name: p.split("/").pop() || p, size: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // On switching chats: that chat's open file and draft text are restored from the server
  useEffect(() => {
    if (!uiReady) return;
    setOpenFile(currentChatId ? uiRef.current.openFiles[currentChatId] || null : null);
    setInput(uiRef.current.drafts[currentChatId || "new"] || "");
  }, [currentChatId, uiReady]);

  useEffect(() => {
    if (uiReady) putUi({ sidebarOpen });
  }, [sidebarOpen, uiReady]);

  // The draft text (message being typed) is saved to the server
  useEffect(() => {
    if (!uiReady) return;
    const key = currentChatId || "new";
    const t = window.setTimeout(() => {
      if ((uiRef.current.drafts[key] || "") === input) return;
      if (input) uiRef.current.drafts[key] = input;
      else delete uiRef.current.drafts[key];
      putUi({ draft: { key, text: input } });
    }, 600);
    return () => window.clearTimeout(t);
  }, [input, currentChatId, uiReady]);

  // Queue + server job state: read from the server. When the server starts a queued message itself
  // (when the browser is open) it appears here and reattaches to the stream.
  useEffect(() => {
    if (!user || !currentChatId) {
      setQueue([]);
      return;
    }
    const cid = currentChatId;
    let stop = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const r = await fetch(`/api/queue?chatId=${encodeURIComponent(cid)}`, { cache: "no-store" });
        if (!r.ok || stop || currentChatIdRef.current !== cid) return;
        const j = await r.json();
        const q: QueuedItem[] = Array.isArray(j.queue) ? j.queue : [];
        setQueue((prev) => (JSON.stringify(prev) === JSON.stringify(q) ? prev : q));
        if (j.running && !isStreamingActiveRef.current) {
          // The server started a new job (e.g. a queued message): refresh quietly and attach to the stream
          try {
            const data = await serverDb.getMessages(cid);
            if (!stop && currentChatIdRef.current === cid && !isStreamingActiveRef.current) setMessages(data || []);
          } catch {}
          if (!stop && currentChatIdRef.current === cid) await tryAttach(cid);
        }
      } catch {}
    };
    const loop = async () => {
      await tick();
      if (!stop) timer = window.setTimeout(loop, queueLenRef.current > 0 || isStreamingActiveRef.current ? 1500 : 5000);
    };
    loop();
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentChatId, user]);

  async function queueApi(body: Record<string, unknown>) {
    const cid = currentChatIdRef.current;
    if (!cid) return null;
    try {
      const r = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: cid, ...body }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (currentChatIdRef.current === cid) setQueue(j.queue || []);
      return j;
    } catch {
      return null;
    }
  }

  // A message typed while a reply is streaming: goes into the server-side queue
  async function enqueueMessage(text: string, clearInput: boolean) {
    const key = defaultKey;
    if (!currentChatIdRef.current || !key || !key.model) return;
    if (clearInput) {
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    const id = crypto.randomUUID();
    setQueue((prev) => [...prev, { id, text, createdAt: new Date().toISOString() }]);
    const conns = (await serverDb.getConnectors()).filter((c) => c.enabled);
    const j = await queueApi({
      action: "add",
      id,
      text,
      apiKey: key.api_key,
      provider: key.provider,
      model: key.model,
      baseUrl: key.base_url || undefined,
      systemPrompt: appSettings.systemPrompt || undefined,
      temperature: appSettings.temperature ?? 0.7,
      maxTokens: appSettings.maxTokens ?? 4096,
      connectors: conns.map((c) => ({ id: c.id, name: c.name, url: c.url, headers: c.headers })),
      serverUrl: serverDb.getServerBaseUrl(),
      appUrl: window.location.origin,
      keyId: key.id,
      maxSteps: appSettings.agentMaxSteps ?? 200,
    });
    if (!j) {
      setQueue((prev) => prev.filter((i) => i.id !== id));
      if (clearInput) setInput(text);
    }
  }

 // Chat renaming state
 const [editingChatId, setEditingChatId] = useState<string | null>(null);
 const [editingTitle, setEditingTitle] = useState("");

 const messagesEndRef = useRef<HTMLDivElement>(null);
 const chatScrollContainerRef = useRef<HTMLDivElement>(null);
 const abortRef = useRef<AbortController | null>(null);
 const textareaRef = useRef<HTMLTextAreaElement>(null);
 const skipNextLoadRef = useRef<string | null>(null);
 const targetTextRef = useRef("");
 const displayedTextRef = useRef("");
 const smoothTickerRef = useRef<number | null>(null);
 const isStreamingActiveRef = useRef(false);
 const streamSeqRef = useRef(0); // so an old (stopped) stream does not disturb the new one
 const currentChatIdRef = useRef<string | null>(initialChatId);
 currentChatIdRef.current = currentChatId;
 const authed = !!user;
 // Auto-scroll state: true = "stuck" to the bottom. Only the user scrolling up disables it (growing content does not).
 const stickRef = useRef(true);
 const lastScrollTopRef = useRef(0);

 // Each chat has its own URL: /c/<id> (new chat: /). Any existing query string (e.g. ?settings=...) is
 // kept, so switching chats never silently drops Settings out of the URL.
 function pushUrl(id: string | null, replace = false) {
 if (typeof window === "undefined") return;
 const path = id ? `/c/${id}` : "/";
 if (window.location.pathname === path) return;
 const url = path + window.location.search;
 if (replace) window.history.replaceState(null, "", url);
 else window.history.pushState(null, "", url);
 }

 // Settings lives at ?settings=<tab> on top of whatever chat URL is current, so it opens reliably from
 // a direct link/refresh, keeps working while inside a chat, and each tab is independently linkable.
 function openSettingsTab(tab: SettingsTab = "keys") {
 if (typeof window === "undefined") return;
 const url = new URL(window.location.href);
 url.searchParams.set("settings", tab);
 window.history.pushState(null, "", url.pathname + "?" + url.searchParams.toString());
 }
 function changeSettingsTab(tab: SettingsTab) {
 if (typeof window === "undefined") return;
 const url = new URL(window.location.href);
 url.searchParams.set("settings", tab);
 window.history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
 }
 function closeSettings() {
 if (typeof window === "undefined") return;
 const url = new URL(window.location.href);
 url.searchParams.delete("settings");
 const qs = url.searchParams.toString();
 window.history.replaceState(null, "", url.pathname + (qs ? "?" + qs : ""));
 }

 // Browser back/forward buttons or a direct URL change -- switch the chat too
 useEffect(() => {
 const m = pathname.match(/^\/c\/([^/]+)/);
 const id = m ? decodeURIComponent(m[1]) : null;
 setCurrentChatId((cur) => (cur === id ? cur : id));
 }, [pathname]);

 // Load chats + default key + settings
 useEffect(() => {
 if (!user) return;
 loadChats();
 loadDefaultKey();
 setAppSettings(loadSettings());

 function onSettingsUpdate() {
 setAppSettings(loadSettings());
 }
 function onKeysUpdate() {
 loadDefaultKey();
 }

 window.addEventListener("mr_ai_settings_updated", onSettingsUpdate);
 window.addEventListener("mr_ai_keys_updated", onKeysUpdate);
 return () => {
 window.removeEventListener("mr_ai_settings_updated", onSettingsUpdate);
 window.removeEventListener("mr_ai_keys_updated", onKeysUpdate);
 };
 }, [user]);

 // Load messages when chat changes (prevent race condition during inline chat creation)
 useEffect(() => {
 if (!authed) return;
 stickRef.current = true;
 if (skipNextLoadRef.current && skipNextLoadRef.current === currentChatId) {
 skipNextLoadRef.current = null;
 return;
 }
 if (currentChatId) {
 const cid = currentChatId;
 // Messages load from the DB, then if an agent is still running on the server we reattach (it continues across refreshes)
 loadMessages(cid).then(() => {
 if (currentChatIdRef.current === cid) tryAttach(cid);
 });
 } else {
 setMessages([]);
 setChatLoading(false);
 }
 }, [currentChatId, authed]);

 // Detect the user scrolling up: only UPWARD movement disables auto-stick.
 // (The app only scrolls down itself, so growing content is not mistaken for "scrolled up".)
 const handleScroll = () => {
 const el = chatScrollContainerRef.current;
 if (!el) return;
 const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
 const movedUp = el.scrollTop < lastScrollTopRef.current - 2;
 lastScrollTopRef.current = el.scrollTop;
 if (movedUp && dist > 8) stickRef.current = false;
 else if (dist < 24) stickRef.current = true;
 setIsScrolledUp(!stickRef.current && dist > 120);
 };

 // useLayoutEffect: scroll runs BEFORE the browser paints, in the same frame the text grew.
 // (It was useEffect before: text painted first, scroll jumped on the next frame -> a flicker.)
 useLayoutEffect(() => {
 const el = chatScrollContainerRef.current;
 if (!el || !stickRef.current) return;
 el.scrollTop = el.scrollHeight;
 }, [messages, isStreaming]);

 const scrollToBottom = () => {
 stickRef.current = true;
 setIsScrolledUp(false);
 const el = chatScrollContainerRef.current;
 el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
 };

 async function loadChats() {
 if (!user) return;
 try {
 const data = await serverDb.getChats();
 setChats(data || []);
 // If the chat in the URL is not this account's (or missing) -- show nothing and go back to the home page
 if (!urlCheckedRef.current) {
 urlCheckedRef.current = true;
 if (initialChatId && !(data || []).some((c) => c.id === initialChatId)) {
 setCurrentChatId(null);
 setMessages([]);
 setNotFound(true);
 pushUrl(null, true);
 }
 }
 } catch (e) {
 console.error("loadChats error:", e);
 }
 }

 async function loadDefaultKey(): Promise<UserApiKey | null> {
 if (!user) return null;
 try {
 const keys = await serverDb.getKeys();
 let def = keys.find((k) => k.is_default);
 if (!def && keys.length > 0) {
 def = keys[0];
 await serverDb.setDefaultKey(def.id);
 }
 setDefaultKey(def || null);
 return def || null;
 } catch {
 return null;
 }
 }

 async function loadMessages(chatId: string) {
    setChatLoading(true);
    try {
      const data = await serverDb.getMessages(chatId);
      if (currentChatIdRef.current === chatId) setMessages(data || []);
    } catch (e) {
      console.error("loadMessages error:", e);
    } finally {
      if (currentChatIdRef.current === chatId) setChatLoading(false);
    }
  }

  function createNewChat() {
 if (!user) return;
 if (!currentChatId || messages.length === 0) {
 setMobileSidebar(false);
 return;
 }
 if (isStreaming) {
 stopStreaming(true);
 }
 setCurrentChatId(null);
 setMessages([]);
 pushUrl(null);
 setMobileSidebar(false);
 }

 async function deleteChat(id: string, e: React.MouseEvent) {
 e.stopPropagation();
 if (!(await confirm({ title: "Delete this chat?", confirmLabel: "Delete", danger: true }))) return;
 await serverDb.deleteChat(id);
 setChats((prev) => prev.filter((c) => c.id !== id));
 if (currentChatId === id) {
 setCurrentChatId(null);
 setMessages([]);
 pushUrl(null, true);
 }
 }

 async function saveChatTitle(id: string) {
 if (!editingTitle.trim()) {
 setEditingChatId(null);
 return;
 }
 const cleanTitle = editingTitle.trim();
 await serverDb.updateChatTitle(id, cleanTitle);
 setChats((prev) =>
 prev.map((c) => (c.id === id ? { ...c, title: cleanTitle } : c))
 );
 setEditingChatId(null);
 }

 // Copy assistant response
 const copyResponse = async (id: string, content: string) => {
 try {
 const { content: cleanText } = parseThinkingAndContent(content);
 await navigator.clipboard.writeText(cleanText || content);
 setCopiedMessageId(id);
 setTimeout(() => setCopiedMessageId(null), 2000);
 } catch {}
 };

 // Edit only the most recent user message in its bubble → later replies are cut and resent
 async function editUserMessage(messageId: string, text: string) {
 if (isStreaming || !currentChatId || !text.trim()) return;

 let activeKey = defaultKey;
 if (!activeKey) activeKey = await loadDefaultKey();
 if (!activeKey) {
 openSettingsTab();
 return;
 }
 if (!activeKey.model) {
 setModelOpen(true);
 return;
 }

 const idx = messages.findIndex((m) => m.id === messageId && m.role === "user");
 if (idx === -1) return;
 // only the most recent user message
 let lastUserIdx = -1;
 for (let i = messages.length - 1; i >= 0; i--) {
 if (messages[i].role === "user") {
 lastUserIdx = i;
 break;
 }
 }
 if (idx !== lastUserIdx) return;

 const updated = { ...messages[idx], content: text.trim() };
 const trimmed = [...messages.slice(0, idx), updated];
 setMessages(trimmed);

 // DB: rewrite with the new text (id kept)
 await serverDb.saveMessage(currentChatId, "user", text.trim(), messageId);

 const history = trimmed.map((m) => ({
 role: m.role as "user" | "assistant",
 content: m.content,
 }));
 await executeChatStream(currentChatId, history, activeKey);
 }

 // Core Send Logic via Server API (/api/chat)
 async function executeChatStream(
 chatId: string,
 history: Array<{ role: "user" | "assistant"; content: string }>,
 keyToUse?: UserApiKey | null,
 attach?: { res: Response; msgId: string }
 ) {
 let key0 = keyToUse || defaultKey;
 if (!attach) {
 if (!key0) {
 key0 = await loadDefaultKey();
 }
 if (!key0) {
 openSettingsTab();
 return;
 }
 if (!key0.model) {
 setModelOpen(true);
 return;
 }
 }
 const key = key0 as UserApiKey; // not used in attach mode

 stickRef.current = true;
 setIsScrolledUp(false);
 setIsStreaming(true);
 const controller = new AbortController();
 abortRef.current = controller;
 const mySeq = ++streamSeqRef.current;

 const tempAiId = attach?.msgId || crypto.randomUUID();
 targetTextRef.current = "";
 displayedTextRef.current = "";
 isStreamingActiveRef.current = true;
 let networkDone = false;
 let lastTickTime = 0;
 const FRAME_MS = 18; // ~55 updates per second: perfectly calm, steady, readable

 if (smoothTickerRef.current) {
 cancelAnimationFrame(smoothTickerRef.current);
 smoothTickerRef.current = null;
 }

 setMessages((prev) =>
 prev.some((m) => m.id === tempAiId)
 ? prev
 : [
 ...prev,
 {
 id: tempAiId,
 chat_id: chatId,
 role: "assistant",
 content: "",
 created_at: new Date().toISOString(),
 },
 ]
 );

 // Ultra-smooth typewriter ticker loop: reveals characters smoothly without jerky bursts
 const tickSmoothStream = (time: number) => {
 if (!isStreamingActiveRef.current || streamSeqRef.current !== mySeq) return;

 if (time - lastTickTime >= FRAME_MS) {
 // A long gap between frames means the tab was in the background (rAF is paused there): show everything
 // that arrived meanwhile at once instead of typing it out again.
 const wasAway = lastTickTime > 0 && time - lastTickTime > 400;
 lastTickTime = time;

 const target = targetTextRef.current;
 const current = displayedTextRef.current;

 if (current.length < target.length) {
 const diff = target.length - current.length;
 // Smooth ease-out: reveal a fraction of the remaining backlog each frame, capped so it never dumps
 // a big chunk and never crawls. This gives the calm, even flow of Claude.ai rather than steppy bursts.
 const step = wasAway ? diff : Math.max(2, Math.min(Math.ceil(diff * 0.14), 28));

 const nextLen = Math.min(target.length, current.length + step);
 const nextText = target.slice(0, nextLen);
 displayedTextRef.current = nextText;

 setMessages((prev) => {
 const exists = prev.some((m) => m.id === tempAiId);
 if (exists) {
 return prev.map((m) =>
 m.id === tempAiId ? { ...m, content: nextText } : m
 );
 }
 return [
 ...prev,
 {
 id: tempAiId,
 chat_id: chatId,
 role: "assistant",
 content: nextText,
 created_at: new Date().toISOString(),
 },
 ];
 });
 }

 if (networkDone && displayedTextRef.current.length >= targetTextRef.current.length) {
 smoothTickerRef.current = null;
 return;
 }
 }

 smoothTickerRef.current = requestAnimationFrame(tickSmoothStream);
 };

 smoothTickerRef.current = requestAnimationFrame(tickSmoothStream);

 const useAgent = !!attach || appSettings.agentMode !== false;
 const isStream = useAgent || appSettings.stream !== false;

 try {
 let agentExtra: Record<string, unknown> = {};
 if (useAgent && !attach) {
 const conns = (await serverDb.getConnectors()).filter((c) => c.enabled);
 agentExtra = {
 connectors: conns.map((c) => ({ id: c.id, name: c.name, url: c.url, headers: c.headers })),
 serverUrl: serverDb.getServerBaseUrl(),
 appUrl: window.location.origin,
 keyId: key.id,
 maxSteps: appSettings.agentMaxSteps ?? 200,
 };
 }

 const res = attach ? attach.res : await fetch(useAgent ? "/api/agent" : "/api/chat", {
 method: "POST",
 headers: useAgent ? serverDb.authHeaders() : { "Content-Type": "application/json" },
 body: JSON.stringify({
 messages: history,
 apiKey: key.api_key,
 provider: key.provider,
 model: key.model,
 baseUrl: key.base_url || undefined,
 systemPrompt: appSettings.systemPrompt || undefined,
 temperature: appSettings.temperature ?? 0.7,
 maxTokens: appSettings.maxTokens ?? 4096,
 stream: isStream,
 chatId,
 keyId: key.id,
 messageId: tempAiId,
 ...agentExtra,
 }),
 signal: controller.signal,
 });

 if (!res.ok) {
 let errMessage = `HTTP ${res.status}`;
 try {
 const errJson = await res.json();
 errMessage = errJson.error || errMessage;
 } catch {
 const txt = await res.text();
 if (txt) errMessage = txt;
 }
 throw new Error(errMessage);
 }

 if (isStream && res.body) {
 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = "";

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n");
 buffer = lines.pop() || "";

 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed.startsWith("data: ")) continue;

 const dataStr = trimmed.slice(6).trim();
 if (dataStr === "[DONE]") continue;

 try {
 const parsed = JSON.parse(dataStr);
 if (typeof parsed.snapshot === "string") {
 const snap: string = parsed.snapshot;
 targetTextRef.current = snap;
 displayedTextRef.current = snap;
 setMessages((prev) => prev.map((m) => (m.id === tempAiId ? { ...m, content: snap } : m)));
 }
 if (parsed.content !== undefined && parsed.content !== null) {
 targetTextRef.current += parsed.content;
 }
 } catch {}
 }
 }
 } else {
 const data = await res.json();
 targetTextRef.current = data.content || "";
 }

 networkDone = true;

 // Smoothly wait until displayed text finishes typing out all remaining characters
 // (requestAnimationFrame does not run in a background tab, so there the text is shown at once —
 // otherwise the reply would never "finish" and the tab favicon would never turn green.)
 while (isStreamingActiveRef.current && displayedTextRef.current.length < targetTextRef.current.length) {
 if (document.hidden) {
 displayedTextRef.current = targetTextRef.current;
 break;
 }
 await new Promise((resolve) => setTimeout(resolve, 20));
 }

 isStreamingActiveRef.current = false;
 if (smoothTickerRef.current) {
 cancelAnimationFrame(smoothTickerRef.current);
 smoothTickerRef.current = null;
 }

 const fullFinalContent = targetTextRef.current;
 setMessages((prev) =>
 prev.map((m) =>
 m.id === tempAiId ? { ...m, content: fullFinalContent } : m
 )
 );

 // Save assistant message to Server / SQLite
 if (!useAgent && fullFinalContent.trim()) {
 await serverDb.saveMessage(chatId, "assistant", fullFinalContent, tempAiId);
 }
 } catch (err: any) {
 if (streamSeqRef.current !== mySeq) return; // a new stream started: the old one must touch nothing
 isStreamingActiveRef.current = false;
 if (smoothTickerRef.current) {
 cancelAnimationFrame(smoothTickerRef.current);
 smoothTickerRef.current = null;
 }

 if (err.name === "AbortError") {
 const partial = displayedTextRef.current || targetTextRef.current;
 if (!useAgent && partial.trim()) {
 try {
 await serverDb.saveMessage(chatId, "assistant", partial, tempAiId);
 } catch {}
 }
 } else if (useAgent && (err instanceof TypeError || /network|failed to fetch|terminated|load failed|socket/i.test(String(err?.message || "")))) {
 // Aloqa uzildi, lekin ish serverda davom etmoqda: jimgina qayta ulanamiz
 setTimeout(() => tryAttach(chatId), 1500);
 } else {
 const errorContent = `Error: ${err.message || "Unknown error"}`;
 setMessages((prev) => {
 const exists = prev.some((m) => m.id === tempAiId);
 if (exists) {
 return prev.map((m) =>
 m.id === tempAiId ? { ...m, content: errorContent } : m
 );
 }
 return [
 ...prev,
 {
 id: tempAiId,
 chat_id: chatId,
 role: "assistant",
 content: errorContent,
 created_at: new Date().toISOString(),
 },
 ];
 });
 }
 } finally {
 if (streamSeqRef.current === mySeq) {
 isStreamingActiveRef.current = false;
 if (smoothTickerRef.current) {
 cancelAnimationFrame(smoothTickerRef.current);
 smoothTickerRef.current = null;
 }
 setIsStreaming(false);
 abortRef.current = null;
 }
 }
 }

 // On page refresh / opening a chat: reattach to an agent still running on the server (like screen sharing).
 async function tryAttach(chatId: string) {
 if (isStreamingActiveRef.current) return;
 try {
 const res = await fetch(`/api/agent/attach?chatId=${encodeURIComponent(chatId)}`, { cache: "no-store" });
 if (res.status === 204 || !res.ok) return;
 if ((res.headers.get("content-type") || "").includes("application/json")) {
 await loadMessages(chatId); // recently finished: take the final text from the DB
 return;
 }
 if (currentChatIdRef.current !== chatId || isStreamingActiveRef.current) {
 try {
 await res.body?.cancel();
 } catch {}
 return;
 }
 const msgId = res.headers.get("x-run-msg-id") || crypto.randomUUID();
 await executeChatStream(chatId, [], null, { res, msgId });
 } catch {}
 }

 // Send new user prompt
 // Upload attached files to the computer (streamed). Each becomes a file path the chat shows as a card
 // and the agent can read — the same /api/files mechanism used for every other file.
 async function uploadFiles(files: File[]) {
 if (!files.length) return;
 setUploading(true);
 try {
 for (const file of files) {
 const fd = new FormData();
 fd.append("file", file);
 try {
 const res = await fetch("/api/upload", { method: "POST", body: fd });
 const j = await res.json().catch(() => ({}));
 if (res.ok && j?.path) {
 setPending((prev) => (prev.some((f) => f.path === j.path) ? prev : [...prev, { path: j.path, name: j.name || file.name, size: j.size || file.size }]));
 }
 } catch {
 /* skip a file that failed to upload */
 }
 }
 } finally {
 setUploading(false);
 }
 }

 async function sendMessage(promptOverride?: string) {
 const typed = (promptOverride || input).trim();
 // Attachments ride along as @file lines so they render as cards and the agent sees the paths.
 const attachLines = !promptOverride && pending.length ? fileLines(pending) : "";
 const textToSend = attachLines ? (typed ? `${typed}\n\n${attachLines}` : attachLines) : typed;
 if (!textToSend || !user) return;
 if (isStreaming) {
 // While a reply is streaming: queue it (agent mode only — it runs on the server)
 if (appSettings.agentMode !== false) await enqueueMessage(textToSend, !promptOverride);
 if (!promptOverride) setPending([]);
 return;
 }

 let activeKey = defaultKey;
 if (!activeKey) {
 activeKey = await loadDefaultKey();
 }
 if (!activeKey) {
 openSettingsTab();
 return;
 }
 if (!activeKey.model) {
 setModelOpen(true);
 return;
 }

 let chatId = currentChatId;

 // Create chat if not exists
 if (!chatId) {
 const newChat = await serverDb.createChat((typed || pending[0]?.name || "New chat").slice(0, 45));
 chatId = newChat.id;
 skipNextLoadRef.current = chatId;
 setCurrentChatId(chatId);
 pushUrl(chatId, true);
 setChats((prev) => [newChat, ...prev]);
 }

 if (!chatId) return;
 const activeChatId: string = chatId;

 if (!promptOverride) {
 setInput("");
 setPending([]);
 if (textareaRef.current) textareaRef.current.style.height = "auto";
 }

 // Append user message
 const tempUserId = crypto.randomUUID();
 const nextUserMsg: Message = {
 id: tempUserId,
 chat_id: activeChatId,
 role: "user",
 content: textToSend,
 created_at: new Date().toISOString(),
 };

 setMessages((prev) => [...prev, nextUserMsg]);

 // Save to server / SQLite
 await serverDb.saveMessage(activeChatId, "user", textToSend, tempUserId);

 // Prepare history
 const history = [
 ...messages.map((m) => ({
 role: m.role as "user" | "assistant",
 content: m.content,
 })),
 { role: "user" as const, content: textToSend },
 ];

 await executeChatStream(activeChatId, history, activeKey);
 }

 // Regenerate last assistant response (Claude style)
 async function regenerateResponse() {
 if (isStreaming || !currentChatId || messages.length === 0) return;

 let activeKey = defaultKey;
 if (!activeKey) {
 activeKey = await loadDefaultKey();
 }
 if (!activeKey) {
 openSettingsTab();
 return;
 }
 if (!activeKey.model) {
 setModelOpen(true);
 return;
 }

 let lastUserIdx = -1;
 for (let i = messages.length - 1; i >= 0; i--) {
 if (messages[i].role === "user") {
 lastUserIdx = i;
 break;
 }
 }
 if (lastUserIdx === -1) return;

 const trimmedMessages = messages.slice(0, lastUserIdx + 1);
 setMessages(trimmedMessages);

 const cutTime = trimmedMessages[lastUserIdx].created_at;

 const history = trimmedMessages.map((m) => ({
 role: m.role as "user" | "assistant",
 content: m.content,
 }));

 await executeChatStream(currentChatId, history, activeKey);
 }

 function stopStreaming(detachOnly = false) {
 // detachOnly: just detach the view (the job keeps running on the server); otherwise stop the server job too
 if (!detachOnly && currentChatIdRef.current) {
 fetch("/api/agent/stop", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ chatId: currentChatIdRef.current }),
 }).catch(() => {});
 }
 isStreamingActiveRef.current = false;
 abortRef.current?.abort();
 if (smoothTickerRef.current) {
 cancelAnimationFrame(smoothTickerRef.current);
 smoothTickerRef.current = null;
 }
 const finalContent = targetTextRef.current || displayedTextRef.current;
 if (finalContent) {
 setMessages((prev) => {
 const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant");
 if (lastAssistant) {
 return prev.map((m) =>
 m.id === lastAssistant.id ? { ...m, content: finalContent } : m
 );
 }
 return prev;
 });
 }
 setIsStreaming(false);
 }

 function selectChat(id: string) {
 if (id === currentChatId) {
 setMobileSidebar(false);
 return;
 }
 if (isStreaming) {
 stopStreaming(true);
 }
 setCurrentChatId(id);
 pushUrl(id);
 setMobileSidebar(false);
 }

 function handleKeyDown(e: React.KeyboardEvent) {
 if (appSettings.sendOnEnter !== false) {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 } else {
 if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
 e.preventDefault();
 sendMessage();
 }
 }
 }

 function autoResize() {
 const el = textareaRef.current;
 if (!el) return;
 el.style.height = "auto";
 el.style.height = Math.min(el.scrollHeight, 220) + "px";
 }

 const displayName =
 user?.user_metadata?.full_name ||
 user?.user_metadata?.username ||
 user?.email?.split("@")[0] ||
 "User";
 const displayUsername =
 user?.user_metadata?.username ||
 user?.email?.split("@")[0] ||
 "user";

 const fontSizeClass =
 appSettings.fontSize === "sm"
 ? "text-[14px]"
 : appSettings.fontSize === "lg"
 ? "text-[17px]"
 : "text-[15.5px]";

 const suggestions = [
 {
 title: "Write code",
 icon: Code2,
 prompt: "Write a modern, cleanly architected component in React and TypeScript.",
 },
 {
 title: "Explain",
 icon: Sparkles,
 prompt: "Explain how quantum computers work in simple, clear terms.",
 },
 {
 title: "Write",
 icon: PenTool,
 prompt: "Write a compelling, professional cover letter for a job at an IT company.",
 },
 {
 title: "Make a plan",
 icon: Compass,
 prompt: "Draft a practical 30-day plan to launch a new AI startup.",
 },
 ];

 const firstName = String(displayName).trim().split(/\s+/)[0] || "";
 const hour = new Date().getHours();
 const greeting = hour < 5 ? "Xayrli tun" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
 const currentTitle = chats.find((c) => c.id === currentChatId)?.title || "";
 const empty = messages.length === 0;
 const modelLabel = defaultKey ? defaultKey.model || "Select a model" : null;

 // Reset the input field height after sending
 useEffect(() => {
 if (input === "") autoResize();
 }, [input]);

 const openSettings = () => {
 openSettingsTab();
 loadDefaultKey();
 };

 const sidebarProps = {
 chats,
 currentChatId,
 onNew: createNewChat,
 onDelete: deleteChat,
 editingChatId,
 editingTitle,
 setEditingChatId,
 setEditingTitle,
 onSaveTitle: saveChatTitle,
 onSignOut: signOut,
 displayName: String(displayName),
 displayUsername: String(displayUsername),
 };

 // Model selection: the UI updates immediately (optimistic), saving in the background; reverts on error.
 function pickModel(id: string) {
 const k = defaultKey;
 setModelOpen(false);
 if (!k || id === k.model) return;
 const prev = k.model;
 setDefaultKey({ ...k, model: id });
 serverDb
 .updateKey(k.id, { model: id })
 .then(() => window.dispatchEvent(new Event("mr_ai_keys_updated")))
 .catch(() => setDefaultKey((cur) => (cur && cur.id === k.id ? { ...cur, model: prev } : cur)));
 }

 // Preload the list (in the background): no wait when the menu opens.
 useEffect(() => {
 if (!defaultKey) return;
 fetchModelsCached(defaultKey.id, defaultKey.provider, defaultKey.api_key, defaultKey.base_url, defaultKey.model || undefined).catch(() => {});
 }, [defaultKey?.id, defaultKey?.api_key]);

 const composer = (autoFocus: boolean) => (
 <Composer
 value={input}
 onChange={(v) => {
 setInput(v);
 autoResize();
 }}
 onKeyDown={handleKeyDown}
 onSend={() => sendMessage()}
 onStop={() => stopStreaming()}
 isStreaming={isStreaming}
 textareaRef={textareaRef}
 fontSizeClass={fontSizeClass}
 modelLabel={modelLabel}
 onModel={() => (defaultKey ? setModelOpen((v) => !v) : openSettingsTab())}
 modelMenu={
 modelOpen && defaultKey ? (
 <ModelMenu
 keyItem={defaultKey}
 onClose={() => setModelOpen(false)}
 onPick={pickModel}
 onOpenSettings={() => {
 setModelOpen(false);
 openSettingsTab();
 }}
 />
 ) : null
 }
 autoFocus={autoFocus}
 placeholder={empty ? "What shall we do today?" : "Type a message…"}
 attachments={pending}
 onAttach={uploadFiles}
 onRemoveAttachment={(p) => setPending((prev) => prev.filter((f) => f.path !== p))}
 uploading={uploading}
 />
 );

 const iconBtn =
 "h-9 w-9 inline-flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.07] transition cursor-pointer";

  // File/artifact panel ochiq bo‘lsa chat biroz ingichka
  const chatMax = openFile ? "max-w-[46rem] lg:max-w-[36rem]" : "max-w-[46rem]";

 return (
 <div className="h-[100dvh] flex bg-black text-neutral-100 overflow-hidden relative">
{/* Desktop sidebar — fixed glass overlay (for the background blur) */}
 {sidebarOpen && (
 <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[272px]">
 <Sidebar {...sidebarProps} onSelect={selectChat} onOpenSettings={openSettings} onClose={() => setSidebarOpen(false)} />
 </aside>
 )}


 {/* Mobile drawer */}
 {mobileSidebar && (
 <div className="md:hidden fixed inset-0 z-50 flex">
 <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileSidebar(false)} />
 <div className="relative w-[300px] max-w-[85vw] h-full z-10 shadow-2xl">
 <Sidebar
 {...sidebarProps}
 mobile
 onSelect={selectChat}
 onNew={() => {
 createNewChat();
 setMobileSidebar(false);
 }}
 onOpenSettings={() => {
 setMobileSidebar(false);
 openSettings();
 }}
 onClose={() => setMobileSidebar(false)}
 />
 </div>
 </div>
 )}

 <div className={`flex-1 min-w-0 flex relative transition-[padding] duration-200 ${sidebarOpen ? "md:pl-[272px]" : ""}`}>
      <main className="flex-1 min-w-0 flex flex-col relative">
 {/* Header olib tashlandi: mobil menyu + sidebar yopiqda ochish — suzuvchi tugmalar */}
 <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
 <button onClick={() => setMobileSidebar(true)} className={`md:hidden ${iconBtn}`} title="Menu">
 <PanelLeft className="w-[18px] h-[18px]" />
 </button>
 {!sidebarOpen && (
 <button
 onClick={() => setSidebarOpen(true)}
 className={`group relative hidden md:inline-flex ${iconBtn}`}
 title="Open sidebar"
 >
 <Image
 src="/logo-white.svg"
 alt="MR AI"
 width={20}
 height={20}
 className="transition-opacity duration-150 group-hover:opacity-0"
 />
 <PanelLeft className="absolute w-[18px] h-[18px] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
 </button>
 )}
 </div>

 {notFound && (
 <div className={`mx-auto mt-1 mb-1 w-full ${chatMax} px-4`}>
 <div className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-neutral-300">
 <span>This chat was not found or does not belong to your account.</span>
 <button onClick={() => setNotFound(false)} className="text-neutral-500 hover:text-white cursor-pointer">
 Close
 </button>
 </div>
 </div>
 )}

 {chatLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
              </div>
            ) : empty ? (
 <div className="flex-1 overflow-y-auto">
 <div className="min-h-full flex flex-col items-center justify-center px-4 pb-28">
 <div className={`w-full ${chatMax} fade-up`}>
 <div className="flex items-center justify-center gap-3.5 mb-8">
 <Image src="/logo-white.svg" alt="MR AI" width={34} height={34} className="shrink-0" />
 <h1 className="brand-font text-[22px] sm:text-[26px] leading-tight text-neutral-100">
 <TypedText text={`${greeting}${firstName ? `, ${firstName}` : ""}`} />
 </h1>
 </div>
 {composer(true)}
 <div className="flex flex-wrap justify-center gap-2 mt-5">
 {suggestions.map((s) => {
 const Icon = s.icon;
 return (
 <button
 key={s.title}
 onClick={() => sendMessage(s.prompt)}
 className="inline-flex items-center gap-2 h-9 px-3.5 border border-white/10 text-[13.5px] text-neutral-400 hover:text-white hover:border-white/25 hover:bg-white/[0.04] transition cursor-pointer"
 >
 <Icon className="w-3.5 h-3.5" />
 {s.title}
 </button>
 );
 })}
 </div>
 </div>
 </div>
 </div>
 ) : (
 <>
 <div ref={chatScrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto [overflow-anchor:none]">
 <div className={`${chatMax} mx-auto px-4 pt-4 pb-10 space-y-8`}>
 {messages.map((msg, index) => (
 <MessageView
 key={msg.id}
 msg={msg}
 isLast={index === messages.length - 1}
 isStreaming={isStreaming}
 copied={copiedMessageId === msg.id}
 fontSizeClass={fontSizeClass}
 onCopy={copyResponse}
 onRegenerate={regenerateResponse}
 canEdit={
 !isStreaming &&
 msg.role === "user" &&
 messages.map((m) => m.role).lastIndexOf("user") === index
 }
 onEditSubmit={editUserMessage}
 onOpenSettings={openSettings}
 onOpenFile={(f) => changeOpenFile(openFile && openFile.path === f.path ? null : f)}
 />
 ))}
 <QueuedMessages
 items={queue}
 paused={!isStreaming}
 fontSizeClass={fontSizeClass}
 onSendNow={(id) => queueApi({ action: "send-now", id })}
 onRemove={(id) => queueApi({ action: "remove", id })}
 />
 <div ref={messagesEndRef} />
 </div>
 </div>

 {isScrolledUp && (
 <button
 onClick={scrollToBottom}
 className="absolute left-1/2 -translate-x-1/2 bottom-[7.5rem] z-30 h-9 w-9 bg-[#111] border border-white/15 text-neutral-300 hover:text-white shadow-xl transition cursor-pointer flex items-center justify-center"
 title="Scroll to bottom"
 >
 <ArrowDown className="w-4 h-4" />
 </button>
 )}

 <div className="shrink-0 px-4 pb-3 pt-1 bg-gradient-to-t from-black via-black to-transparent">
 <div className={`${chatMax} mx-auto`}>
 {composer(false)}
 </div>
 </div>
 </>
 )}
 </main>

         <FilePanel file={openFile} onClose={() => changeOpenFile(null)} width={filePanelWidth} onWidthChange={setFilePanelWidthPersist} />
      </div>

      <SettingsModal
 open={settingsOpen}
 tab={settingsTab}
 onTabChange={changeSettingsTab}
 onClose={() => {
 closeSettings();
 loadDefaultKey();
 }}
 />
 </div>
 );
}
