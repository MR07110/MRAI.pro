import { NextRequest, NextResponse } from "next/server";
import {
  getCategoryInfoAsync,
  getSkillsAsync,
  getSkillsInCategoryAsync,
  listCategoryNames,
  listSkills,
  SKILLS_DIR,
  SKILLS_PYTHON,
} from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?categories=1      -> just the category names (near-instant)
// ?category=<name>   -> only that category's skills (fast — lets the UI load one category at a time)
// (neither)          -> the full catalog (used by the composer's "/" skill picker)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const localReachable = listCategoryNames().length > 0 || listSkills().length > 0;

  if (sp.get("categories")) {
    const { names: categories, stamps } = await getCategoryInfoAsync();
    return NextResponse.json({
      ok: true,
      source: localReachable ? "local" : categories.length ? "remote" : "none",
      root: SKILLS_DIR,
      categories,
      stamps,
    });
  }

  const category = sp.get("category");
  const skills = category ? await getSkillsInCategoryAsync(category) : await getSkillsAsync();
  return NextResponse.json({
    ok: true,
    // Whether this came from the local filesystem or was fetched from the owner's real computer over
    // HTTP (e.g. this copy is hosted on Vercel, whose filesystem has no skills folder).
    source: localReachable ? "local" : skills.length ? "remote" : "none",
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
