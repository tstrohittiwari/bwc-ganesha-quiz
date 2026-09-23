import { isAdminRequest } from "@/lib/admin-auth";
import { resetQuestionUsage } from "@/lib/storage";

/** POST — forgets which questions have been asked, so every question counts as "left" again. Admin only. */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ error: "Admin login required." }, { status: 401 });
  try {
    await resetQuestionUsage();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
