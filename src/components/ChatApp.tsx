"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowDown, Code2, Compass, PanelLeft, PenTool, Sparkles, SquarePen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import * as serverDb from "@/lib/serverDb";
import SettingsModal from "./SettingsModal";
import QuickModel from "./QuickModel";
import type { Chat, Message, UserApiKey } from "@/types";
import { loadSettings, AppSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import Sidebar from "./chat/Sidebar";
import MessageView from "./chat/Message";
import Composer from "./chat/Composer";
import { parseThinkingAndContent } from "./chat/parse";

export default function ChatApp({ initialChatId = null }: { initialChatId?: string | null }) {
  const pathname = usePathname();
  const urlCheckedRef = useRef(false);
  const [notFound, setNotFound] = useState(false);
  const { user, signOut } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(initialChatId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [defaultKey, setDefaultKey] = useState<UserApiKey | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

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

  // Har bir suhbatning o'z manzili: /c/<id>  (yangi suhbat: /)
  function pushUrl(id: string | null, replace = false) {
    if (typeof window === "undefined") return;
    const url = id ? `/c/${id}` : "/";
    if (window.location.pathname === url) return;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  // Brauzerning orqaga/oldinga tugmalari yoki to'g'ridan-to'g'ri manzil o'zgarsa -- suhbat ham almashadi
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
    if (skipNextLoadRef.current && skipNextLoadRef.current === currentChatId) {
      skipNextLoadRef.current = null;
      return;
    }
    if (currentChatId) {
      loadMessages(currentChatId);
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  // Handle scroll events to detect if user scrolled up
  const handleScroll = () => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsScrolledUp(!isNearBottom);
  };

  // Auto scroll only when near bottom (ultra-smooth during streaming)
  useEffect(() => {
    if (!isScrolledUp) {
      const el = chatScrollContainerRef.current;
      if (el) {
        if (isStreaming) {
          el.scrollTop = el.scrollHeight;
        } else {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
  }, [messages, isScrolledUp, isStreaming]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsScrolledUp(false);
  };

  async function loadChats() {
    if (!user) return;
    try {
      const data = await serverDb.getChats();
      setChats(data || []);
      // Manzildagi suhbat shu hisobniki emas (yoki yo'q) bo'lsa -- hech narsa ko'rsatilmaydi, bosh sahifaga qaytiladi
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
    try {
      const data = await serverDb.getMessages(chatId);
      setMessages(data || []);
    } catch (e) {
      console.error("loadMessages error:", e);
    }
  }

  function createNewChat() {
    if (!user) return;
    if (!currentChatId || messages.length === 0) {
      setMobileSidebar(false);
      return;
    }
    if (isStreaming) {
      stopStreaming();
    }
    setCurrentChatId(null);
    setMessages([]);
    pushUrl(null);
    setMobileSidebar(false);
  }

  async function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Suhbat o‘chirilsinmi?")) return;
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

  // Edit user message (load into prompt)
  const editUserMessage = (text: string) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(autoResize, 50);
    }
  };

  // Core Send Logic via Server API (/api/chat)
  async function executeChatStream(
    chatId: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    keyToUse?: UserApiKey | null
  ) {
    let key = keyToUse || defaultKey;
    if (!key) {
      key = await loadDefaultKey();
    }
    if (!key) {
      setSettingsOpen(true);
      return;
    }

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const tempAiId = crypto.randomUUID();
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

    setMessages((prev) => [
      ...prev,
      {
        id: tempAiId,
        chat_id: chatId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      },
    ]);

    // Ultra-smooth typewriter ticker loop: reveals characters smoothly without jerky bursts
    const tickSmoothStream = (time: number) => {
      if (!isStreamingActiveRef.current) return;

      if (time - lastTickTime >= FRAME_MS) {
        lastTickTime = time;

        const target = targetTextRef.current;
        const current = displayedTextRef.current;

        if (current.length < target.length) {
          const diff = target.length - current.length;
          let step = 1;
          if (diff < 20) step = 1;
          else if (diff < 50) step = 2;
          else if (diff < 120) step = 3;
          else if (diff < 250) step = 4;
          else if (diff < 500) step = 6;
          else step = Math.ceil(diff / 25);

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

    const useAgent = appSettings.agentMode !== false;
    const isStream = useAgent || appSettings.stream !== false;

    try {
      let agentExtra: Record<string, unknown> = {};
      if (useAgent) {
        const conns = (await serverDb.getConnectors()).filter((c) => c.enabled);
        agentExtra = {
          connectors: conns.map((c) => ({ id: c.id, name: c.name, url: c.url, headers: c.headers })),
          serverUrl: serverDb.getServerBaseUrl(),
          appUrl: window.location.origin,
          keyId: key.id,
          maxSteps: appSettings.agentMaxSteps ?? 200,
        };
      }

      const res = await fetch(useAgent ? "/api/agent" : "/api/chat", {
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
      while (isStreamingActiveRef.current && displayedTextRef.current.length < targetTextRef.current.length) {
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
      if (fullFinalContent.trim()) {
        await serverDb.saveMessage(chatId, "assistant", fullFinalContent, tempAiId);
      }
    } catch (err: any) {
      isStreamingActiveRef.current = false;
      if (smoothTickerRef.current) {
        cancelAnimationFrame(smoothTickerRef.current);
        smoothTickerRef.current = null;
      }

      if (err.name === "AbortError") {
        const partial = displayedTextRef.current || targetTextRef.current;
        if (partial.trim()) {
          try {
            await serverDb.saveMessage(chatId, "assistant", partial, tempAiId);
          } catch {}
        }
      } else {
        const errorContent = `Xatolik: ${err.message || "Noma’lum xato"}`;
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
      isStreamingActiveRef.current = false;
      if (smoothTickerRef.current) {
        cancelAnimationFrame(smoothTickerRef.current);
        smoothTickerRef.current = null;
      }
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  // Send new user prompt
  async function sendMessage(promptOverride?: string) {
    const textToSend = (promptOverride || input).trim();
    if (!textToSend || isStreaming || !user) return;

    let activeKey = defaultKey;
    if (!activeKey) {
      activeKey = await loadDefaultKey();
    }
    if (!activeKey) {
      setSettingsOpen(true);
      return;
    }

    let chatId = currentChatId;

    // Create chat if not exists
    if (!chatId) {
      const newChat = await serverDb.createChat(textToSend.slice(0, 45));
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
      setSettingsOpen(true);
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

  function stopStreaming() {
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
      stopStreaming();
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
    "Foydalanuvchi";
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
      title: "Kod yozish",
      icon: Code2,
      prompt: "React va TypeScript da toza arxitekturali zamonaviy komponent yozib ber.",
    },
    {
      title: "Tushuntirish",
      icon: Sparkles,
      prompt: "Kvant kompyuterlari qanday ishlashini oddiy va tushunarli tilda tushuntirib ber.",
    },
    {
      title: "Yozish",
      icon: PenTool,
      prompt: "IT kompaniyaga ishga kirish uchun ta’sirchan va professional cover letter yozib ber.",
    },
    {
      title: "Reja tuzish",
      icon: Compass,
      prompt: "Yangi AI startapni ishga tushirish uchun 30 kunlik amaliy reja tuzib ber.",
    },
  ];

  const firstName = String(displayName).trim().split(/\s+/)[0] || "";
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Xayrli tun" : hour < 12 ? "Xayrli tong" : hour < 18 ? "Xayrli kun" : "Xayrli kech";
  const currentTitle = chats.find((c) => c.id === currentChatId)?.title || "";
  const empty = messages.length === 0;
  const modelLabel = defaultKey ? defaultKey.model : null;

  // Yuborilgach kiritish maydoni balandligini qaytaradi
  useEffect(() => {
    if (input === "") autoResize();
  }, [input]);

  const openSettings = () => {
    setSettingsOpen(true);
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

  const composer = (autoFocus: boolean) => (
    <Composer
      value={input}
      onChange={(v) => {
        setInput(v);
        autoResize();
      }}
      onKeyDown={handleKeyDown}
      onSend={() => sendMessage()}
      onStop={stopStreaming}
      isStreaming={isStreaming}
      textareaRef={textareaRef}
      fontSizeClass={fontSizeClass}
      modelLabel={modelLabel}
      onModel={() => setModelOpen(true)}
      autoFocus={autoFocus}
      placeholder={empty ? "Bugun nima qilamiz?" : "Javob yozing…"}
    />
  );

  const iconBtn =
    "h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.07] transition cursor-pointer";

  return (
    <div className="h-[100dvh] flex bg-black text-neutral-100 overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:block shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
          sidebarOpen ? "w-[272px] border-r border-white/[0.06]" : "w-0"
        }`}
      >
        <div className="w-[272px] h-full">
          <Sidebar {...sidebarProps} onSelect={selectChat} onOpenSettings={openSettings} onClose={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileSidebar && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileSidebar(false)} />
          <div className="relative w-[300px] max-w-[85vw] h-full border-r border-white/10 z-10">
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

      <main className="flex-1 min-w-0 flex flex-col relative">
        <header className="h-12 shrink-0 flex items-center justify-between px-2 sm:px-3">
          <div className="flex items-center gap-1 min-w-0">
            <button onClick={() => setMobileSidebar(true)} className={`md:hidden ${iconBtn}`} title="Menyu">
              <PanelLeft className="w-[18px] h-[18px]" />
            </button>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className={`group relative hidden md:inline-flex ${iconBtn}`}
                title="Yon panelni ochish"
              >
                <Image
                  src="/logo-white.png"
                  alt="MR AI"
                  width={20}
                  height={20}
                  className="transition-opacity duration-150 group-hover:opacity-0"
                />
                <PanelLeft className="absolute w-[18px] h-[18px] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              </button>
            )}
            {currentTitle && !empty && (
              <span className="ml-1.5 truncate text-[13.5px] text-neutral-400 max-w-[55vw] sm:max-w-[40vw]">{currentTitle}</span>
            )}
          </div>
          <button onClick={createNewChat} className={iconBtn} title="Yangi suhbat">
            <SquarePen className="w-[18px] h-[18px]" />
          </button>
        </header>

        {notFound && (
          <div className="mx-auto mt-1 mb-1 w-full max-w-[46rem] px-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-neutral-300">
              <span>Bu suhbat topilmadi yoki sizning hisobingizga tegishli emas.</span>
              <button onClick={() => setNotFound(false)} className="text-neutral-500 hover:text-white cursor-pointer">
                Yopish
              </button>
            </div>
          </div>
        )}

        {empty ? (
          <div className="flex-1 overflow-y-auto">
            <div className="min-h-full flex flex-col items-center justify-center px-4 pb-28">
              <div className="w-full max-w-[46rem] fade-up">
                <div className="flex items-center justify-center gap-3.5 mb-8">
                  <Image src="/logo-white.png" alt="MR AI" width={34} height={34} className="shrink-0" />
                  <h1 className="text-[28px] sm:text-[34px] leading-tight font-medium tracking-tight text-neutral-100">
                    {greeting}
                    {firstName ? `, ${firstName}` : ""}
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
                        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-white/10 text-[13.5px] text-neutral-400 hover:text-white hover:border-white/25 hover:bg-white/[0.04] transition cursor-pointer"
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
            <div ref={chatScrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
              <div className="max-w-[46rem] mx-auto px-4 pt-4 pb-10 space-y-8">
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
                    onEdit={editUserMessage}
                    onOpenSettings={openSettings}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {isScrolledUp && (
              <button
                onClick={scrollToBottom}
                className="absolute left-1/2 -translate-x-1/2 bottom-[7.5rem] z-30 h-9 w-9 rounded-full bg-[#111] border border-white/15 text-neutral-300 hover:text-white shadow-xl transition cursor-pointer flex items-center justify-center"
                title="Pastga tushish"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            )}

            <div className="shrink-0 px-4 pb-3 pt-1 bg-gradient-to-t from-black via-black to-transparent">
              <div className="max-w-[46rem] mx-auto">
                {composer(false)}
                <p className="text-center text-[11.5px] text-neutral-600 mt-2">
                  MR AI xato qilishi mumkin. Muhim ma’lumotni tekshirib ko‘ring.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      <QuickModel
        open={modelOpen}
        onClose={() => {
          setModelOpen(false);
          loadDefaultKey();
        }}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          loadDefaultKey();
        }}
      />
    </div>
  );
}
