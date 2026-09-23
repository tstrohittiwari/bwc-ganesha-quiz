// Browser-only sound effects. Files live in /public; names must match exactly.
const FILES = {
  start: "/start.mp3",
  question: "/Question.mp3",
  tick: "/clock tick.mp3",
  heartbeat: "/heartbeat.mp3",
  winner: "/winner.mp3",
  wrong1: "/wrong 1.mp3",
  wrong2: "/wrong 2.mp3",
  wrong3: "/wrong 3.mp3",
  wrong4: "/wrong 4.mp3",
  wrong5: "/wrong 5.mp3",
  wrong6: "/wrong 6.mp3",
} as const;

export type SoundName = keyof typeof FILES;
type LoopName = "tick" | "heartbeat";
const LOOPS: LoopName[] = ["tick", "heartbeat"];
const WRONG_SOUNDS = ["wrong1", "wrong2", "wrong3", "wrong4", "wrong5", "wrong6"] as const;

const cache = new Map<SoundName, HTMLAudioElement>();

function audio(name: SoundName): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = cache.get(name);
  if (!el) {
    el = new Audio(encodeURI(FILES[name]));
    el.preload = "auto";
    if (LOOPS.includes(name as LoopName)) el.loop = true;
    cache.set(name, el);
  }
  return el;
}

function stop(name: SoundName) {
  const el = cache.get(name);
  if (!el) return;
  el.pause();
  el.currentTime = 0;
}

/** Load every file up front so the first play has no delay. */
export function preloadSounds() {
  (Object.keys(FILES) as SoundName[]).forEach((name) => audio(name)?.load());
}

/** Plays a one-shot sound from the beginning. Playback errors (e.g. a missing file) are ignored. */
export function playSound(name: Exclude<SoundName, LoopName>) {
  const el = audio(name);
  if (!el) return;
  el.currentTime = 0;
  el.play().catch(() => {});
}

/** Starts the looping clock tick, cutting off the start/question sting so they don't overlap. */
export function startTick() {
  stop("start");
  stop("question");
  const el = audio("tick");
  if (el?.paused) el.play().catch(() => {});
}

export function stopTick() {
  stop("tick");
}

/** Looping heartbeat for the "Checking the answer…" screen. */
export function startHeartbeat() {
  const el = audio("heartbeat");
  if (el?.paused) el.play().catch(() => {});
}

export function stopHeartbeat() {
  stop("heartbeat");
}

let lastWrong = -1;
/** Plays one of the wrong-answer sounds at random, never the same one twice in a row. */
export function playRandomWrongSound() {
  let i = Math.floor(Math.random() * WRONG_SOUNDS.length);
  if (i === lastWrong) i = (i + 1) % WRONG_SOUNDS.length;
  lastWrong = i;
  playSound(WRONG_SOUNDS[i]);
}

/**
 * Browsers (especially phones) only allow sound after a tap. Call this from a tap handler: it briefly
 * plays every sound muted so later plays, triggered by live updates rather than taps, are allowed.
 */
export function unlockSounds(): Promise<void> {
  const all = (Object.keys(FILES) as SoundName[]).map((name) => {
    const el = audio(name);
    if (!el || !el.paused) return Promise.resolve();
    el.muted = true;
    return el
      .play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
      })
      .catch(() => {})
      .finally(() => {
        el.muted = false;
      });
  });
  return Promise.all(all).then(() => {});
}

export function isOneShotSound(name: string): name is Exclude<SoundName, LoopName> {
  return name in FILES && !LOOPS.includes(name as LoopName);
}

export function stopAllSounds() {
  cache.forEach((_, name) => stop(name));
}
