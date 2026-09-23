import { isHostRequest } from "@/lib/admin-auth";
import { ActionError, getLiveGame, type LiveAction } from "@/lib/live-game";

/** POST <LiveAction> — host controls. Every screen sees the result through /api/live/stream. */
export async function POST(request: Request) {
  if (!(await isHostRequest(request))) {
    return Response.json({ error: "Host sign-in required." }, { status: 401 });
  }
  const action = (await request.json().catch(() => null)) as LiveAction | null;
  if (!action || typeof action.type !== "string") {
    return Response.json({ error: "Expected an action." }, { status: 400 });
  }
  const game = getLiveGame();
  try {
    await game.dispatch(action);
    return Response.json(game.view(true));
  } catch (err) {
    const status = err instanceof ActionError ? 409 : 500;
    return Response.json({ error: (err as Error).message, view: game.view(true) }, { status });
  }
}
