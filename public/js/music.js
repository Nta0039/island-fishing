/**
 * Background music.
 *
 * Browsers refuse to start audio until the user has interacted with the
 * page, so `start()` is called from the Play button — that click is the
 * gesture that unlocks playback. Everything else is best-effort: if the
 * file is missing or playback is blocked, the game carries on silently
 * rather than throwing.
 */

const TRACK = '/music/Island-Morning.mp3';
const VOLUME = 0.35;

let audio = null;
let started = false;
let muted = false;
let retryBound = false;

function el() {
  if (audio) return audio;
  audio = new Audio(TRACK);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = VOLUME;
  audio.muted = muted;
  /* A missing or unplayable file must never break the game. */
  audio.addEventListener('error', () => { audio = null; });
  return audio;
}

/** Tries to start playback, and re-arms a retry if the browser refuses. */
function attempt() {
  const a = el();
  if (!a || muted) return;
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      /* Still locked: the next tap or keypress will try again. */
      if (retryBound) return;
      retryBound = true;
      const retry = () => {
        retryBound = false;
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
        if (started && !muted) attempt();
      };
      window.addEventListener('pointerdown', retry);
      window.addEventListener('keydown', retry);
    });
  }
}

/** Call from a user gesture (the Play button) so playback is allowed. */
export function start() {
  started = true;
  attempt();
}

export function toggle() {
  muted = !muted;
  const a = el();
  if (a) {
    a.muted = muted;
    if (!muted && a.paused) attempt();
  }
  return muted;
}

export function isMuted() {
  return muted;
}

export function isPlaying() {
  return !!audio && !audio.paused && !muted;
}

export function setVolume(v) {
  const a = el();
  if (a) a.volume = Math.max(0, Math.min(1, v));
}
