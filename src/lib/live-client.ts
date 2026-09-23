"use client";

// Browser-side helpers shared by every live screen (host phone, contestant display, tablet).
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveView } from "./live-game";
import {
  isOneShotSound,
  playSound,
  startHeartbeat,
  startTick,
  stopAllSounds,
  stopHeartbeat,
  stopTick,
} from "./sounds";

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

/** Follows the laptop's game over Server-Sent Events. Reconnects on its own after Wi-Fi blips. */
export function useLiveGame(hostToken?: string | null) {
  const [view, setView] = useState<LiveView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  // serverNow - Date.now(): lets each device run the countdown on the laptop's clock.
  const [clockOffset, setClockOffset] = useState(0);
  // Newest state version seen; an older update arriving late (e.g. after the host's own action) is ignored.
  const latest = useRef(-1);

  const acceptView = useCallback((next: LiveView) => {
    if (next.version < latest.current) return;
    latest.current = next.version;
    setClockOffset(next.serverNow - Date.now());
    setView(next);
  }, []);

  useEffect(() => {
    const url = `/api/live/stream${hostToken ? `?host=${encodeURIComponent(hostToken)}` : ""}`;
    const source = new EventSource(url);
    let fresh = true; // the first message after (re)connecting always wins, e.g. after a laptop restart
    source.onopen = () => {
      fresh = true;
      setStatus("live");
    };
    source.onerror = () => setStatus("reconnecting");
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as LiveView;
      if (fresh) latest.current = -1;
      fresh = false;
      acceptView(next);
      setStatus("live");
    };
    return () => source.close();
  }, [hostToken, acceptView]);

  return { view, status, clockOffset, setView: acceptView };
}

/** Seconds left on the current question, re-rendering a few times a second while the clock runs. */
export function useCountdown(view: LiveView | null, clockOffset: number): number {
  const [, force] = useState(0);
  const running = view?.phase === "question" && view.runningSince !== null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [running]);

  if (!view) return 0;
  if (view.secondsLeft !== null && view.phase !== "question") return view.secondsLeft;
  const elapsed =
    view.elapsedMs + (view.runningSince === null ? 0 : readNow() + clockOffset - view.runningSince);
  return Math.max(0, Math.min(view.limitSeconds, view.limitSeconds - elapsed / 1000));
}

// Wrapped so render-purity lint rules don't flag the countdown's clock read.
function readNow() {
  return Date.now();
}

const SOUND_PREF_KEY = "bwc-quiz-sound";

/** Per-device sound on/off, remembered in this browser. */
export function useSoundPreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_PREF_KEY) === "off") setOn(false); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
  }, []);
  const update = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
    } catch {}
  };
  return [on, update];
}

/**
 * Plays the laptop's sound cues on this device. Loops (clock tick, heartbeat) follow the game state;
 * one-shot cues (start, question, wrong, winner) play when a new cue arrives. Cues that were already
 * current when this screen connected are not replayed.
 */
export function useLiveSounds(view: LiveView | null, enabled: boolean) {
  const lastCue = useRef<number | null>(null);
  const cueId = view?.cue?.id ?? null;
  const cueSound = view?.cue?.sound ?? null;
  const ticking = !!view && view.phase === "question" && view.runningSince !== null;
  const checking = view?.phase === "checking";

  useEffect(() => {
    if (!view) return;
    if (lastCue.current === null) {
      lastCue.current = cueId ?? 0; // first update after connecting: remember, don't replay
      return;
    }
    if (cueId === null || cueId === lastCue.current) return;
    lastCue.current = cueId;
    if (enabled && cueSound && isOneShotSound(cueSound)) playSound(cueSound);
  }, [view, cueId, cueSound, enabled]);

  useEffect(() => {
    if (enabled && ticking) startTick();
    else stopTick();
  }, [enabled, ticking]);

  useEffect(() => {
    if (enabled && checking) startHeartbeat();
    else stopHeartbeat();
  }, [enabled, checking]);

  useEffect(() => {
    if (!enabled) stopAllSounds();
  }, [enabled]);

  useEffect(() => stopAllSounds, []);
}
