import { pickRunQuestions } from "@/lib/storage";

export async function POST() {
  try {
    return Response.json(await pickRunQuestions());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
