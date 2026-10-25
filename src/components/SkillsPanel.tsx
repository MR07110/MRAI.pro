"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { Empty, SectionHead, ui } from "./ui";
import Highlight from "./Highlight";
import {
  onSkillsCacheChange,
  peekCategoryNames,
  peekSkillsInCategory,
  peekSkillsMeta,
  prefetchAllSkills,
  retrySkills,
  skillsLoadFailed,
  watchForNewSkills,
  type SkillEntry,
} from "@/lib/skillsCatalog";

// The catalog lives in a shared page-wide cache (lib/skillsCatalog.ts): Settings starts warming it the moment
// it opens, so by the time this tab is visited the rows are usually already there, and closing/reopening
// Settings never loads anything again. While this panel is open it also watches the computer, so a skill
// added there appears here by itself — only the new rows fade in, nothing else moves.
export default function SkillsPanel() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    prefetchAllSkills(); // no-op when Settings already started it
    const off = onSkillsCacheChange(bump);
    const stop = watchForNewSkills();
    return () => {
      off();
      stop();
    };
  }, []);

  const categories = peekCategoryNames();
  const failed = skillsLoadFailed();
  const meta = peekSkillsMeta();

  // Rows already present when the panel first appeared don't animate; anything that arrives later fades in.
  const seenRef = useRef<Set<string> | null>(null);
  if (seenRef.current === null) {
    const seen = new Set<string>();
    for (const c of categories || []) {
      seen.add("c:" + c);
      for (const s of peekSkillsInCategory(c) || []) seen.add("s:" + c + "/" + s.name);
    }
    seenRef.current = seen;
  }
  const seen = seenRef.current;

  const bySkill = useMemo(() => {
    const m: Record<string, SkillEntry[]> = {};
    for (const c of categories || []) {
      const l = peekSkillsInCategory(c);
      if (l) m[c] = l;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, peekSkillsInCategory]);
  const cats = categories || [];
  const allLoaded = cats.length > 0 && cats.every((c) => c in bySkill);
  const totalSkills = Object.values(bySkill).reduce((n, l) => n + l.length, 0);

  const needle = q.trim().toLowerCase();
  const groups = cats.map((cat) => {
    const list = (bySkill[cat] || []).filter((s) => !needle || (s.name + " " + s.description + " " + cat).toLowerCase().includes(needle));
    return [cat, list] as const;
  });
  const visibleGroups = needle ? groups.filter(([, list]) => list.length > 0) : groups;

  // Mark everything now on screen as seen, so it won't fade in again on the next render.
  useEffect(() => {
    for (const c of cats) {
      seen.add("c:" + c);
      for (const s of bySkill[c] || []) seen.add("s:" + c + "/" + s.name);
    }
  });

  if (categories === null && !failed) return <p className={ui.hint}>Loading skills…</p>;

  const newSkillHint =
    meta.source === "remote" || failed || meta.source === "none" ? (
      <>Add a SKILL.md on your computer, under <span className="font-mono">~/MR/mrai/skills</span>.</>
    ) : (
      <>Add a SKILL.md to <span className="font-mono">{meta.root || "~/MR/mrai/skills"}</span>.</>
    );

  return (
    <div>
      <SectionHead
        title="Skills"
        hint={
          <>
            Expert playbooks stored on your own computer. The AI loads a skill with its <code className="text-neutral-300">Skill</code> tool before specialised work, or when you type{" "}
            <code className="text-neutral-300">/skill-name</code>. {totalSkills}
            {allLoaded ? "" : "+"} skills · {cats.length} categories.
          </>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search skills…"
          spellCheck={false}
          autoComplete="off"
          className={`${ui.input} pl-9`}
        />
      </div>

      {failed ? (
        <Empty
          title="No skills yet"
          hint={
            <>
              Could not reach your computer to load skills. Check that it&apos;s online and reachable.{" "}
              <button type="button" onClick={retrySkills} className="underline underline-offset-2 text-neutral-300 hover:text-white cursor-pointer">
                Try again
              </button>
            </>
          }
        />
      ) : cats.length === 0 ? (
        <Empty title="No skills yet" hint={newSkillHint} />
      ) : visibleGroups.length === 0 ? (
        <Empty title="Nothing found" hint={allLoaded ? "Try another keyword." : "Still loading more skills — try again in a moment."} />
      ) : (
        <div className="space-y-2">
          {visibleGroups.map(([cat, list], idx) => {
            const isOpen = needle.length > 0 || !!open[cat];
            const catLoading = !(cat in bySkill);
            const catIsNew = !seen.has("c:" + cat);
            return (
              <div
                key={cat}
                className={`${ui.card} ${catIsNew ? "fade-up" : ""}`}
                style={catIsNew ? { animationDelay: `${Math.min(idx * 30, 400)}ms` } : undefined}
              >
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))}
                  className="w-full flex items-center gap-2 h-10 px-3.5 text-left cursor-pointer hover:bg-white/[0.04] transition"
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-[13px] text-neutral-100">
                    <Highlight text={cat} query={q} />
                  </span>
                  {catLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-neutral-600 animate-spin" />
                  ) : (
                    <span className="text-[11px] font-mono text-neutral-500">{list.length}</span>
                  )}
                </button>
                {isOpen && (
                  // A category can hold hundreds of skills (e.g. ai-agents: 245) — keep the expanded list
                  // inside its own scrollable box, with real height, instead of growing the whole page.
                  <ul className="border-t border-white/15 divide-y divide-white/10 max-h-80 overflow-y-auto">
                    {catLoading ? (
                      <li className="px-3.5 py-3 text-[12px] text-neutral-500 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                      </li>
                    ) : (
                      list.map((s) => (
                        <li key={cat + "/" + s.name} className={`px-3.5 py-3 ${seen.has("s:" + cat + "/" + s.name) ? "" : "fade-up"}`}>
                          <span className="text-[13px] font-medium text-neutral-100 font-mono">
                            /<Highlight text={s.name} query={q} />
                          </span>
                          <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">
                            <Highlight text={s.description} query={q} />
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className={`${ui.hint} mt-5`}>
        {meta.source === "local" ? (
          <>New skill: <span className="font-mono text-neutral-400">{meta.root || "~/MR/mrai/skills"}/&lt;category&gt;/&lt;name&gt;/SKILL.md</span>. </>
        ) : (
          <>New skill (on your computer): <span className="font-mono text-neutral-400">~/MR/mrai/skills/&lt;category&gt;/&lt;name&gt;/SKILL.md</span>. </>
        )}
        Skills live only on your computer and never go to GitHub.
      </p>
    </div>
  );
}
