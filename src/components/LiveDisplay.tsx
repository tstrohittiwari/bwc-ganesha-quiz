"use client";

import { useState } from "react";
import QuestionView, { formatClock, type OptionState } from "./QuestionView";
import Ladder from "./Ladder";
import { APP_NAME, APP_TAGLINE, LIFELINES, tierForIndex, type OptionKey } from "@/lib/game-config";
import type { LiveView } from "@/lib/live-game";
import { useCountdown, useLiveGame, useLiveSounds, useSoundPreference, type ConnectionStatus } from "@/lib/live-client";
import { unlockSounds } from "@/lib/sounds";

/** What the contestant (computer) and the question reader (tablet) see. No controls, no early answers. */
export default function LiveDisplay() {
  const { view, status, clockOffset } = useLiveGame();
  const [soundOn, setSoundOn] = useSoundPreference();
  const [started, setStarted] = useState(false);
  const secondsLeft = useCountdown(view, clockOffset);
  useLiveSounds(view, started && soundOn);

  function start() {
    void unlockSounds();
    setStarted(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  if (!started) {
    return (
      <main className="screen setup-screen">
        <p className="eyebrow">{APP_TAGLINE}</p>
        <h1 className="title">{APP_NAME}</h1>
        <button type="button" className="primary big-button" onClick={start}>
          Tap to start this screen
        </button>
        <p className="muted small">Turns on sound and full screen. Tap once on each device.</p>
      </main>
    );
  }

  return (
    <>
      <StageView view={view} secondsLeft={secondsLeft} />
      <ScreenCorner status={status} soundOn={soundOn} onToggleSound={() => setSoundOn(!soundOn)} />
    </>
  );
}

export function ScreenCorner({
  status,
  soundOn,
  onToggleSound,
}: {
  status: ConnectionStatus;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  return (
    <div className="screen-corner">
      <span className={`conn-dot conn-${status}`} title={status === "live" ? "Connected" : "Reconnecting…"} />
      {status !== "live" && <span className="conn-label">{status === "connecting" ? "Connecting…" : "Reconnecting…"}</span>}
      <button type="button" className="corner-button" onClick={onToggleSound} aria-label={soundOn ? "Mute" : "Unmute"}>
        {soundOn ? "🔊" : "🔇"}
      </button>
    </div>
  );
}

function optionStatesFor(view: LiveView): Partial<Record<OptionKey, OptionState>> | undefined {
  if (view.phase === "correct" && view.picked) return { [view.picked]: "correct" };
  if (view.phase === "checking" && view.picked) return { [view.picked]: "locked" };
  if (view.phase === "question" && view.selected) return { [view.selected]: "selected" };
  return undefined;
}

/** Read-only game stage. Shared by the display screen and (with controls around it) the host phone. */
export function StageView({ view, secondsLeft }: { view: LiveView | null; secondsLeft: number }) {
  if (!view) {
    return (
      <main className="screen setup-screen">
        <p className="muted">Connecting to the quiz…</p>
      </main>
    );
  }

  if (view.phase === "setup" || !view.question) {
    return (
      <main className="screen setup-screen">
        <p className="eyebrow">{APP_TAGLINE}</p>
        <h1 className="title big">{APP_NAME}</h1>
        <p className="muted">Waiting for the next contestant…</p>
      </main>
    );
  }

  if (view.phase === "over" && view.result) {
    const won = view.outcome === "won";
    const q = view.question;
    return (
      <main className={`screen over-screen ${won ? "over-won" : "over-lost"}`}>
        <p className="eyebrow">{view.contestant}</p>
        <h1 className="title big">{won ? "Winner!" : view.outcome === "timeout" ? "Time's up" : "Wrong answer"}</h1>
        {!won && view.correct && (
          <p className="reveal">
            Correct answer:{" "}
            <strong>
              {view.correct}. {q.options[view.correct]}
            </strong>
          </p>
        )}
        <p className="summary-line">
          {view.result.correctAnswers} of {view.total} correct · reached {view.result.levelReached} ·{" "}
          {formatClock(view.result.totalTimeSeconds)} total
        </p>
      </main>
    );
  }

  const tier = tierForIndex(view.index);
  const lifeline = LIFELINES.find((l) => l.id === view.lifeline);

  return (
    <main className="screen game-screen">
      <header className="game-header">
        <span className="contestant">{view.contestant}</span>
        <div className="lifelines">
          {LIFELINES.map((l) => (
            <span
              key={l.id}
              className={`lifeline lifeline-chip ${view.lifeline === l.id ? "lifeline-active" : ""} ${
                view.lifelinesUsed[l.id] && view.lifeline !== l.id ? "lifeline-spent" : ""
              }`}
            >
              <span aria-hidden>{l.icon}</span> {l.label}
            </span>
          ))}
        </div>
        <span />
      </header>

      {lifeline && (
        <div className="pause-banner" role="status">
          <span>
            <strong>{lifeline.label}</strong> in progress · timer paused
          </span>
        </div>
      )}

      <div className="game-body">
        <QuestionView
          key={view.question.id}
          question={view.question}
          index={view.index}
          secondsLeft={secondsLeft}
          secondsTotal={tier.seconds}
          paused={!!view.lifeline}
          optionsHidden={!view.optionsShown}
          hiddenOptionsSlot={<span className="muted options-waiting">Options coming up…</span>}
          optionStates={optionStatesFor(view)}
        />
        <Ladder currentIndex={view.index} />
      </div>

      {view.phase === "checking" && view.picked && (
        <div className="checking-banner" role="status" aria-live="polite">
          <div className="checking-spinner" aria-hidden />
          <div className="checking-title">Checking the answer…</div>
          <p className="correct-sub">
            Locked: {view.picked}. {view.question.options[view.picked]}
          </p>
        </div>
      )}

      {view.phase === "correct" && (
        <div className="correct-banner" role="status">
          <div className="correct-title">Correct!</div>
        </div>
      )}
    </main>
  );
}
