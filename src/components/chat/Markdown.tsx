"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

const components: any = {
 table({ children }: any) {
 return (
 <div className="my-5 w-full overflow-x-auto border border-white/10">
 <table className="w-full text-left text-[13.5px] border-collapse m-0">{children}</table>
 </div>
 );
 },
 thead({ children }: any) {
 return <thead className="bg-white/[0.04] text-neutral-200">{children}</thead>;
 },
 tbody({ children }: any) {
 return <tbody className="divide-y divide-white/[0.06]">{children}</tbody>;
 },
 th({ children }: any) {
 return <th className="px-4 py-2.5 font-medium text-[12.5px] text-neutral-300 whitespace-nowrap">{children}</th>;
 },
 td({ children }: any) {
 return <td className="px-4 py-2.5 text-neutral-300 leading-relaxed align-top">{children}</td>;
 },
 ul({ children }: any) {
 return <ul className="my-3 pl-6 list-disc marker:text-neutral-600 space-y-1.5">{children}</ul>;
 },
 ol({ children }: any) {
 return <ol className="my-3 pl-6 list-decimal marker:text-neutral-500 space-y-1.5">{children}</ol>;
 },
 li({ children }: any) {
 return <li className="pl-1 leading-[1.75]">{children}</li>;
 },
 blockquote({ children }: any) {
 return <blockquote className="my-3 pl-4 border-l-2 border-white/15 text-neutral-500 [&>p]:my-1">{children}</blockquote>;
 },
 h1({ children }: any) {
 return <h1 className="text-[22px] font-semibold text-white mt-7 mb-3 tracking-tight">{children}</h1>;
 },
 h2({ children }: any) {
 return <h2 className="text-[18px] font-semibold text-white mt-6 mb-2.5 tracking-tight">{children}</h2>;
 },
 h3({ children }: any) {
 return <h3 className="text-[16px] font-semibold text-white mt-5 mb-2">{children}</h3>;
 },
 h4({ children }: any) {
 return <h4 className="text-[15px] font-semibold text-neutral-100 mt-4 mb-1.5">{children}</h4>;
 },
 p({ children }: any) {
 return <p className="my-3 first:mt-0 last:mb-0 leading-[1.8]">{children}</p>;
 },
 strong({ children }: any) {
 return <strong className="font-semibold text-white">{children}</strong>;
 },
 a({ href, children }: any) {
 return (
 <a
 href={href}
 target="_blank"
 rel="noopener noreferrer"
 className="text-white underline decoration-white/30 underline-offset-[3px] hover:decoration-white/80 transition"
 >
 {children}
 </a>
 );
 },
 hr() {
 return <hr className="my-6 border-white/10" />;
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
 <code
 className="bg-white/[0.08] text-neutral-100 px-1.5 py-[2px] text-[13px] font-mono"
 {...props}
 >
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
