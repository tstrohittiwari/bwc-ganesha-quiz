import { isPasswordSet, issueToken, verifyPassword } from "@/lib/admin-auth";

/** POST { password } — the admin password also unlocks the host controls. Returns a show-day token. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!(await isPasswordSet())) {
    return Response.json({ error: "Set the admin password first (open Admin on the laptop)." }, { status: 400 });
  }
  if (!(await verifyPassword(password))) {
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  return Response.json({ token: await issueToken("host") });
}
