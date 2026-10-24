"use client";

import { X } from "lucide-react";

export type QueuedItem = { id: string; text: string; createdAt: string };

// Queued messages: stored on the server; once a reply finishes, the server sends them in order itself.
export default function QueuedMessages({
  items,
  paused,
  fontSizeClass,
  onSendNow,
  onRemove,
}: {
  items: QueuedItem[];
  paused: boolean;
  fontSizeClass: string;
  onSendNow: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col items-end gap-2 w-full">
      {items.map((it, i) => (
        <div key={it.id} className="group flex flex-col items-end fade-up w-full">
          <div
            className={`relative max-w-[88%] min-w-[4rem] border border-white/10 bg-[#0c0c0c] px-4 py-2.5 ${fontSizeClass} leading-[1.7] text-neutral-300 whitespace-pre-wrap break-words`}
          >
            {it.text}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[12px] text-neutral-500">
            {paused && i === 0 && <span className="text-neutral-600">Paused</span>}
            <button onClick={() => onSendNow(it.id)} className="hover:text-white transition cursor-pointer">
              Send now
            </button>
            <button
              onClick={() => onRemove(it.id)}
              title="Remove from queue"
              className="inline-flex items-center hover:text-white transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
