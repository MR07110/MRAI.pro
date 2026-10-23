"use client";

import Image from "next/image";
import { LogOut, PanelLeftClose, Pencil, Settings, SquarePen, Trash2, X } from "lucide-react";
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

 return (
 <div className="flex flex-col h-full w-full bg-[#0a0a0a] border-r border-white/15">
 <div className="flex items-center justify-between h-12 px-3 shrink-0">
 <a
 href="/"
 title="Home"
 className="flex items-center gap-2 pl-1 cursor-pointer"
 >
 <Image src="/logo-white.png" alt="MR AI" width={20} height={20} />
 <span className="text-[15px] font-semibold tracking-tight text-neutral-100">MR AI</span>
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
 <div
 className={`flex items-center shrink-0 transition-opacity ${
 mobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
 }`}
 >
 <button
 type="button"
 title="Rename"
 onClick={(e) => {
 e.stopPropagation();
 setEditingChatId(chat.id);
 setEditingTitle(chat.title);
 }}
 className="h-7 w-7 inline-flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 transition cursor-pointer"
 >
 <Pencil className="w-3.5 h-3.5" />
 </button>
 <button
 type="button"
 title="Delete"
 onClick={(e) => onDelete(chat.id, e)}
 className="h-7 w-7 inline-flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-white/10 transition cursor-pointer"
 >
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 </div>
 )}
 </div>
 ))}
 </div>
 ))}
 </div>

 <div className="shrink-0 border-t border-white/[0.06] p-2">
 <div className="flex items-center gap-2.5 pl-2 pr-1 h-11 ">
 <div className="w-7 h-7 bg-white/10 text-white flex items-center justify-center text-[12px] font-semibold uppercase shrink-0">
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
 </div>
 );
}
