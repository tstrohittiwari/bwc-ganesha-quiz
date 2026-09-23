// Server-side only: question usage counts for the Admin page.
import { MAX_CONTESTANTS_PER_DAY, TIERS, type Difficulty, type Question } from "./game-config";
import { loadQuestions, localDate, readUsage, type UsageLog } from "./storage";

export interface Counts {
  total: number;
  asked: number; // asked on any day
  askedToday: number;
  left: number; // never asked
}

export interface TierStats extends Counts {
  difficulty: Difficulty;
  perDay: number; // most one day could use: contestants × questions in the tier
  fullDaysLeft: number;
  low: boolean;
  byGranth: Record<string, Counts>;
}

export interface QuestionStats {
  overall: Counts;
  granths: string[];
  tiers: TierStats[];
  contestantsPerDay: number;
}

function count(questions: Question[], usage: UsageLog, today: string): Counts {
  const asked = questions.filter((q) => usage[q.id]).length;
  return {
    total: questions.length,
    asked,
    askedToday: questions.filter((q) => usage[q.id]?.lastAsked === today).length,
    left: questions.length - asked,
  };
}

export async function getQuestionStats(): Promise<QuestionStats> {
  const [bank, usage] = await Promise.all([loadQuestions(), readUsage()]);
  const today = localDate();
  const granthOf = (q: Question) => q.granth || "Other";
  const granths = [...new Set(bank.map(granthOf))];

  return {
    overall: count(bank, usage, today),
    granths,
    contestantsPerDay: MAX_CONTESTANTS_PER_DAY,
    tiers: TIERS.map((tier) => {
      const inTier = bank.filter((q) => q.difficulty === tier.difficulty);
      const c = count(inTier, usage, today);
      const perDay = tier.count * MAX_CONTESTANTS_PER_DAY;
      return {
        ...c,
        difficulty: tier.difficulty,
        perDay,
        fullDaysLeft: Math.floor(c.left / perDay),
        low: c.left < perDay,
        byGranth: Object.fromEntries(
          granths.map((g) => [g, count(inTier.filter((q) => granthOf(q) === g), usage, today)]),
        ),
      };
    }),
  };
}
