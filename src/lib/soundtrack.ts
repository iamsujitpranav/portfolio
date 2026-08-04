"use client";

/**
 * One soundtrack for the whole site.
 *
 * The player used to live inside the journey overlay, which meant the <audio>
 * element was unmounted the moment anyone hit "Skip to classic view" — the
 * music cut out mid-bar, and the classic résumé had no soundtrack at all. The
 * element now lives here, outside React, so:
 *
 *   - the same track keeps playing across journey → classic and back,
 *   - the pill can be rendered in both places without two tracks overlapping,
 *   - track / volume / play state survive the overlay mounting and unmounting.
 *
 * Components read it through useSyncExternalStore.
 */

export type Track = { title: string; src: string };

export const TRACKS: Track[] = [
  { title: "Khaleja BGM", src: "/bgm/Khaleja_BGM.mp3" },
  { title: "Jersey", src: "/bgm/Jersey.mp3" },
  { title: "Interstellar · Imperial Orchestra", src: "/bgm/Interstellar_%20Imperial_Orchestra.mp3" },
];

export type SoundtrackState = {
  trackIndex: number;
  playing: boolean;
  volume: number;
};

const INITIAL: SoundtrackState = { trackIndex: 0, playing: false, volume: 0.28 };

let state: SoundtrackState = INITIAL;
let audio: HTMLAudioElement | null = null;
// The visitor pressed pause. Autoplay retries must respect that — otherwise the
// "start on first gesture" fallback below turns the music back on the next time
// they click anything on the page.
let userPaused = false;
let gestureArmed = false;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<SoundtrackState>) {
  const next = { ...state, ...patch };
  if (next.trackIndex === state.trackIndex && next.playing === state.playing && next.volume === state.volume) return;
  state = next;
  emit();
}

function element(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;
  const el = new Audio(TRACKS[state.trackIndex].src);
  el.preload = "auto";
  el.volume = state.volume;
  // Drive `playing` off the media events rather than the call sites, so an
  // autoplay rejection or an interrupted load can't leave the pill claiming to
  // be playing.
  el.addEventListener("play", () => setState({ playing: true }));
  el.addEventListener("pause", () => setState({ playing: false }));
  el.addEventListener("ended", () => step(1));
  audio = el;
  return el;
}

/** Browsers reject play() until the page has been interacted with; retry on the
 *  first gesture that isn't a click on the player itself. */
function armGesture() {
  if (gestureArmed || typeof window === "undefined") return;
  gestureArmed = true;
  const onGesture = (event: Event) => {
    // A click on the pill already routes through play()/pause() — don't let it
    // double as the autoplay retry, or pressing pause would immediately unpause.
    if (event.target instanceof Element && event.target.closest("[data-soundtrack]")) return;
    disarm();
    if (!userPaused) void play();
  };
  const disarm = () => {
    gestureArmed = false;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    window.removeEventListener("touchstart", onGesture);
  };
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);
  window.addEventListener("touchstart", onGesture);
}

export async function play() {
  const el = element();
  if (!el) return;
  userPaused = false;
  try {
    await el.play();
  } catch {
    armGesture();
  }
}

export function pause() {
  userPaused = true;
  element()?.pause();
}

export function toggle() {
  const el = element();
  if (!el) return;
  if (el.paused) void play();
  else pause();
}

export function setTrack(index: number) {
  const el = element();
  if (!el) return;
  const next = (index + TRACKS.length) % TRACKS.length;
  setState({ trackIndex: next });
  el.src = TRACKS[next].src;
  el.load();
  void play(); // picking a track is an explicit ask to hear it
}

export function step(direction: 1 | -1) {
  setTrack(state.trackIndex + direction);
}

export function setVolume(volume: number) {
  setState({ volume });
  const el = element();
  if (el) el.volume = volume;
}

/** Called by every mounted pill: make sure the audio exists and is trying to
 *  play. Safe to call repeatedly — a paused-by-the-visitor track stays paused. */
export function ensure() {
  const el = element();
  if (!el) return;
  if (userPaused || !el.paused) return;
  void play();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return state;
}

export function getServerSnapshot() {
  return INITIAL;
}
