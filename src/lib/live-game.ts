// Server-side only. The multi-screen game engine: one game lives on the laptop, the host phone sends
// actions, and every screen (host, contestant display, tablet) receives the same state over a live stream.
//
// The laptop is the single source of truth: it runs the timer, decides timeouts and reveals, saves
// results, and tells every device which sound to play. The correct answer never leaves the server
// until the reveal, so no screen can show it early.
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";
import {
  CHECKING_SCREEN_MS,
  CORRECT_CHECK_CHANCE,
  LIFELINES,
  OPTION_KEYS,
  TOTAL_QUESTIONS,
  tierForIndex,
  type Difficulty,
  type Lifeline,
  type OptionKey,
  type Outcome,
  type Question,
  type ResultRecord,
} from "./game-config";
import { appendResult, deleteResult, markQuestionUsed, pickRunQuestions } from "./storage";

export type LivePhase = "setup" | "question" | "checking" | "correct" | "over";
export type SoundCue = "start" | "question" | "winner" | "wrong1" | "wrong2" | "wrong3" | "wrong4" | "wrong5" | "wrong6";
export type SaveState = "saving" | "saved" | "failed";
export type PendingResult = Omit<ResultRecord, "id" | "playedAt" | "date">;

const WRONG_CUES: SoundCue[] = ["wrong1", "wrong2", "wrong3", "wrong4", "wrong5", "wrong6"];
const STATE_FILE = path.join(process.cwd(), "data", "logs", "live-game.json");
const NO_LIFELINES: Record<Lifeline, boolean> = { phone: false, poll: false };
const NO_SPARES: Record<Difficulty, Question[]> = { easy: [], medium: [], hard: [] };

interface State {
  version: number;
  phase: LivePhase;
  contestant: string;
  questions: Question[];
  spares: Record<Difficulty, Question[]>;
  index: number;
  optionsShown: boolean;
  elapsedMs: number; // time on this question before runningSince
  runningSince: number | null; // null until options are shown, and while a lifeline pauses the clock
  lifeline: Lifeline | null;
  lifelinesUsed: Record<Lifeline, boolean>;
  selected: OptionKey | null; // chosen but not locked
  picked: OptionKey | null; // locked answer
  secondsLeft: number | null; // clock frozen at lock
  spentMs: number; // time on this question when locked
  checkingUntil: number | null;
  totalMs: number;
  outcome: Outcome | null;
  result: PendingResult | null;
  saveState: SaveState | null;
  savedResultId: string | null;
  cue: { id: number; sound: SoundCue } | null;
  lastWrong: number;
}

function initialState(): State {
  return {
    version: 0,
    phase: "setup",
    contestant: "",
    questions: [],
    spares: NO_SPARES,
    index: 0,
    optionsShown: false,
    elapsedMs: 0,
    runningSince: null,
    lifeline: null,
    lifelinesUsed: NO_LIFELINES,
    selected: null,
    picked: null,
    secondsLeft: null,
    spentMs: 0,
    checkingUntil: null,
    totalMs: 0,
    outcome: null,
    result: null,
    saveState: null,
    savedResultId: null,
    cue: null,
    lastWrong: -1,
  };
}

/** What screens receive. `correct` is only filled once the answer has been revealed. */
export interface LiveView {
  version: number;
  serverNow: number;
  phase: LivePhase;
  contestant: string;
  index: number;
  total: number;
  question: Omit<Question, "correct"> | null;
  correct: OptionKey | null;
  limitSeconds: number;
  optionsShown: boolean;
  elapsedMs: number;
  runningSince: number | null;
  lifeline: Lifeline | null;
  lifelinesUsed: Record<Lifeline, boolean>;
  selected: OptionKey | null;
  picked: OptionKey | null;
  secondsLeft: number | null;
  outcome: Outcome | null;
  result: PendingResult | null;
  saveState: SaveState | null;
  cue: { id: number; sound: SoundCue } | null;
  host: { sparesLeft: number } | null; // non-null only for a signed-in host
}

export type LiveAction =
  | { type: "start"; name: string }
  | { type: "showOptions" }
  | { type: "select"; key: OptionKey }
  | { type: "lock" }
  | { type: "lifeline"; id: Lifeline }
  | { type: "endLifeline"; undo?: boolean }
  | { type: "skip" }
  | { type: "next" }
  | { type: "resume"; mode: "count-correct" | "replace" }
  | { type: "retrySave" }
  | { type: "endRun" }
  | { type: "newContestant" };

class ActionError extends Error {}

class LiveGame {
  state: State = initialState();
  readonly events = new EventEmitter();
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cueCounter = 0;
  private loaded: Promise<void>;
  private persisting: Promise<unknown> = Promise.resolve();

  constructor() {
    this.events.setMaxListeners(200);
    this.loaded = this.load();
  }

  // ---------- persistence (so a server restart mid-show doesn't lose the run) ----------

  private async load() {
    try {
      const saved = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as State;
      const now = Date.now();
      if (saved.phase === "question" && saved.runningSince !== null) saved.runningSince = now;
      if (saved.phase === "checking") saved.checkingUntil = now + CHECKING_SCREEN_MS;
      if (saved.saveState === "saving") saved.saveState = "failed"; // unknown whether it landed
      saved.cue = null;
      this.state = saved;
      this.schedule();
    } catch {
      this.state = initialState();
    }
  }

  private persist() {
    const snapshot = JSON.stringify(this.state);
    this.persisting = this.persisting.then(async () => {
      await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
      await fs.writeFile(`${STATE_FILE}.tmp`, snapshot, "utf8");
      await fs.rename(`${STATE_FILE}.tmp`, STATE_FILE);
    }).catch(() => {});
  }

  ready() {
    return this.loaded;
  }

  // ---------- views ----------

  view(asHost: boolean): LiveView {
    const s = this.state;
    const q = s.phase === "setup" ? null : s.questions[s.index] ?? null;
    const revealed = s.phase === "correct" || s.phase === "over";
    return {
      version: s.version,
      serverNow: Date.now(),
      phase: s.phase,
      contestant: s.contestant,
      index: s.index,
      total: TOTAL_QUESTIONS,
      question: q ? { id: q.id, granth: q.granth, difficulty: q.difficulty, question: q.question, options: q.options } : null,
      correct: q && revealed ? q.correct : null,
      limitSeconds: tierForIndex(Math.min(s.index, TOTAL_QUESTIONS - 1)).seconds,
      optionsShown: s.optionsShown,
      elapsedMs: s.elapsedMs,
      runningSince: s.runningSince,
      lifeline: s.lifeline,
      lifelinesUsed: s.lifelinesUsed,
      selected: s.selected,
      picked: s.picked,
      secondsLeft: s.secondsLeft,
      outcome: s.outcome,
      result: s.result,
      saveState: s.saveState,
      cue: s.cue,
      host: asHost
        ? { sparesLeft: s.phase === "setup" ? 0 : s.spares[tierForIndex(s.index).difficulty].length }
        : null,
    };
  }

  // ---------- plumbing ----------

  private changed() {
    this.state.version++;
    this.schedule();
    this.persist();
    this.events.emit("change");
  }

  private cue(sound: SoundCue) {
    this.state.cue = { id: Date.now() * 10 + (this.cueCounter++ % 10), sound };
  }

  private elapsed(now = Date.now()) {
    const s = this.state;
    return s.elapsedMs + (s.runningSince === null ? 0 : now - s.runningSince);
  }

  /** One pending timer: the question deadline, or the end of the checking screen. */
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    if (s.phase === "question" && s.runningSince !== null) {
      const remaining = tierForIndex(s.index).seconds * 1000 - this.elapsed();
      this.timer = setTimeout(() => void this.enqueue(() => this.timeUp()), Math.max(0, remaining));
    } else if (s.phase === "checking" && s.checkingUntil !== null) {
      this.timer = setTimeout(() => void this.enqueue(() => this.reveal()), Math.max(0, s.checkingUntil - Date.now()));
    }
  }

  private enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.loaded).then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  /** Runs one host action. Throws ActionError with a readable message when it doesn't apply right now. */
  dispatch(action: LiveAction): Promise<void> {
    return this.enqueue(() => this.apply(action));
  }

  // ---------- game rules ----------

  private async apply(a: LiveAction) {
    const s = this.state;
    const need = (ok: boolean, message: string) => {
      if (!ok) throw new ActionError(message);
    };

    switch (a.type) {
      case "start": {
        need(s.phase === "setup", "A run is already in progress.");
        const name = typeof a.name === "string" ? a.name.trim().slice(0, 80) : "";
        need(!!name, "Enter the contestant's name first.");
        const { questions, spares } = await pickRunQuestions();
        this.state = { ...initialState(), version: s.version, lastWrong: s.lastWrong, contestant: name, questions, spares };
        this.cue("start");
        this.ask(0);
        break;
      }
      case "showOptions":
        need(s.phase === "question" && !s.optionsShown, "Options are already showing.");
        s.optionsShown = true;
        s.runningSince = Date.now();
        break;
      case "select":
        need(s.phase === "question" && s.optionsShown, "Show the options first.");
        need(OPTION_KEYS.includes(a.key), "Unknown option.");
        s.selected = s.selected === a.key ? null : a.key;
        break;
      case "lock":
        need(s.phase === "question" && s.optionsShown && !!s.selected, "Select an answer first.");
        this.resolve(s.selected);
        break;
      case "lifeline":
        need(s.phase === "question" && s.optionsShown && !s.lifeline, "Lifelines are available once the options show.");
        need(LIFELINES.some((l) => l.id === a.id) && !s.lifelinesUsed[a.id], "That lifeline has already been used.");
        s.elapsedMs = this.elapsed();
        s.runningSince = null;
        s.lifeline = a.id;
        s.lifelinesUsed = { ...s.lifelinesUsed, [a.id]: true };
        break;
      case "endLifeline":
        need(s.phase === "question" && !!s.lifeline, "No lifeline is running.");
        if (a.undo) s.lifelinesUsed = { ...s.lifelinesUsed, [s.lifeline!]: false };
        s.lifeline = null;
        s.runningSince = Date.now();
        break;
      case "skip":
        need(s.phase === "question" && !s.lifeline, "Skip is only available on a question with no lifeline running.");
        need(this.replace(s.index), `No spare ${tierForIndex(s.index).difficulty} questions left.`);
        break;
      case "next":
        need(s.phase === "correct", "Nothing to move on from.");
        this.cue("question");
        this.ask(s.index + 1);
        break;
      case "resume": {
        need(s.phase === "over" && s.outcome !== "won", "Only an eliminated player can be resumed.");
        need(s.saveState !== "saving", "Still saving; try again in a moment.");
        if (a.mode === "replace") {
          need(s.spares[tierForIndex(s.index).difficulty].length > 0, `No spare ${tierForIndex(s.index).difficulty} questions left.`);
        }
        if (s.savedResultId) await deleteResult(s.savedResultId);
        s.savedResultId = null;
        if (a.mode === "replace") {
          s.totalMs -= s.spentMs;
          this.replace(s.index);
        } else if (s.index + 1 === TOTAL_QUESTIONS) {
          this.endRun("won");
        } else {
          this.cue("question");
          this.ask(s.index + 1);
        }
        break;
      }
      case "retrySave":
        need(s.phase === "over" && s.saveState === "failed", "Nothing to retry.");
        this.save();
        break;
      case "endRun":
        need(s.phase !== "setup", "No run in progress.");
        this.state = { ...initialState(), version: s.version, lastWrong: s.lastWrong };
        break;
      case "newContestant":
        need(s.phase === "over" && s.saveState !== "saving", "Wait for the result to save first.");
        this.state = { ...initialState(), version: s.version, lastWrong: s.lastWrong };
        break;
      default:
        throw new ActionError("Unknown action.");
    }
    this.changed();
  }

  /** Shows question `index` with options hidden and the clock stopped. */
  private ask(index: number) {
    const s = this.state;
    Object.assign(s, {
      phase: "question",
      index,
      optionsShown: false,
      elapsedMs: 0,
      runningSince: null,
      lifeline: null,
      selected: null,
      picked: null,
      secondsLeft: null,
      spentMs: 0,
      checkingUntil: null,
      outcome: null,
      result: null,
      saveState: null,
    } satisfies Partial<State>);
    void markQuestionUsed(s.questions[index].id).catch(() => {});
  }

  private replace(index: number): boolean {
    const s = this.state;
    const difficulty = tierForIndex(index).difficulty;
    const [next, ...rest] = s.spares[difficulty];
    if (!next) return false;
    s.questions = s.questions.map((q, i) => (i === index ? next : q));
    s.spares = { ...s.spares, [difficulty]: rest };
    this.cue("question");
    this.ask(index);
    return true;
  }

  private resolve(picked: OptionKey | null) {
    const s = this.state;
    const limitMs = tierForIndex(s.index).seconds * 1000;
    const spentMs = Math.min(this.elapsed(), limitMs);
    s.totalMs += spentMs;
    s.spentMs = spentMs;
    s.secondsLeft = (limitMs - spentMs) / 1000;
    s.runningSince = null;
    s.elapsedMs = spentMs;
    s.picked = picked;
    s.selected = null;
    s.lifeline = null;

    const wrong = picked !== s.questions[s.index].correct;
    if (picked && (wrong || Math.random() < CORRECT_CHECK_CHANCE)) {
      s.phase = "checking";
      s.checkingUntil = Date.now() + CHECKING_SCREEN_MS;
    } else {
      this.revealNow();
    }
  }

  private revealNow() {
    const s = this.state;
    s.checkingUntil = null;
    if (s.picked !== s.questions[s.index].correct) {
      this.endRun(s.picked ? "wrong" : "timeout");
    } else if (s.index + 1 === TOTAL_QUESTIONS) {
      this.endRun("won");
    } else {
      s.phase = "correct";
    }
  }

  private timeUp() {
    const s = this.state;
    if (s.phase !== "question" || s.runningSince === null) return;
    if (this.elapsed() < tierForIndex(s.index).seconds * 1000) return this.schedule(); // woke early
    this.resolve(null);
    this.changed();
  }

  private reveal() {
    if (this.state.phase !== "checking") return;
    this.revealNow();
    this.changed();
  }

  private endRun(outcome: Outcome) {
    const s = this.state;
    s.phase = "over";
    s.outcome = outcome;
    s.result = {
      name: s.contestant,
      outcome,
      levelReached: tierForIndex(s.index).difficulty,
      correctAnswers: outcome === "won" ? TOTAL_QUESTIONS : s.index,
      totalTimeSeconds: Math.round(s.totalMs / 1000),
    };
    if (outcome === "won") {
      this.cue("winner");
    } else {
      let i = Math.floor(Math.random() * WRONG_CUES.length);
      if (i === s.lastWrong) i = (i + 1) % WRONG_CUES.length;
      s.lastWrong = i;
      this.cue(WRONG_CUES[i]);
    }
    this.save();
  }

  private save() {
    const s = this.state;
    const result = s.result!;
    const now = new Date();
    const record: ResultRecord = {
      ...result,
      id: crypto.randomUUID(),
      playedAt: now.toISOString(),
      date: now.toLocaleDateString("en-CA"),
    };
    s.saveState = "saving";
    s.savedResultId = null;
    appendResult(record).then(
      () => this.enqueue(() => this.saveFinished(result, record.id!)),
      () => this.enqueue(() => this.saveFinished(result, null)),
    );
  }

  private saveFinished(result: PendingResult, id: string | null) {
    const s = this.state;
    if (s.phase !== "over" || s.result !== result) return; // the host already moved on
    s.saveState = id ? "saved" : "failed";
    s.savedResultId = id;
    this.changed();
  }
}

export { ActionError };

// One engine per server process (also survives dev hot-reloads).
const holder = globalThis as unknown as { __bwcLiveGame?: LiveGame };
export function getLiveGame(): LiveGame {
  if (!holder.__bwcLiveGame) holder.__bwcLiveGame = new LiveGame();
  return holder.__bwcLiveGame;
}
