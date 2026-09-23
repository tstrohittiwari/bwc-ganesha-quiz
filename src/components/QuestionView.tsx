import type { ReactNode } from "react";
import { OPTION_KEYS, TOTAL_QUESTIONS, type OptionKey, type Question } from "@/lib/game-config";

export type OptionState = "idle" | "selected" | "locked" | "correct" | "wrong" | "reveal";

interface Props {
  question: Omit<Question, "correct">; // never needs the answer, so screens can't leak it
  index: number;
  secondsLeft: number;
  secondsTotal: number;
  paused?: boolean;
  /** Question is being read out: options stay hidden and the clock hasn't started. */
  optionsHidden?: boolean;
  /** Rendered in place of the options while they're hidden (e.g. the host's "Show options" button). */
  hiddenOptionsSlot?: ReactNode;
  /** Omit to render a read-only view (e.g. a future audience display). */
  onSelect?: (key: OptionKey) => void;
  /** Host controls shown under the options (e.g. the lock bar). */
  footer?: ReactNode;
  optionStates?: Partial<Record<OptionKey, OptionState>>;
  disabled?: boolean;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Pure presentation of one question: no game logic lives here. */
export default function QuestionView({
  question,
  index,
  secondsLeft,
  secondsTotal,
  paused,
  optionsHidden,
  hiddenOptionsSlot,
  onSelect,
  footer,
  optionStates = {},
  disabled,
}: Props) {
  const fraction = Math.max(0, Math.min(1, secondsLeft / secondsTotal));
  const stopped = paused || optionsHidden;
  const urgent = !stopped && secondsLeft <= 10;

  return (
    <div className="question-view">
      <div className="question-meta">
        <span className="question-number">
          Question {index + 1} <span className="muted">of {TOTAL_QUESTIONS}</span>
        </span>
        <span className={`tier-badge tier-${question.difficulty}`}>{question.difficulty}</span>
      </div>

      <div className={`timer ${urgent ? "timer-urgent" : ""} ${stopped ? "timer-paused" : ""}`} role="timer" aria-live="off">
        <span className="timer-clock">{formatClock(secondsLeft)}</span>
        {stopped && <span className="timer-paused-label">{paused ? "Paused" : "Not started"}</span>}
        <div className="timer-bar">
          <div className="timer-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>

      <h1 className="question-text">{question.question}</h1>

      {optionsHidden ? (
        <div className="options-hidden">{hiddenOptionsSlot}</div>
      ) : (
        <div className="options">
          {OPTION_KEYS.map((key) => {
            const state = optionStates[key] ?? "idle";
            return (
              <button
                key={key}
                type="button"
                className={`option option-${state}`}
                onClick={onSelect ? () => onSelect(key) : undefined}
                disabled={disabled || !onSelect}
              >
                <span className="option-key">{key}</span>
                <span className="option-text">{question.options[key]}</span>
              </button>
            );
          })}
        </div>
      )}
      {!optionsHidden && footer}
    </div>
  );
}
