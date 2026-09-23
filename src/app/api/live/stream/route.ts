import { isValidToken } from "@/lib/admin-auth";
import { getLiveGame } from "@/lib/live-game";

/**
 * GET /api/live/stream[?host=<token>] — Server-Sent Events. Sends the full screen state immediately and
 * again after every change. Screens never receive the correct answer before it is revealed.
 */
export async function GET(request: Request) {
  const hostToken = new URL(request.url).searchParams.get("host");
  const asHost = hostToken ? await isValidToken(hostToken, "host") : false;
  const game = getLiveGame();
  await game.ready();

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const send = () => write(`data: ${JSON.stringify(game.view(asHost))}\n\n`);
      // Tell the browser to retry quickly if Wi-Fi blips.
      write("retry: 1500\n\n");
      send();
      game.events.on("change", send);
      const ping = setInterval(() => write(": ping\n\n"), 15000);
      cleanup = () => {
        game.events.off("change", send);
        clearInterval(ping);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps the response from being compressed/buffered, so updates arrive instantly.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
