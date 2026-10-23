"use client";

import { useEffect } from "react";
import { ArrowUp, ChevronDown, Key, Square } from "lucide-react";

export default function Composer({
  value,
  onChange,
  onKeyDown,
  onSend,
  onStop,
  isStreaming,
  textareaRef,
  fontSizeClass,
  modelLabel,
  onModel,
  modelMenu,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fontSizeClass: string;
  modelLabel: string | null;
  onModel: () => void;
  modelMenu?: React.ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  useEffect(() => {
    if (autoFocus && typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      textareaRef.current?.focus();
    }
  }, [autoFocus, textareaRef]);

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="w-full border border-white/20 bg-black focus-within:border-white/40 transition-colors font-mono">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (isStreaming && e.key === "Enter") {
            e.preventDefault();
            return;
          }
          onKeyDown(e);
        }}
        placeholder={placeholder || "Xabar yozing…"}
        rows={1}
        className={`block w-full resize-none bg-transparent px-5 pt-4 pb-2 ${fontSizeClass} leading-6 text-neutral-100 placeholder:text-neutral-600 max-h-[220px]`}
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
        <div className="relative z-10 min-w-0 max-w-[70%]">
        {modelMenu}
        <button
          type="button"
          onClick={onModel}
          title="Model va kalitni almashtirish"
          className="inline-flex items-center gap-1.5 max-w-full h-8 px-2.5 rounded-lg text-[12.5px] text-neutral-400 hover:text-white hover:bg-white/[0.07] transition cursor-pointer"
        >
          {modelLabel ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">{modelLabel}</span>
            </>
          ) : (
            <>
              <Key className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="text-amber-300">API kalit qo‘shish</span>
            </>
          )}
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
        </button>
        </div>

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            title="To‘xtatish"
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            title="Yuborish"
            className="w-8 h-8 bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
