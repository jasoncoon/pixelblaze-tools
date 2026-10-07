import { useEffect, useRef } from "preact/hooks";

import type { Entry } from "../../../src/backup/entries.ts";
import type { PreviewMap } from "../../../src/backup/pixelMap.ts";
import { useClock, useClockFrame, type PlaybackClock } from "../preview/clock.ts";
import { useFrames, type PreviewFrames } from "../preview/frames.ts";
import { drawMap, drawStrip } from "../preview/render.ts";
import { usePreference } from "../preferences.ts";
import { formatBytes } from "./BinaryDiff.tsx";
import { useObjectUrl } from "./ImageDiff.tsx";

/** A map to draw a preview on, and where it came from, for saying so. */
export interface MapChoice {
  map: PreviewMap;
  /** E.g. "this backup", or "B: <file name>" when borrowed from the other side. */
  source: string;
}

export interface PreviewSide {
  entry?: Entry;
  map?: MapChoice;
  /** "A" or "B" in a comparison. */
  label?: string;
}

type View = "map" | "strip";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Widest the still image is scaled up to. */
const STILL_MAX_WIDTH = 520;

/** One pattern's preview, animated as a strip or on the pixel map, above the still image. */
export function PreviewPlayer(side: PreviewSide) {
  return <PreviewCompare sides={[side]} />;
}

/** Previews animated together on one clock, so a comparison shows A and B on the same frame. */
export function PreviewCompare({ sides }: { sides: readonly PreviewSide[] }) {
  const clock = useClock();
  const [preferred, setView] = usePreference<View>("previewView", "map");
  const anyMap = sides.some((s) => s.map);
  const view: View = anyMap ? preferred : "strip";
  const hasPreview = sides.some((s) => s.entry);

  return (
    <div class="preview-player">
      <div class="preview-toolbar">
        <div class="modes small" role="group" aria-label="Preview style">
          <button aria-pressed={view === "map"} disabled={!anyMap} title={anyMap ? undefined : "No pixel map available"} onClick={() => setView("map")}>
            Map
          </button>
          <button aria-pressed={view === "strip"} onClick={() => setView("strip")}>
            Strip
          </button>
        </div>
        {hasPreview && <Controls clock={clock} sides={sides} />}
      </div>
      <div class="preview-sides">
        {sides.map((side, i) => (
          <PreviewPanel key={side.label ?? i} side={side} view={view} clock={clock} />
        ))}
      </div>
    </div>
  );
}

function PreviewPanel({ side, view, clock }: { side: PreviewSide; view: View; clock: PlaybackClock }) {
  const frames = useFrames(side.entry);
  const prefix = side.label ? `${side.label}: ` : "";

  if (!side.entry) return <figure class="preview-panel missing"><figcaption>{prefix}no preview</figcaption></figure>;

  const map = view === "map" ? side.map : undefined;
  return (
    <figure class="preview-panel">
      <figcaption>
        {prefix}
        {formatBytes(side.entry.content.length)}
        {frames && `, ${frames.width} pixels × ${frames.height} frames`}
      </figcaption>
      {frames && (
        <>
          <AnimatedCanvas frames={frames} map={map?.map} clock={clock} />
          {view === "map" && (
            <p class="muted preview-note">
              {map ? `Map: ${map.source} (${map.map.dimensions}D, ${map.map.pixelCount} pixels)` : "No pixel map for this side; shown as a strip."}
              {map && frames.width !== map.map.pixelCount && ` The preview has ${frames.width} columns, so colors are spread to fit.`}
            </p>
          )}
          <Still entry={side.entry} frames={frames} clock={clock} />
        </>
      )}
    </figure>
  );
}

/** Redrawn from the clock, not by re-rendering: only when the frame changes, or every tick for a spinning 3D map. */
function AnimatedCanvas({ frames, map, clock }: { frames: PreviewFrames; map?: PreviewMap; clock: PlaybackClock }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current!;
    let drawn = -1;
    let size = "";
    return clock.subscribe(() => {
      // Sized to the element in device pixels, so dots stay sharp; a resize forces a redraw.
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(element.clientWidth * ratio);
      const height = Math.round(element.clientHeight * ratio);
      const resized = `${width}x${height}` !== size;
      if (resized) {
        element.width = width;
        element.height = height;
        size = `${width}x${height}`;
      }
      const frame = clock.frameOf(frames.height);
      const spinning = map !== undefined && map.dimensions >= 3;
      if (frame === drawn && !resized && !spinning) return;
      drawn = frame;
      if (map) drawMap(element, frames, frame, map, performance.now());
      else drawStrip(element, frames, frame);
    });
  }, [frames, map, clock]);

  return <canvas ref={canvas} class={map ? "preview-map" : "preview-strip"} />;
}

/** The stored image, with a line on the row being played; click a row to jump to it. */
function Still({ entry, frames, clock }: { entry: Entry; frames: PreviewFrames; clock: PlaybackClock }) {
  const playhead = useRef<HTMLDivElement>(null);
  const url = useObjectUrl(entry);
  const scale = Math.max(1, Math.floor(STILL_MAX_WIDTH / frames.width));

  useEffect(
    () =>
      clock.subscribe(() => {
        if (playhead.current) playhead.current.style.top = `${((clock.frameOf(frames.height) + 0.5) / frames.height) * 100}%`;
      }),
    [clock, frames],
  );

  if (!url) return null;
  return (
    <div
      class="preview-still"
      style={{ width: frames.width * scale, aspectRatio: `${frames.width} / ${frames.height}` }}
      title="Each row is one frame, each column one pixel. Click a row to jump to it."
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        clock.seekFrame(Math.floor(((e.clientY - box.top) / box.height) * frames.height));
      }}
    >
      <img src={url} alt={`Preview: ${entry.path}`} />
      <div class="playhead" ref={playhead} />
    </div>
  );
}

function Controls({ clock, sides }: { clock: PlaybackClock; sides: readonly PreviewSide[] }) {
  // The scrubber walks the longest preview; a shorter one loops within it.
  const longest = useLongest(sides.map((s) => s.entry));
  const frame = useClockFrame(clock, longest);

  return (
    <div class="preview-controls">
      <button class="play" onClick={() => clock.setPlaying(!clock.playing)} aria-label={clock.playing ? "Pause" : "Play"}>
        {clock.playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, longest - 1)}
        value={frame}
        aria-label="Frame"
        onInput={(e) => {
          clock.setPlaying(false);
          clock.seekFrame(Number(e.currentTarget.value));
        }}
      />
      <span class="muted frame-label">
        {frame + 1} / {longest || "…"}
      </span>
      <select value={clock.speed} aria-label="Speed" onChange={(e) => clock.setSpeed(Number(e.currentTarget.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}

/** Frame count of the tallest decoded preview, 0 until one decodes. A comparison has at most two sides. */
function useLongest(entries: readonly (Entry | undefined)[]): number {
  const a = useFrames(entries[0]);
  const b = useFrames(entries[1]);
  return Math.max(a?.height ?? 0, b?.height ?? 0);
}
