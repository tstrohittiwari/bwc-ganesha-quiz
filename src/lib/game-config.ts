export type Difficulty = "easy" | "medium" | "hard";
export type OptionKey = "A" | "B" | "C" | "D";

export const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

export interface Question {
  id: string;
  granth?: string; // source text (e.g. महाभारत / रामायण); informational only
  difficulty: Difficulty;
  question: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
}

export interface Tier {
  difficulty: Difficulty;
  count: number;
  seconds: number;
}

// Order matters: questions are asked tier by tier, top to bottom.
export const TIERS: Tier[] = [
  { difficulty: "easy", count: 7, seconds: 60 },
  { difficulty: "medium", count: 5, seconds: 120 },
  { difficulty: "hard", count: 4, seconds: 180 },
];

export const TOTAL_QUESTIONS = TIERS.reduce((sum, t) => sum + t.count, 0);

/** Tier for a 0-based question index. */
export function tierForIndex(index: number): Tier {
  let offset = 0;
  for (const tier of TIERS) {
    if (index < offset + tier.count) return tier;
    offset += tier.count;
  }
  throw new Error(`Question index ${index} is out of range`);
}

export const APP_NAME = "BWC Ganesha Quiz";
export const APP_TAGLINE = "Questions from the Mahabharata and Ramayana";

// Suspense "Checking the answer…" screen shown after locking. Always used for wrong answers;
// used for correct answers at random with this chance (0.2 = about one in every 5).
export const CHECKING_SCREEN_MS = 3500;
export const CORRECT_CHECK_CHANCE = 0.2;

// Planning figure for the admin page: most contestants expected in one day.
export const MAX_CONTESTANTS_PER_DAY = 7;

// Lifelines are run offline by the host; the app only pauses the clock and marks them used.
export type Lifeline = "phone" | "poll";
export const LIFELINES: { id: Lifeline; label: string; icon: string }[] = [
  { id: "phone", label: "Phone a Friend", icon: "📞" },
  { id: "poll", label: "Audience Poll", icon: "👥" },
];

export type Outcome = "won" | "wrong" | "timeout";

export interface ResultRecord {
  id?: string; // missing on records saved before resume support existed
  name: string;
  playedAt: string; // ISO timestamp
  date: string; // local YYYY-MM-DD, used for "today" filtering
  outcome: Outcome;
  levelReached: Difficulty;
  correctAnswers: number;
  totalTimeSeconds: number;
}

export interface RankedResult extends ResultRecord {
  rank: number;
}

/** Most correct answers first, then fastest total time. Exact ties share a rank (1, 2, 2, 4). */
export function rankResults(results: ResultRecord[]): RankedResult[] {
  const sorted = [...results].sort(
    (a, b) =>
      b.correctAnswers - a.correctAnswers ||
      a.totalTimeSeconds - b.totalTimeSeconds ||
      a.playedAt.localeCompare(b.playedAt),
  );
  const ranked: RankedResult[] = [];
  sorted.forEach((r, i) => {
    const prev = ranked[i - 1];
    const tied = prev && prev.correctAnswers === r.correctAnswers && prev.totalTimeSeconds === r.totalTimeSeconds;
    ranked.push({ ...r, rank: tied ? prev.rank : i + 1 });
  });
  return ranked;
}
