import { geminiHealth } from "@/lib/ai/gemini";
import { diagnoseGoogleAds } from "@/lib/blog/keywords/google-ads";
import { getCurrentUser, isStaff } from "@/lib/auth";

/** Diagnostics for the writer agent: Gemini and Keyword Planner, live. Staff only; never returns keys. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer || !(await isStaff(viewer))) return Response.json({ error: "Not allowed." }, { status: 403 });
  const [gemini, keywordPlanner] = await Promise.all([geminiHealth(), diagnoseGoogleAds()]);
  return Response.json({ gemini, keywordPlanner }, { headers: { "Cache-Control": "no-store" } });
}
