import { isAdminRequest } from "@/lib/admin-auth";
import { getQuestionStats } from "@/lib/question-stats";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ error: "Admin login required." }, { status: 401 });
  try {
    return Response.json(await getQuestionStats());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
