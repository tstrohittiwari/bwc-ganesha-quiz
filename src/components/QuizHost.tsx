"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import QuestionView, { formatClock } from "./QuestionView";
import Ladder from "./Ladder";
import {
  playRandomWrongSound,
  playSound,
  preloadSounds,
  startHeartbeat,
  startTick,
  stopAllSounds,
  stopHeartbeat,
  stopTick,
} from "@/lib/sounds";
import {
  APP_NAME,
  APP_TAGLINE,
  CHECKING_SCREEN_MS,
  CORRECT_CHECK_CHANCE,
  LIFELINES,
  TIERS,
  TOTAL_QUESTIONS,
  tierForIndex,
  type Difficulty,
  type Lifeline,
  type OptionKey,
  type Outcome,
  type Question,
  type ResultRecord,
} from "@/lib/game-config";

type Phase =
  | { kind: "setup" }
  | { kind: "loading" }
  // Time on a question = elapsedMs + (now - runningSince). runningSince is null until the host shows
  // the options, and again while a lifeline pauses the clock.
  | {
      kind: "question";
      index: number;
      optionsShown: boolean;
      elapsedMs: number;
      runningSince: number | null;
      lifeline: Lifeline | null;
      selected: OptionKey | null; // chosen but not yet locked
    }
  // Suspense screen between locking an answer and revealing whether it was right.
  | { kind: "checking"; index: number; picked: OptionKey; secondsLeft: number; spentMs: number }
  | { kind: "correct"; index: number; picked: OptionKey; secondsLeft: number }
  // lastSpentMs lets a "replace the question" resume take that question's time back out of the total.
  | { kind: "over"; index: number; outcome: Outcome; result: PendingResult; lastSpentMs: number };

type QuestionPhase = Extract<Phase, { kind: "question" }>;
type SaveState = "saving" | "saved" | "failed";
type PendingResult = Omit<ResultRecord, "id" | "playedAt" | "date">;
type Spares = Record<Difficulty, Question[]>;

const NO_LIFELINES_USED: Record<Lifeline, boolean> = { phone: false, poll: false };
const NO_SPARES: Spares = { easy: [], medium: [], hard: [] };

// Only called from event handlers and timers, never during render.
const readClock = () => Date.now();
const rollCorrectCheck = () => Math.random() < CORRECT_CHECK_CHANCE;

function elapsedMs(p: QuestionPhase, now: number): number {
  return p.elapsedMs + (p.runningSince === null ? 0 : now - p.runningSince);
}

export default function QuizHost() {
  const [nameInput, setNameInput] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [contestant, setContestant] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [spares, setSpares] = useState<Spares>(NO_SPARES);
  const [phase, setPhaseState] = useState<Phase>({ kind: "setup" });
  const [now, setNow] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saving");
  const [savedResultId, setSavedResultId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [lifelinesUsed, setLifelinesUsed] = useState(NO_LIFELINES_USED);

  // Refs mirror values that event handlers and timers must read synchronously,
  // so a click and a timeout landing in the same tick can't both resolve a question.
  const phaseRef = useRef<Phase>(phase);
  const totalMsRef = useRef(0);

  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  /**
   * Shows the question text only; the clock waits for showOptions().
   * `sound` is false for question 1 of a run, which already has the start sting.
   */
  function askQuestion(list: Question[], index: number, sound = true) {
    if (sound) playSound("question");
    setPhase({
      kind: "question",
      index,
      optionsShown: false,
      elapsedMs: 0,
      runningSince: null,
      lifeline: null,
      selected: null,
    });
    fetch("/api/questions/used", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: list[index].id }),
    }).catch(() => {}); // best effort: only affects "prefer unused" selection
  }

  /** Swaps the question at `index` for the next spare of the same difficulty. Returns false if none are left. */
  function replaceQuestion(index: number): boolean {
    const difficulty = tierForIndex(index).difficulty;
    const [next, ...rest] = spares[difficulty];
    if (!next) return false;
    const list = [...questions];
    list[index] = next;
    setSpares({ ...spares, [difficulty]: rest });
    setQuestions(list);
    askQuestion(list, index);
    return true;
  }

  async function startRun(e: FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      setSetupError("Enter the contestant's name first.");
      return;
    }
    setSetupError(null);
    playSound("start"); // on the click itself, so the browser allows playback
    setPhase({ kind: "loading" });
    try {
      const res = await fetch("/api/game/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the game");
      totalMsRef.current = 0;
      setContestant(name);
      setQuestions(data.questions);
      setSpares(data.spares);
      setLifelinesUsed(NO_LIFELINES_USED);
      askQuestion(data.questions, 0, false);
    } catch (err) {
      stopAllSounds();
      setSetupError((err as Error).message);
      setPhase({ kind: "setup" });
    }
  }

  async function saveResult() {
    const p = phaseRef.current;
    if (p.kind !== "over") return;
    setSaveState("saving");
    setSavedResultId(null);
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.result),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSavedResultId(data.record.id);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }

  function endRun(index: number, outcome: Outcome, lastSpentMs: number) {
    const result: PendingResult = {
      name: contestant,
      outcome,
      levelReached: tierForIndex(index).difficulty,
      correctAnswers: outcome === "won" ? TOTAL_QUESTIONS : index,
      totalTimeSeconds: Math.round(totalMsRef.current / 1000),
    };
    setResumeError(null);
    setPhase({ kind: "over", index, outcome, result, lastSpentMs });
    if (outcome === "won") playSound("winner");
    else playRandomWrongSound();
    saveResult();
  }

  function showOptions() {
    const p = phaseRef.current;
    if (p.kind !== "question" || p.optionsShown) return;
    const t = readClock();
    setNow(t);
    setPhase({ ...p, optionsShown: true, runningSince: t });
  }

  /** Clicking an option only selects it; the host can change it until they lock it. */
  function selectOption(key: OptionKey) {
    const p = phaseRef.current;
    if (p.kind !== "question" || !p.optionsShown) return;
    setPhase({ ...p, selected: p.selected === key ? null : key });
  }

  function lockAnswer() {
    const p = phaseRef.current;
    if (p.kind === "question" && p.selected) resolveQuestion(p.selected);
  }

  /** `picked` null means the clock ran out (an unlocked selection doesn't count). */
  function resolveQuestion(picked: OptionKey | null) {
    const p = phaseRef.current;
    if (p.kind !== "question" || !p.optionsShown) return;
    const limitMs = tierForIndex(p.index).seconds * 1000;
    const spentMs = Math.min(elapsedMs(p, readClock()), limitMs);
    const secondsLeft = (limitMs - spentMs) / 1000;
    totalMsRef.current += spentMs;

    // A locked answer goes through the checking screen: always when wrong, sometimes when right.
    if (picked && (picked !== questions[p.index].correct || rollCorrectCheck())) {
      setPhase({ kind: "checking", index: p.index, picked, secondsLeft, spentMs });
    } else {
      revealAnswer(p.index, picked, secondsLeft, spentMs);
    }
  }

  function revealAnswer(index: number, picked: OptionKey | null, secondsLeft: number, spentMs: number) {
    if (picked !== questions[index].correct) {
      endRun(index, picked ? "wrong" : "timeout", spentMs);
    } else if (index + 1 === TOTAL_QUESTIONS) {
      endRun(index, "won", spentMs);
    } else {
      setPhase({ kind: "correct", index, picked, secondsLeft });
    }
  }

  function skipQuestion() {
    const p = phaseRef.current;
    if (p.kind !== "question" || p.lifeline) return;
    const difficulty = tierForIndex(p.index).difficulty;
    if (!window.confirm(`Skip this question? It will be replaced by a new ${difficulty} question.`)) return;
    replaceQuestion(p.index); // time on the skipped question isn't counted
  }

  /** Brings an eliminated player back (e.g. the question or its answer key was wrong). */
  async function resumePlayer(mode: "count-correct" | "replace") {
    const p = phaseRef.current;
    if (p.kind !== "over" || p.outcome === "won") return;
    const message =
      mode === "count-correct"
        ? `Resume ${contestant}? This question will count as correct and they move on to question ${p.index + 2}.`
        : `Resume ${contestant}? They get a new ${p.result.levelReached} question in place of question ${p.index + 1}.`;
    if (!window.confirm(`${message}\n\nTheir saved result will be removed.`)) return;

    setResuming(true);
    setResumeError(null);
    try {
      if (saveState === "saved" && savedResultId) {
        const res = await fetch(`/api/results?id=${encodeURIComponent(savedResultId)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) throw new Error();
      }
    } catch {
      setResumeError("Could not remove the saved result, so the player wasn't resumed. Try again.");
      setResuming(false);
      return;
    }
    setResuming(false);
    setSavedResultId(null);

    if (mode === "replace") {
      totalMsRef.current -= p.lastSpentMs;
      replaceQuestion(p.index);
    } else if (p.index + 1 === TOTAL_QUESTIONS) {
      endRun(p.index, "won", 0);
    } else {
      askQuestion(questions, p.index + 1);
    }
  }

  function startLifeline(lifeline: Lifeline) {
    const p = phaseRef.current;
    if (p.kind !== "question" || !p.optionsShown || p.lifeline || lifelinesUsed[lifeline]) return;
    const t = readClock();
    setNow(t);
    setLifelinesUsed((used) => ({ ...used, [lifeline]: true }));
    setPhase({ ...p, elapsedMs: elapsedMs(p, t), runningSince: null, lifeline });
  }

  /** Resume the clock after a lifeline. `undo` hands the lifeline back (for a misclick). */
  function endLifeline(undo = false) {
    const p = phaseRef.current;
    if (p.kind !== "question" || !p.lifeline) return;
    if (undo) setLifelinesUsed((used) => ({ ...used, [p.lifeline!]: false }));
    const t = readClock();
    setNow(t);
    setPhase({ ...p, runningSince: t, lifeline: null });
  }

  function backToSetup() {
    stopAllSounds();
    setQuestions([]);
    setSpares(NO_SPARES);
    setContestant("");
    setNameInput("");
    setResumeError(null);
    setPhase({ kind: "setup" });
  }

  function abortRun() {
    if (window.confirm("End this run now? Nothing will be saved for this contestant.")) backToSetup();
  }

  // Countdown: tick while a question's clock is running; time running out counts as a wrong answer.
  const onTick = useEffectEvent(() => {
    const p = phaseRef.current;
    if (p.kind !== "question" || p.runningSince === null) return;
    const t = readClock();
    setNow(t);
    if (elapsedMs(p, t) >= tierForIndex(p.index).seconds * 1000) resolveQuestion(null);
  });
  const ticking = phase.kind === "question" && phase.runningSince !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => onTick(), 200);
    return () => clearInterval(id);
  }, [ticking]);

  const onCheckingDone = useEffectEvent(() => {
    const p = phaseRef.current;
    if (p.kind === "checking") revealAnswer(p.index, p.picked, p.secondsLeft, p.spentMs);
  });
  const checkingIndex = phase.kind === "checking" ? phase.index : null;
  useEffect(() => {
    if (checkingIndex === null) return;
    const id = setTimeout(() => onCheckingDone(), CHECKING_SCREEN_MS);
    return () => clearTimeout(id);
  }, [checkingIndex]);

  // Heartbeat plays for exactly as long as the checking screen is up.
  useEffect(() => {
    if (checkingIndex === null) return;
    startHeartbeat();
    return stopHeartbeat;
  }, [checkingIndex]);

  // The clock tick loops exactly while the timer runs: from Show options until an answer is locked,
  // time runs out, or a lifeline pauses it (and picks up again on resume).
  useEffect(() => {
    if (ticking) startTick();
    else stopTick();
  }, [ticking]);

  useEffect(() => {
    preloadSounds();
    return stopAllSounds;
  }, []);

  // ---------- Render ----------

  if (phase.kind === "setup" || phase.kind === "loading") {
    return (
      <main className="screen setup-screen">
        <p className="eyebrow">{APP_TAGLINE}</p>
        <h1 className="title">{APP_NAME}</h1>
        <form className="setup-form" onSubmit={startRun}>
          <label htmlFor="contestant-name">Contestant name</label>
          <input
            id="contestant-name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
            autoComplete="off"
            maxLength={80}
            disabled={phase.kind === "loading"}
          />
          <button type="submit" className="primary" disabled={phase.kind === "loading"}>
            {phase.kind === "loading" ? "Starting…" : "Start"}
          </button>
          {setupError && <p className="error">{setupError}</p>}
        </form>
        <p className="rules">
          {TIERS.map((t) => `${t.count} ${t.difficulty} (${t.seconds}s)`).join(" · ")}
        </p>
        <nav className="setup-links">
          <Link href="/rankings" className="link">
            Rankings →
          </Link>
          <Link href="/admin" className="link">
            Admin →
          </Link>
        </nav>
      </main>
    );
  }

  const current = questions[phase.index];
  const tier = tierForIndex(phase.index);
  const sparesLeft = spares[tier.difficulty].length;

  if (phase.kind === "over") {
    const won = phase.outcome === "won";
    const { result } = phase;
    const busy = saveState === "saving" || resuming;
    return (
      <main className={`screen over-screen ${won ? "over-won" : "over-lost"}`}>
        <p className="eyebrow">{contestant}</p>
        <h1 className="title big">{won ? "Winner!" : phase.outcome === "timeout" ? "Time's up" : "Wrong answer"}</h1>
        {!won && (
          <p className="reveal">
            Correct answer: <strong>{current.correct}. {current.options[current.correct]}</strong>
          </p>
        )}
        <p className="summary-line">
          {result.correctAnswers} of {TOTAL_QUESTIONS} correct · reached {result.levelReached} ·{" "}
          {formatClock(result.totalTimeSeconds)} total
        </p>
        <p className={`save-status save-${saveState}`}>
          {saveState === "saving" && "Saving result…"}
          {saveState === "saved" && "Result saved."}
          {saveState === "failed" && "Could not save the result."}
        </p>
        <div className="actions">
          {saveState === "failed" && (
            <button type="button" className="primary" onClick={saveResult}>
              Retry save
            </button>
          )}
          <button
            type="button"
            className={saveState === "failed" ? "secondary" : "primary"}
            onClick={backToSetup}
            disabled={busy}
          >
            {saveState === "failed" ? "Continue without saving" : "Next contestant"}
          </button>
        </div>

        {!won && (
          <div className="resume-panel">
            <p className="resume-title">Question was faulty? Resume the player</p>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => resumePlayer("count-correct")} disabled={busy}>
                Count as correct → {phase.index + 1 === TOTAL_QUESTIONS ? "winner" : `question ${phase.index + 2}`}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => resumePlayer("replace")}
                disabled={busy || sparesLeft === 0}
                title={sparesLeft === 0 ? `No spare ${tier.difficulty} questions left` : undefined}
              >
                Replace question {phase.index + 1} with a new one
              </button>
            </div>
            {resumeError && <p className="error">{resumeError}</p>}
          </div>
        )}
      </main>
    );
  }

  const isCorrect = phase.kind === "correct";
  const isChecking = phase.kind === "checking";
  const answerLocked = isCorrect || isChecking;
  const activeLifeline = phase.kind === "question" ? phase.lifeline : null;
  const optionsHidden = phase.kind === "question" && !phase.optionsShown;
  const selected = phase.kind === "question" ? phase.selected : null;
  const secondsLeft = answerLocked
    ? phase.secondsLeft
    : Math.min(tier.seconds, tier.seconds - elapsedMs(phase, now) / 1000);

  return (
    <main className="screen game-screen">
      <header className="game-header">
        <span className="contestant">{contestant}</span>
        <div className="lifelines">
          {LIFELINES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`lifeline ${activeLifeline === l.id ? "lifeline-active" : ""}`}
              onClick={() => startLifeline(l.id)}
              disabled={answerLocked || optionsHidden || lifelinesUsed[l.id] || activeLifeline !== null}
            >
              <span aria-hidden>{l.icon}</span> {l.label}
              {lifelinesUsed[l.id] && activeLifeline !== l.id && <span className="lifeline-used">used</span>}
            </button>
          ))}
        </div>
        <div className="host-controls">
          <button
            type="button"
            className="text-button"
            onClick={skipQuestion}
            disabled={answerLocked || activeLifeline !== null || sparesLeft === 0}
            title={sparesLeft === 0 ? `No spare ${tier.difficulty} questions left` : undefined}
          >
            Skip question
          </button>
          <button type="button" className="text-button" onClick={abortRun}>
            End run
          </button>
        </div>
      </header>

      {activeLifeline && (
        <div className="pause-banner" role="status">
          <span>
            <strong>{LIFELINES.find((l) => l.id === activeLifeline)!.label}</strong> in progress · timer paused
          </span>
          <div className="pause-actions">
            <button type="button" className="primary" onClick={() => endLifeline()}>
              Resume timer
            </button>
            <button type="button" className="text-button" onClick={() => endLifeline(true)}>
              Undo (don&apos;t use lifeline)
            </button>
          </div>
        </div>
      )}

      <div className="game-body">
        <QuestionView
          key={current.id} // fresh buttons per question, so no highlight fades over from the last one
          question={current}
          index={phase.index}
          secondsLeft={secondsLeft}
          secondsTotal={tier.seconds}
          paused={activeLifeline !== null}
          optionsHidden={optionsHidden}
          hiddenOptionsSlot={
            <button type="button" className="primary big-button" onClick={showOptions}>
              Show options &amp; start timer
            </button>
          }
          onSelect={selectOption}
          disabled={answerLocked}
          optionStates={
            isCorrect
              ? { [phase.picked]: "correct" }
              : isChecking
                ? { [phase.picked]: "locked" }
                : selected
                  ? { [selected]: "selected" }
                  : undefined
          }
          footer={
            phase.kind === "question" &&
            phase.optionsShown && (
              <div className="lock-bar">
                {selected ? (
                  <>
                    <button type="button" className="primary big-button lock-button" onClick={lockAnswer}>
                      🔒 Lock answer {selected}
                    </button>
                    <span className="muted">Click another option to change, or the same one to clear.</span>
                  </>
                ) : (
                  <span className="muted">Click the contestant&apos;s answer, then lock it.</span>
                )}
              </div>
            )
          }
        />
        <Ladder currentIndex={phase.index} />
      </div>

      {isChecking && (
        <div className="checking-banner" role="status" aria-live="polite">
          <div className="checking-spinner" aria-hidden />
          <div className="checking-title">Checking the answer…</div>
          <p className="correct-sub">
            Locked: {phase.picked}. {current.options[phase.picked]}
          </p>
        </div>
      )}

      {isCorrect && (
        <div className="correct-banner" role="dialog" aria-label="Correct answer">
          <div className="correct-title">Correct!</div>
          <p className="correct-sub">
            Up next: question {phase.index + 2}
            {tierForIndex(phase.index + 1).difficulty !== tier.difficulty &&
              ` · ${tierForIndex(phase.index + 1).difficulty} round, ${tierForIndex(phase.index + 1).seconds}s`}
          </p>
          <button type="button" className="primary big-button" onClick={() => askQuestion(questions, phase.index + 1)}>
            Next question →
          </button>
        </div>
      )}
    </main>
  );
}

