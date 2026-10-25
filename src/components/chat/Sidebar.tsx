"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LogOut, MoreHorizontal, PanelLeftClose, Pencil, Settings, SquarePen, Trash2, X } from "lucide-react";
import type { Chat } from "@/types";

function groupChats(chats: Chat[]) {
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
 const DAY = 86400000;
 const order = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];
 const map: Record<string, Array<{ c: Chat; t: number }>> = {};
 for (const c of chats) {
 const t = Date.parse(c.updated_at || c.created_at) || 0;
 const g =
 t >= today ? "Today" : t >= today - DAY ? "Yesterday" : t >= today - 7 * DAY ? "Previous 7 days" : t >= today - 30 * DAY ? "Previous 30 days" : "Older";
 (map[g] ||= []).push({ c, t });
 }
 return order
 .filter((g) => map[g]?.length)
 .map((g) => ({ label: g, chats: map[g].sort((a, b) => b.t - a.t).map((x) => x.c) }));
}

export default function Sidebar({
 chats,
 currentChatId,
 onSelect,
 onNew,
 onDelete,
 editingChatId,
 editingTitle,
 setEditingChatId,
 setEditingTitle,
 onSaveTitle,
 onOpenSettings,
 onSignOut,
 displayName,
 displayUsername,
 onClose,
 mobile,
}: {
 chats: Chat[];
 currentChatId: string | null;
 onSelect: (id: string) => void;
 onNew: () => void;
 onDelete: (id: string, e: React.MouseEvent) => void;
 editingChatId: string | null;
 editingTitle: string;
 setEditingChatId: (id: string | null) => void;
 setEditingTitle: (t: string) => void;
 onSaveTitle: (id: string) => void;
 onOpenSettings: () => void;
 onSignOut: () => void;
 displayName: string;
 displayUsername: string;
 onClose: () => void;
 mobile?: boolean;
}) {
 const groups = groupChats(chats);
 // Row menu (⋯): position:fixed so the scrolling list never clips it.
 const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
 useEffect(() => {
   if (!menu) return;
   const close = () => setMenu(null);
   const onKey = (e: KeyboardEvent) => {
     if (e.key === "Escape") close();
   };
   window.addEventListener("keydown", onKey);
   window.addEventListener("resize", close);
   return () => {
     window.removeEventListener("keydown", onKey);
     window.removeEventListener("resize", close);
   };
 }, [menu]);
 const menuChat = menu ? chats.find((c) => c.id === menu.id) || null : null;

 return (
 <div className="flex flex-col h-full w-full bg-[#0a0a0a] border-r border-white/15">
 <div className="flex items-center justify-between h-12 px-3 shrink-0">
 <a
 href="/"
 title="Home"
 className="flex items-center gap-2 pl-1 cursor-pointer"
 >
 <Image src="/logo-white.svg" alt="MR AI" width={20} height={20} />
 <span className="brand-font text-[15px] tracking-tight text-neutral-100">MR AI</span>
 </a>
 <button
 onClick={onClose}
 title="Close"
 className="h-8 w-8 inline-flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.07] transition cursor-pointer"
 >
 {mobile ? <X className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
 </button>
 </div>

 <div className="px-2 pt-1 pb-2 shrink-0">
 <button
 onClick={onNew}
 className="w-full flex items-center gap-2.5 h-9 px-2.5 text-[13.5px] font-medium text-neutral-200 hover:bg-white/[0.07] transition cursor-pointer"
 >
 <SquarePen className="w-4 h-4 text-neutral-400" />
 New chat
 </button>
 </div>

 <div className="flex-1 overflow-y-auto px-2 pb-3">
 {groups.length === 0 && <p className="px-3 py-6 text-xs text-neutral-600">No chats yet</p>}
 {groups.map((g) => (
 <div key={g.label} className="mb-3">
 <div className="px-2.5 pt-3 pb-1.5 text-[11px] font-medium text-neutral-600">{g.label}</div>
 {g.chats.map((chat) => (
 <div
 key={chat.id}
 onClick={() => onSelect(chat.id)}
 className={`group flex items-center gap-1 h-9 pl-2.5 pr-1.5 text-[13.5px] cursor-pointer transition ${
 currentChatId === chat.id ? "bg-white/[0.09] text-white" : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
 }`}
 >
 {editingChatId === chat.id ? (
 <form
 onSubmit={(e) => {
 e.preventDefault();
 onSaveTitle(chat.id);
 }}
 onClick={(e) => e.stopPropagation()}
 className="flex-1 min-w-0"
 >
 <input
 type="text"
 value={editingTitle}
 onChange={(e) => setEditingTitle(e.target.value)}
 onBlur={() => onSaveTitle(chat.id)}
 autoFocus
 className="w-full bg-black border border-white/20 px-1.5 py-0.5 text-[13px] text-white"
 />
 </form>
 ) : (
 <span className="truncate flex-1">{chat.title}</span>
 )}
 {editingChatId !== chat.id && (
   <button
     type="button"
     title="More"
     aria-label="Chat options"
     aria-haspopup="menu"
     onClick={(e) => {
       e.stopPropagation();
       if (menu?.id === chat.id) {
         setMenu(null);
         return;
       }
       const r = e.currentTarget.getBoundingClientRect();
       const W = 144;
       const H = 84;
       const x = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
       const y = r.bottom + 4 + H > window.innerHeight ? Math.max(8, r.top - 4 - H) : r.bottom + 4;
       setMenu({ id: chat.id, x, y });
     }}
     className={`h-7 w-7 shrink-0 inline-flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer ${
       mobile || menu?.id === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
     }`}
   >
     <MoreHorizontal className="w-4 h-4" />
   </button>
 )}
 </div>
 ))}
 </div>
 ))}
 </div>

 <div className="shrink-0 border-t border-white/[0.06] p-2">
 <div className="flex items-center gap-2.5 pl-2 pr-1 h-11 ">
 <div className="avatar-circle w-7 h-7 bg-white/10 text-white flex items-center justify-center text-[12px] font-semibold uppercase shrink-0 overflow-hidden">
 {displayName.charAt(0)}
 </div>
 <div className="flex-1 min-w-0 leading-tight">
 <p className="text-[13px] font-medium truncate text-neutral-200">{displayName}</p>
 <p className="text-[11px] text-neutral-600 truncate">@{displayUsername}</p>
 </div>
 <button
 onClick={onOpenSettings}
 title="Settings"
 className="h-8 w-8 inline-flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.07] transition cursor-pointer"
 >
 <Settings className="w-4 h-4" />
 </button>
 <button
 onClick={onSignOut}
 title="Sign out"
 className="h-8 w-8 inline-flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.07] transition cursor-pointer"
 >
 <LogOut className="w-4 h-4" />
 </button>
 </div>
 </div>
      {menu && menuChat && (
        <>
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setMenu(null)} onWheel={() => setMenu(null)} />
          <div
            role="menu"
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-[61] w-36 bg-neutral-950 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.75)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditingChatId(menuChat.id);
                setEditingTitle(menuChat.title);
                setMenu(null);
              }}
              className="w-full flex items-center gap-2.5 h-9 px-3 text-[13px] text-neutral-200 hover:bg-white/[0.09] transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-neutral-400" />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                const id = menuChat.id;
                setMenu(null);
                onDelete(id, e);
              }}
              className="w-full flex items-center gap-2.5 h-9 px-3 text-[13px] text-red-400 hover:bg-white/[0.09] transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}

 </div>
 );
}
