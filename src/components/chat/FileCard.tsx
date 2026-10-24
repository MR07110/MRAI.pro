"use client";

import { Download, File as FileIcon, Folder, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, Globe } from "lucide-react";
import { extOf, fileUrl, fmtSize, kindOf, prefetchFile, type FileKind, type FileRef } from "./fileKind";

const ICONS: Record<FileKind, React.ComponentType<{ className?: string }>> = {
 html: Globe,
 image: FileImage,
 pdf: FileText,
 markdown: FileText,
 text: FileCode,
 video: FileVideo,
 audio: FileAudio,
 archive: FileArchive,
 dir: Folder,
 other: FileIcon,
};

export default function FileCard({ file, onOpen }: { file: FileRef; onOpen: (f: FileRef) => void }) {
 const Icon = ICONS[kindOf(file.name)];
 const label = (extOf(file.name) || "file").toUpperCase();
 return (
 <div
 role="button"
 tabIndex={0}
 onClick={() => onOpen(file)}
 onMouseEnter={() => void prefetchFile(file.path, file.name)}
 onFocus={() => void prefetchFile(file.path, file.name)}
 onTouchStart={() => void prefetchFile(file.path, file.name)}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 onOpen(file);
 }
 }}
 className="my-3 flex items-center gap-3.5 w-full min-w-0 max-w-none box-border border border-white/20 bg-black hover:bg-white/[0.04] px-3 py-3 transition cursor-pointer"
 title="Open"
 >
 <div className="h-12 w-12 shrink-0 border border-white/15 bg-[#0a0a0a] flex items-center justify-center text-neutral-400">
 <Icon className="w-5 h-5" />
 </div>
 <div className="min-w-0 flex-1">
 <div className="truncate text-[14px] font-medium text-neutral-100">{file.name}</div>
 <div className="text-[12px] text-neutral-500">
 {label}
 {file.size ? ` · ${fmtSize(file.size)}` : ""}
 </div>
 </div>
 <a
 href={fileUrl(file.path, { dl: true })}
 download={file.name}
 onClick={(e) => e.stopPropagation()}
 className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 border border-white/25 bg-transparent hover:bg-white hover:text-black text-[12px] text-white font-medium transition font-mono"
 >
 <Download className="w-3.5 h-3.5" />
 <span className="hidden sm:inline">Download</span>
 </a>
 </div>
 );
}
