import { NextResponse } from "next/server";
import { getSkillsAsync, listSkills, SKILLS_DIR, SKILLS_PYTHON } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const local = listSkills().length > 0;
  const skills = await getSkillsAsync();
  return NextResponse.json({
    ok: true,
    // Whether this came from the local filesystem or was fetched from the owner's real computer over
    // HTTP (e.g. this copy is hosted on Vercel, whose filesystem has no skills folder).
    source: local ? "local" : skills.length ? "remote" : "none",
    root: SKILLS_DIR,
    python: SKILLS_PYTHON,
    skills: skills.map((s) => ({
      name: s.name,
      category: s.category,
      description: s.description,
      dir: s.dir,
      skillMd: s.skillMd,
    })),
  });
}
