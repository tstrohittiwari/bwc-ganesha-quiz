import { TIERS, type Outcome, type ResultRecord } from "@/lib/game-config";
import { appendResult, deleteResult, localDate, readResults } from "@/lib/storage";

/** DELETE /api/results?id=… removes one saved result (used when the host resumes a player). */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Expected ?id=" }, { status: 400 });
  try {
    const removed = await deleteResult(id);
    return removed ? Response.json({ ok: true }) : Response.json({ error: "Result not found" }, { status: 404 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

const OUTCOMES: Outcome[] = ["won", "wrong", "timeout"];

/** GET /api/results?date=YYYY-MM-DD (defaults to today). Add &format=csv for a spreadsheet download. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || localDate();
  const results = await readResults(date === "all" ? undefined : date);

  if (url.searchParams.get("format") === "csv") {
    const header = ["Date", "Name", "Played at", "Outcome", "Level reached", "Correct answers", "Total time (s)"];
    const rows = results.map((r) => [
      r.date,
      r.name,
      new Date(r.playedAt).toLocaleString(),
      r.outcome,
      r.levelReached,
      r.correctAnswers,
      r.totalTimeSeconds,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    // Leading BOM so Excel reads the file as UTF-8 and Devanagari names display correctly.
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="quiz-results-${date}.csv"`,
      },
    });
  }

  return Response.json({ date, results });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const valid =
    name &&
    OUTCOMES.includes(body.outcome) &&
    TIERS.some((t) => t.difficulty === body.levelReached) &&
    Number.isInteger(body.correctAnswers) &&
    typeof body.totalTimeSeconds === "number";
  if (!valid) return Response.json({ error: "Invalid result record" }, { status: 400 });

  const now = new Date();
  const record: ResultRecord = {
    id: crypto.randomUUID(),
    name,
    playedAt: now.toISOString(),
    date: localDate(now),
    outcome: body.outcome,
    levelReached: body.levelReached,
    correctAnswers: body.correctAnswers,
    totalTimeSeconds: Math.round(body.totalTimeSeconds),
  };
  try {
    await appendResult(record);
    return Response.json({ ok: true, record });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
