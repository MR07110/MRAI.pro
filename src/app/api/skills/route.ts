import { NextResponse } from "next/server";
import { listSkills, SKILLS_DIR, SKILLS_PYTHON } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const skills = listSkills();
  return NextResponse.json({
    ok: true,
    root: SKILLS_DIR,
    python: SKILLS_PYTHON,
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      dir: s.dir,
      skillMd: s.skillMd,
    })),
  });
}
