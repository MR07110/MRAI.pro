"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

// Rich Markdown, plain body text: ordinary words stay regular weight; structure comes from headings (with rules),
// lists with accent markers, striped tables, accent quote bars, inline code chips, task lists and rules.
// Dividers use neutral-* colours on purpose (the global "no borders" layer hides the white/NN ones).
const components: any = {
  table({ children }: any) {
    return (
      <div className="my-5 w-full overflow-x-auto bg-[#101010]">
        <table className="w-full text-left text-[13.5px] border-collapse m-0">{children}</table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-white/[0.1] text-white border-b-2 border-neutral-600">{children}</thead>;
  },
  tbody({ children }: any) {
    return <tbody className="[&>tr:nth-child(even)]:bg-white/[0.035] [&>tr]:border-b [&>tr]:border-neutral-800 [&>tr:last-child]:border-b-0">{children}</tbody>;
  },
  th({ children }: any) {
    return <th className="px-4 py-2.5 font-bold text-[12px] uppercase tracking-wide text-neutral-200 whitespace-nowrap">{children}</th>;
  },
  td({ children }: any) {
    return <td className="px-4 py-2.5 text-neutral-300 leading-relaxed align-top font-normal">{children}</td>;
  },
  ul({ children, className }: any) {
    const task = typeof className === "string" && className.includes("contains-task-list");
    return (
      <ul className={`my-3 space-y-1.5 ${task ? "list-none pl-1" : "pl-6 list-disc marker:text-[#4cb4f7]"}`}>{children}</ul>
    );
  },
  ol({ children }: any) {
    return <ol className="my-3 pl-6 list-decimal marker:text-[#4cb4f7] marker:font-mono space-y-1.5">{children}</ol>;
  },
  li({ children }: any) {
    return <li className="pl-1 leading-[1.75] [&>ul]:my-1.5 [&>ol]:my-1.5">{children}</li>;
  },
  input({ type, checked }: any) {
    if (type !== "checkbox") return null;
    return <input type="checkbox" checked={!!checked} readOnly className="mr-2 align-middle accent-[#4cb4f7]" />;
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="my-4 pl-4 pr-3 py-1.5 border-l-4 border-[#4cb4f7] bg-[#4cb4f7]/[0.06] text-neutral-300 [&>p]:my-1.5">
        {children}
      </blockquote>
    );
  },
  h1({ children }: any) {
    return (
      <h1 className="text-[24px] font-bold text-white mt-8 mb-3 pb-2 tracking-tight border-b-2 border-neutral-600">{children}</h1>
    );
  },
  h2({ children }: any) {
    return (
      <h2 className="text-[19px] font-bold text-white mt-7 mb-2.5 pb-1.5 tracking-tight border-b border-neutral-700">{children}</h2>
    );
  },
  h3({ children }: any) {
    return (
      <h3 className="text-[16.5px] font-bold text-white mt-6 mb-2 pl-3 border-l-4 border-[#4cb4f7]">{children}</h3>
    );
  },
  h4({ children }: any) {
    return <h4 className="text-[15px] font-bold text-neutral-100 mt-5 mb-1.5">{children}</h4>;
  },
  h5({ children }: any) {
    return <h5 className="text-[13px] font-bold uppercase tracking-wide text-neutral-400 mt-4 mb-1.5">{children}</h5>;
  },
  h6({ children }: any) {
    return <h6 className="text-[12px] font-bold uppercase tracking-wide text-neutral-500 mt-4 mb-1.5">{children}</h6>;
  },
  p({ children }: any) {
    return <p className="my-3 first:mt-0 last:mb-0 leading-[1.8] font-normal">{children}</p>;
  },
  strong({ children }: any) {
    return <strong className="font-bold text-white">{children}</strong>;
  },
  em({ children }: any) {
    return <em className="italic text-neutral-100">{children}</em>;
  },
  del({ children }: any) {
    return <del className="text-neutral-500 decoration-neutral-500">{children}</del>;
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#8fd0fb] underline decoration-[#8fd0fb]/40 underline-offset-[3px] hover:decoration-[#8fd0fb] transition"
      >
        {children}
      </a>
    );
  },
  img({ src, alt }: any) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt || ""} className="my-4 max-w-full h-auto" />;
  },
  hr() {
    return <hr className="my-7 border-0 border-t-2 border-neutral-700" />;
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const value = String(children).replace(/\n$/, "");
    if (match || value.includes("\n")) {
      return <CodeBlock language={match ? match[1] : undefined} value={value} />;
    }
    return (
      <code className="bg-white/[0.1] text-[#9bd4fb] px-1.5 py-[2px] text-[13px] font-mono font-normal" {...props}>
        {children}
      </code>
    );
  },
};

// memo so old messages are not re-parsed on every streamed token
const Md = memo(function Md({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
});

export default Md;
