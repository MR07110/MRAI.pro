"use client";

// Marks every occurrence of the search words inside `text` in yellow — used by the Skills search in Settings
// and by the "/" skill menu, so it is obvious why a row matched.
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function Highlight({ text, query, className }: { text: string; query: string; className?: string }) {
  const words = query
    .toLowerCase()
    .split(/[\s/]+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!words.length || !text) return <span className={className}>{text}</span>;
  const parts = text.split(new RegExp(`(${words.map(escapeRe).join("|")})`, "gi"));
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-300 text-black">
            {p}
          </mark>
        ) : (
          p
        )
      )}
    </span>
  );
}
