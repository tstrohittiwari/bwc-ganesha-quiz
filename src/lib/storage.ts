// Server-side only: imported by API routes, never by client components.
import { promises as fs } from "fs";
import path from "path";
import {
  OPTION_KEYS,
  TIERS,
  type Difficulty,
  type Question,
  type ResultRecord,
} from "./game-config";

const DATA_DIR = path.join(process.cwd(), "data");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const LOG_DIR = path.join(DATA_DIR, "logs");
const USED_FILE = path.join(LOG_DIR, "used-questions.json");
const RESULTS_FILE = path.join(LOG_DIR, "results.json");

/** Local calendar date (YYYY-MM-DD) on this PC. */
export function localDate(d = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

// Serialise read-modify-write cycles so overlapping requests can't clobber a file.
let writeQueue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// ---------- Questions ----------

/** Reads and validates the question bank. Re-read on every call so the file can be swapped without a restart. */
export async function loadQuestions(): Promise<Question[]> {
  let raw: unknown;
  try {
    // Strip a UTF-8 BOM: Notepad/Excel often add one when saving Devanagari text.
    raw = JSON.parse((await fs.readFile(QUESTIONS_FILE, "utf8")).replace(/^﻿/, ""));
  } catch (err) {
    throw new Error(`Could not read data/questions.json: ${(err as Error).message}`);
  }
  if (!Array.isArray(raw)) throw new Error("data/questions.json must contain a JSON array");

  const problems: string[] = [];
  const seen = new Set<string>();
  raw.forEach((q, i) => {
    const where = `entry #${i + 1}${q?.id ? ` (${q.id})` : ""}`;
    if (typeof q?.id !== "string" || !q.id) problems.push(`${where}: missing "id"`);
    else if (seen.has(q.id)) problems.push(`${where}: duplicate id`);
    else seen.add(q.id);
    if (!TIERS.some((t) => t.difficulty === q?.difficulty))
      problems.push(`${where}: "difficulty" must be easy, medium or hard`);
    if (typeof q?.question !== "string" || !q.question.trim()) problems.push(`${where}: missing "question"`);
    if (!OPTION_KEYS.every((k) => typeof q?.options?.[k] === "string" && q.options[k].trim()))
      problems.push(`${where}: "options" needs non-empty A, B, C and D`);
    if (!OPTION_KEYS.includes(q?.correct)) problems.push(`${where}: "correct" must be A, B, C or D`);
  });
  if (problems.length) {
    const shown = problems.slice(0, 10).join("\n");
    const more = problems.length > 10 ? `\n…and ${problems.length - 10} more` : "";
    throw new Error(`Problems in data/questions.json:\n${shown}${more}`);
  }
  return raw as Question[];
}

// ---------- Question usage history (all days) ----------

export interface QuestionUsage {
  firstAsked: string; // local YYYY-MM-DD
  lastAsked: string;
  timesAsked: number;
}
export type UsageLog = Record<string, QuestionUsage>;

export async function readUsage(): Promise<UsageLog> {
  const raw = await readJson<unknown>(USED_FILE, {});
  // Older format kept only today's list: { date, used: [ids] }.
  if (raw && typeof raw === "object" && "used" in raw && Array.isArray((raw as { used: unknown }).used)) {
    const { date, used } = raw as { date: string; used: string[] };
    return Object.fromEntries(used.map((id) => [id, { firstAsked: date, lastAsked: date, timesAsked: 1 }]));
  }
  return (raw ?? {}) as UsageLog;
}

export function markQuestionUsed(id: string): Promise<void> {
  return withLock(async () => {
    const usage = await readUsage();
    const today = localDate();
    const prev = usage[id];
    usage[id] = {
      firstAsked: prev?.firstAsked ?? today,
      lastAsked: today,
      timesAsked: (prev?.timesAsked ?? 0) + 1,
    };
    await writeJson(USED_FILE, usage);
  });
}

export function resetQuestionUsage(): Promise<void> {
  return withLock(() => writeJson(USED_FILE, {}));
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks the questions for one contestant's run, tier by tier, in order of preference:
 * never asked on any day → asked on an earlier day but not today → already asked today.
 * Never repeats within a run. The rest of each tier's pool comes back as spares
 * (same preference order) for skips/replacements.
 */
export async function pickRunQuestions(): Promise<{ questions: Question[]; spares: Record<Difficulty, Question[]> }> {
  const [bank, usage] = await Promise.all([loadQuestions(), readUsage()]);
  const today = localDate();
  const run: Question[] = [];
  const spares: Record<Difficulty, Question[]> = { easy: [], medium: [], hard: [] };
  for (const tier of TIERS) {
    const pool = bank.filter((q) => q.difficulty === tier.difficulty);
    if (pool.length < tier.count) {
      throw new Error(
        `Not enough ${tier.difficulty} questions: need at least ${tier.count}, found ${pool.length}.`,
      );
    }
    const neverAsked = shuffle(pool.filter((q) => !usage[q.id]));
    const askedBefore = shuffle(pool.filter((q) => usage[q.id] && usage[q.id].lastAsked !== today));
    const askedToday = shuffle(pool.filter((q) => usage[q.id]?.lastAsked === today));
    const ordered = [...neverAsked, ...askedBefore, ...askedToday];
    run.push(...ordered.slice(0, tier.count));
    spares[tier.difficulty] = ordered.slice(tier.count);
  }
  return { questions: run, spares };
}

// ---------- Results ----------

export function appendResult(record: ResultRecord): Promise<void> {
  return withLock(async () => {
    const results = await readJson<ResultRecord[]>(RESULTS_FILE, []);
    results.push(record);
    await writeJson(RESULTS_FILE, results);
  });
}

/** Removes a saved result, e.g. when the host resumes an eliminated player. Returns false if not found. */
export function deleteResult(id: string): Promise<boolean> {
  return withLock(async () => {
    const results = await readJson<ResultRecord[]>(RESULTS_FILE, []);
    const kept = results.filter((r) => r.id !== id);
    if (kept.length === results.length) return false;
    await writeJson(RESULTS_FILE, kept);
    return true;
  });
}

export async function readResults(date?: string): Promise<ResultRecord[]> {
  const results = await readJson<ResultRecord[]>(RESULTS_FILE, []);
  return date ? results.filter((r) => r.date === date) : results;
}
