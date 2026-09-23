import Link from "next/link";
import { APP_NAME, TOTAL_QUESTIONS, rankResults, type RankedResult } from "@/lib/game-config";
import { localDate, readResults } from "@/lib/storage";
import { formatClock } from "@/components/QuestionView";
import DeleteResultButton from "@/components/DeleteResultButton";

const OUTCOME_LABEL = { won: "Winner", wrong: "Wrong answer", timeout: "Time's up" } as const;

function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });
}

export default async function RankingsPage({ searchParams }: PageProps<"/rankings">) {
  const { date: dateParam } = await searchParams;
  const today = localDate();
  const date = typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const all = await readResults();
  const dayRanking = rankResults(all.filter((r) => r.date === date));
  const overallRanking = rankResults(all);
  const dayCount = new Set(all.map((r) => r.date)).size;
  const isToday = date === today;

  return (
    <main className="screen results-screen">
      <div className="results-head">
        <div>
          <p className="eyebrow">{APP_NAME}</p>
          <h1 className="title">Rankings</h1>
        </div>
        <Link href="/" className="button primary">
          Back to setup
        </Link>
      </div>

      <section className="ranking-section">
        <div className="section-head">
          <h2>{isToday ? "Today's ranking" : `Ranking for ${formatDay(date)}`}</h2>
          <form className="date-form">
            <input type="date" name="date" defaultValue={date} aria-label="Date" />
            <button type="submit" className="secondary">
              Show
            </button>
          </form>
        </div>
        <RankingTable rows={dayRanking} empty={`Nobody has played ${isToday ? "today" : "on this date"} yet.`} />
      </section>

      <section className="ranking-section">
        <div className="section-head">
          <h2>Overall ranking</h2>
          <span className="muted">
            {all.length} {all.length === 1 ? "player" : "players"} across {dayCount} {dayCount === 1 ? "day" : "days"}
          </span>
        </div>
        <RankingTable rows={overallRanking} showDate empty="No results yet." />
      </section>

      {all.length > 0 && (
        <div className="actions">
          <a href="/api/results?date=all&format=csv" className="button secondary">
            Download all results (CSV)
          </a>
        </div>
      )}
    </main>
  );
}

function RankingTable({ rows, showDate, empty }: { rows: RankedResult[]; showDate?: boolean; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>{showDate ? "Played" : "Time played"}</th>
            <th>Result</th>
            <th>Level reached</th>
            <th className="num">Correct</th>
            <th className="num">Total time</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const played = new Date(r.playedAt);
            const time = played.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              <tr key={r.id ?? r.playedAt + i} className={r.rank <= 3 ? `rank-top rank-${r.rank}` : ""}>
                <td>
                  <span className="rank">{r.rank}</span>
                </td>
                <td>{r.name}</td>
                <td>{showDate ? `${formatDay(r.date)}, ${time}` : time}</td>
                <td>{OUTCOME_LABEL[r.outcome]}</td>
                <td className="capitalize">{r.levelReached}</td>
                <td className="num">
                  {r.correctAnswers}/{TOTAL_QUESTIONS}
                </td>
                <td className="num">{formatClock(r.totalTimeSeconds)}</td>
                <td>{r.id && <DeleteResultButton id={r.id} name={r.name} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
