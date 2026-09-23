import { markQuestionUsed } from "@/lib/storage";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !body.id) {
    return Response.json({ error: "Expected { id }" }, { status: 400 });
  }
  try {
    await markQuestionUsed(body.id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
