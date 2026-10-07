/**
 * One playback position shared by every preview that should move together, so A and B in a
 * comparison stay on the same frame. Time is kept in seconds rather than frames because the two
 * previews need not have the same number of rows.
 */

import { useEffect, useMemo, useState } from "preact/hooks";

/** Rows are captured at about the device's frame rate; neoimage plays 150 of them in 5 s. */
export const PREVIEW_FPS = 30;

export class PlaybackClock {
  seconds = 0;
  playing = true;
  speed = 1;
  private listeners = new Set<() => void>();
  private frame = 0;
  private last: number | undefined;

  /** Called on every animation frame while anything listens, playing or not. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  frameOf(frameCount: number): number {
    return frameCount > 0 ? Math.floor(this.seconds * PREVIEW_FPS) % frameCount : 0;
  }

  seekFrame(frame: number) {
    this.seconds = frame / PREVIEW_FPS;
    this.notify();
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.notify();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.notify();
  }

  private start() {
    const tick = (now: number) => {
      if (this.playing && this.last !== undefined) this.seconds += ((now - this.last) / 1000) * this.speed;
      this.last = now;
      this.notify();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.last = undefined;
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export function useClock(): PlaybackClock {
  return useMemo(() => new PlaybackClock(), []);
}

/** Re-renders only when the frame shown for `frameCount` rows, or play state, changes. */
export function useClockFrame(clock: PlaybackClock, frameCount: number): number {
  const [state, setState] = useState(() => ({ frame: clock.frameOf(frameCount), playing: clock.playing, speed: clock.speed }));
  useEffect(
    () =>
      clock.subscribe(() =>
        setState((s) => {
          const frame = clock.frameOf(frameCount);
          return s.frame === frame && s.playing === clock.playing && s.speed === clock.speed
            ? s
            : { frame, playing: clock.playing, speed: clock.speed };
        }),
      ),
    [clock, frameCount],
  );
  return state.frame;
}
