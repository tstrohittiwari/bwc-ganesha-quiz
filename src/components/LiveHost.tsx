"use client";

import { useEffect, useState, type FormEvent } from "react";
import QuestionView, { formatClock, type OptionState } from "./QuestionView";
import { ScreenCorner } from "./LiveDisplay";
import { APP_NAME, LIFELINES, TIERS, tierForIndex, type OptionKey } from "@/lib/game-config";
import type { LiveAction, LiveView } from "@/lib/live-game";
import { useCountdown, useLiveGame, useLiveSounds, useSoundPreference } from "@/lib/live-client";
import { unlockSounds } from "@/lib/sounds";

const TOKEN_KEY = "bwc-host-token";

function readStoredToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token && Number(token.split(".")[0]) > Date.now() ? token : null;
  } catch {
    return null;
  }
}

export default function LiveHost() {
  const [token, setToken] = useState<string | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(readStoredToken()); // eslint-disable-line react-hooks/set-state-in-effect
    setCheckedStorage(true);
  }, []);

  function signOut() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
    setToken(null);
  }

  // Rendered on the server too, so the phone never shows a blank page while the controls load.
  if (!checkedStorage) {
    return (
      <main className="screen setup-screen host-screen">
        <p className="eyebrow">Host controls</p>
        <h1 className="title">{APP_NAME}</h1>
        <p className="muted">Loading…</p>
        <p className="muted small">
          If this doesn&apos;t change within a few seconds, make sure the laptop was started with{" "}
          <code>npm run quiz</code>, and that this phone is on the same Wi-Fi.
        </p>
      </main>
    );
  }
  if (!token) {
    return (
      <HostLogin
        onSignedIn={(t) => {
          try {
            localStorage.setItem(TOKEN_KEY, t);
          } catch {}
          setToken(t);
        }}
      />
    );
  }
  return <HostConsole token={token} onSignOut={signOut} />;
}

function HostLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    void unlockSounds();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/host/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not sign in.");
      onSignedIn(data.token);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="screen setup-screen host-screen">
      <p className="eyebrow">Host controls</p>
      <h1 className="title">{APP_NAME}</h1>
      <form className="setup-form" onSubmit={submit}>
        <label htmlFor="host-password">Admin password</label>
        <input
          id="host-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={busy}
        />
        <button type="submit" className="primary" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function HostConsole({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const { view, status, clockOffset, setView } = useLiveGame(token);
  const [soundOn, setSoundOn] = useSoundPreference();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const secondsLeft = useCountdown(view, clockOffset);
  useLiveSounds(view, soundOn);

  // The stream only includes host details for a valid token; without them the sign-in has expired.
  const signedOut = !!view && view.host === null;
  useEffect(() => {
    if (signedOut) onSignOut();
  }, [signedOut, onSignOut]);

  async function act(action: LiveAction, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    void unlockSounds();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/live/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(action),
      });
      if (res.status === 401) return onSignOut();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That didn't work.");
        if (data.view) setView(data.view);
      } else {
        setView(data); // don't wait for the stream to show our own action
      }
    } catch {
      setError("Can't reach the laptop. Check the Wi-Fi.");
    } finally {
      setBusy(false);
    }
  }

  const corner = <ScreenCorner status={status} soundOn={soundOn} onToggleSound={() => setSoundOn(!soundOn)} />;
  const errorBar = error && (
    <div className="host-error" role="alert" onClick={() => setError(null)}>
      {error}
    </div>
  );

  if (!view) {
    return (
      <main className="screen setup-screen host-screen">
        <p className="muted">Connecting to the laptop…</p>
        {corner}
      </main>
    );
  }

  if (view.phase === "setup") {
    return (
      <main className="screen setup-screen host-screen">
        <p className="eyebrow">Host controls</p>
        <h1 className="title">{APP_NAME}</h1>
        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: "start", name: nameInput }).then(() => setNameInput(""));
          }}
        >
          <label htmlFor="contestant-name">Contestant name</label>
          <input
            id="contestant-name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoComplete="off"
            maxLength={80}
            disabled={busy}
          />
          <button type="submit" className="primary" disabled={busy || !nameInput.trim()}>
            {busy ? "Starting…" : "Start"}
          </button>
        </form>
        <p className="rules">{TIERS.map((t) => `${t.count} ${t.difficulty} (${t.seconds}s)`).join(" · ")}</p>
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
        {errorBar}
        {corner}
      </main>
    );
  }

  if (view.phase === "over" && view.result && view.question) {
    return <HostOver view={view} busy={busy} act={act} errorBar={errorBar} corner={corner} />;
  }

  if (!view.question) return null;
  const tier = tierForIndex(view.index);
  const sparesLeft = view.host?.sparesLeft ?? 0;
  const isQuestion = view.phase === "question";
  const optionStates: Partial<Record<OptionKey, OptionState>> | undefined =
    view.phase === "correct" && view.picked
      ? { [view.picked]: "correct" }
      : view.phase === "checking" && view.picked
        ? { [view.picked]: "locked" }
        : view.selected
          ? { [view.selected]: "selected" }
          : undefined;

  return (
    <main className="screen game-screen host-screen">
      <header className="host-top">
        <span className="contestant">{view.contestant}</span>
        <div className="host-top-actions">
          <button
            type="button"
            className="text-button"
            disabled={busy || !isQuestion || !!view.lifeline || sparesLeft === 0}
            onClick={() =>
              act({ type: "skip" }, `Skip this question? It will be replaced by a new ${tier.difficulty} question.`)
            }
          >
            Skip
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => act({ type: "endRun" }, "End this run now? Nothing will be saved for this contestant.")}
          >
            End run
          </button>
        </div>
      </header>

      <div className="lifelines host-lifelines">
        {LIFELINES.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`lifeline ${view.lifeline === l.id ? "lifeline-active" : ""}`}
            disabled={busy || !isQuestion || !view.optionsShown || view.lifelinesUsed[l.id] || !!view.lifeline}
            onClick={() => act({ type: "lifeline", id: l.id })}
          >
            <span aria-hidden>{l.icon}</span> {l.label}
            {view.lifelinesUsed[l.id] && view.lifeline !== l.id && <span className="lifeline-used">used</span>}
          </button>
        ))}
      </div>

      {view.lifeline && (
        <div className="pause-banner" role="status">
          <span>
            <strong>{LIFELINES.find((l) => l.id === view.lifeline)!.label}</strong> · timer paused
          </span>
          <div className="pause-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => act({ type: "endLifeline" })}>
              Resume timer
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => act({ type: "endLifeline", undo: true })}
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <QuestionView
        key={view.question.id}
        question={view.question}
        index={view.index}
        secondsLeft={secondsLeft}
        secondsTotal={tier.seconds}
        paused={!!view.lifeline}
        optionsHidden={!view.optionsShown}
        hiddenOptionsSlot={
          <button type="button" className="primary big-button" disabled={busy} onClick={() => act({ type: "showOptions" })}>
            Show options &amp; start timer
          </button>
        }
        onSelect={isQuestion ? (key) => act({ type: "select", key }) : undefined}
        disabled={busy || !isQuestion}
        optionStates={optionStates}
        footer={
          isQuestion && (
            <div className="lock-bar host-lock-bar">
              {view.selected ? (
                <button type="button" className="primary big-button lock-button" disabled={busy} onClick={() => act({ type: "lock" })}>
                  🔒 Lock answer {view.selected}
                </button>
              ) : (
                <span className="muted">Tap the contestant&apos;s answer, then lock it.</span>
              )}
            </div>
          )
        }
      />

      {view.phase === "checking" && view.picked && (
        <div className="checking-banner" role="status">
          <div className="checking-spinner" aria-hidden />
          <div className="checking-title">Checking…</div>
          <p className="correct-sub">
            Locked: {view.picked}. {view.question.options[view.picked]}
          </p>
        </div>
      )}

      {view.phase === "correct" && (
        <div className="correct-banner" role="dialog" aria-label="Correct answer">
          <div className="correct-title">Correct!</div>
          <p className="correct-sub">
            Up next: question {view.index + 2}
            {tierForIndex(view.index + 1).difficulty !== tier.difficulty &&
              ` · ${tierForIndex(view.index + 1).difficulty} round, ${tierForIndex(view.index + 1).seconds}s`}
          </p>
          <button type="button" className="primary big-button" disabled={busy} onClick={() => act({ type: "next" })}>
            Next question →
          </button>
        </div>
      )}

      {errorBar}
      {corner}
    </main>
  );
}

function HostOver({
  view,
  busy,
  act,
  errorBar,
  corner,
}: {
  view: LiveView;
  busy: boolean;
  act: (action: LiveAction, confirmText?: string) => Promise<void>;
  errorBar: React.ReactNode;
  corner: React.ReactNode;
}) {
  const result = view.result!;
  const question = view.question!;
  const won = view.outcome === "won";
  const saving = view.saveState === "saving";
  const last = view.index + 1 === view.total;
  const sparesLeft = view.host?.sparesLeft ?? 0;

  return (
    <main className={`screen over-screen host-screen ${won ? "over-won" : "over-lost"}`}>
      <p className="eyebrow">{view.contestant}</p>
      <h1 className="title big">{won ? "Winner!" : view.outcome === "timeout" ? "Time's up" : "Wrong answer"}</h1>
      {!won && view.correct && (
        <p className="reveal">
          Correct answer:{" "}
          <strong>
            {view.correct}. {question.options[view.correct]}
          </strong>
        </p>
      )}
      <p className="summary-line">
        {result.correctAnswers} of {view.total} correct · reached {result.levelReached} ·{" "}
        {formatClock(result.totalTimeSeconds)} total
      </p>
      <p className={`save-status save-${view.saveState}`}>
        {saving && "Saving result…"}
        {view.saveState === "saved" && "Result saved."}
        {view.saveState === "failed" && "Could not save the result."}
      </p>
      <div className="actions">
        {view.saveState === "failed" && (
          <button type="button" className="primary" disabled={busy} onClick={() => act({ type: "retrySave" })}>
            Retry save
          </button>
        )}
        <button
          type="button"
          className={view.saveState === "failed" ? "secondary" : "primary"}
          disabled={busy || saving}
          onClick={() =>
            act(
              { type: "newContestant" },
              view.saveState === "failed" ? "Continue without saving this result?" : undefined,
            )
          }
        >
          {view.saveState === "failed" ? "Continue without saving" : "Next contestant"}
        </button>
      </div>

      {!won && (
        <div className="resume-panel">
          <p className="resume-title">Question was faulty? Resume the player</p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || saving}
              onClick={() =>
                act(
                  { type: "resume", mode: "count-correct" },
                  `Resume ${view.contestant}? This question counts as correct${
                    last ? " and they win." : ` and they move on to question ${view.index + 2}.`
                  }\n\nTheir saved result will be removed.`,
                )
              }
            >
              Count as correct → {last ? "winner" : `question ${view.index + 2}`}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || saving || sparesLeft === 0}
              onClick={() =>
                act(
                  { type: "resume", mode: "replace" },
                  `Resume ${view.contestant}? They get a new ${result.levelReached} question in place of question ${
                    view.index + 1
                  }.\n\nTheir saved result will be removed.`,
                )
              }
            >
              Replace question {view.index + 1}
            </button>
          </div>
        </div>
      )}
      {errorBar}
      {corner}
    </main>
  );
}
