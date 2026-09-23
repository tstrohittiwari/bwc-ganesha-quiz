import { MIN_PASSWORD_LENGTH, isPasswordSet, issueToken, setPassword, verifyPassword } from "@/lib/admin-auth";

/** POST { password } — sets the password on first use, otherwise checks it. Returns { token } on success. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await isPasswordSet())) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }
    await setPassword(password);
  } else if (!(await verifyPassword(password))) {
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }

  return Response.json({ token: await issueToken() });
}
