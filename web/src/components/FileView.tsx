import { useMemo, useState } from "preact/hooks";

import { groupCategory } from "../../../src/backup/compare.ts";
import type { PlaylistItem } from "../../../src/backup/decode.ts";
import type { Entry, EntryGroup } from "../../../src/backup/entries.ts";
import { describeFile, undecodedFiles, type LoadedFile } from "../load.ts";
import { BinaryInfo } from "./BinaryDiff.tsx";
import { CodeView, languageFor } from "./CodeView.tsx";
import { ImageView, useObjectUrl } from "./ImageDiff.tsx";
import { DecodeWarnings } from "./Overview.tsx";
import { PatternDetails } from "./PatternDetails.tsx";
import type { MapChoice } from "./PreviewPlayer.tsx";

/** One group of a single file: a pattern's details, a playlist, or a settings or other file. */
interface FileGroupViewProps {
  file: LoadedFile;
  group: EntryGroup;
  /** The pixel map to animate pattern previews on: the file's own, or the other side's. */
  map?: MapChoice;
  onSelect: (group: string) => void;
}

export function FileGroupView({ file, group, map, onSelect }: FileGroupViewProps) {
  switch (groupCategory(group)) {
    case "pattern":
      return <PatternDetails entries={group.entries} format={file.backup.format} map={map} />;
    case "playlist":
      return <PlaylistView file={file} group={group} onSelect={onSelect} />;
    default:
      return <EntriesView title={group.label} entries={group.entries} />;
  }
}

/** Plain files: text in an editor, images scaled, anything else as size and hash. */
function EntriesView({ title, entries }: { title: string; entries: readonly Entry[] }) {
  const [index, setIndex] = useState(0);
  const entry = entries[Math.min(index, entries.length - 1)];
  return (
    <div class="group-view">
      <header class="group-header">
        <div>
          <h2>{title}</h2>
          <p class="paths muted">{entry.path}</p>
        </div>
      </header>
      {entries.length > 1 && (
        <div class="tabs" role="tablist">
          {entries.map((e, i) => (
            <button key={e.key} role="tab" aria-selected={i === index} class="tab" onClick={() => setIndex(i)}>
              {e.path.split("/").pop()}
            </button>
          ))}
        </div>
      )}
      <div class="entry-view">
        <EntryContent entry={entry} />
      </div>
    </div>
  );
}

function EntryContent({ entry }: { entry: Entry }) {
  if (entry.kind === "text") return <CodeView value={entry.content as string} language={languageFor(entry.path)} />;
  if (entry.kind === "image")
    return (
      <div class="image-diff">
        <ImageView entry={entry} />
      </div>
    );
  return <BinaryInfo entry={entry} />;
}

function PlaylistView({ file, group, onSelect }: { file: LoadedFile; group: EntryGroup; onSelect: (group: string) => void }) {
  const [tab, setTab] = useState<"items" | "json">("items");
  const json = group.entries.find((e) => e.key.endsWith(".json"));
  const items = ((json?.value as { items?: PlaylistItem[] } | undefined)?.items ?? []) as PlaylistItem[];
  const names = file.backup.patternNames;
  const total = items.reduce((sum, item) => sum + item.ms, 0);

  return (
    <div class="group-view">
      <header class="group-header">
        <div>
          <h2>{group.label}</h2>
          <p class="subtitle muted">
            {items.length} patterns, {formatDuration(total)} in all
          </p>
        </div>
      </header>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "items"} class="tab" onClick={() => setTab("items")}>Patterns</button>
        <button role="tab" aria-selected={tab === "json"} class="tab" onClick={() => setTab("json")}>JSON</button>
      </div>
      <div class="entry-view">
        {tab === "items" ? (
          <table class="controls playlist">
            <thead>
              <tr><th>#</th><th>Pattern</th><th>Duration</th></tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={`${i}-${item.id}`}>
                  <td class="muted">{i + 1}</td>
                  <td>
                    {names.has(item.id) ? (
                      <button class="link" onClick={() => onSelect(`pattern/${item.id}`)}>{names.get(item.id)}</button>
                    ) : (
                      <span class="muted">not in this backup</span>
                    )}{" "}
                    <code class="muted">{item.id}</code>
                  </td>
                  <td>{formatDuration(item.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          json && <CodeView value={json.content as string} language="javascript" />
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** Device settings worth seeing at a glance, by config.json key. */
const CONFIG_FACTS: [string, string][] = [
  ["name", "Device name"],
  ["pixelCount", "Pixels"],
  ["colorOrder", "Color order"],
  ["brightness", "Brightness"],
  ["maxBrightness", "Max brightness"],
];

/** A single file at a glance: what it is, and for a backup, the device and a gallery of patterns. */
export function FileOverview({ file, groups, onSelect }: { file: LoadedFile; groups: readonly EntryGroup[]; onSelect: (group: string) => void }) {
  const patterns = useMemo(
    () =>
      groups
        .filter((g) => groupCategory(g) === "pattern")
        .sort((x, y) => x.label.localeCompare(y.label, undefined, { sensitivity: "base" })),
    [groups],
  );
  const config = file.entries.find((e) => e.key === "config.json")?.value as Record<string, unknown> | undefined;
  const lastPath = typeof config?.lastProgramPath === "string" ? config.lastProgramPath : undefined;
  const lastId = lastPath?.replace(/^\/x\//, "");

  return (
    <div class="overview">
      <h2>{file.fileName}</h2>
      <p class="muted">{describeFile(file)}</p>
      <DecodeWarnings lines={undecodedFiles(file)} />

      {config && (
        <table class="facts">
          <tbody>
            {CONFIG_FACTS.filter(([key]) => config[key] !== undefined && config[key] !== "").map(([key, label]) => (
              <tr key={key}>
                <th>{label}</th>
                <td>{String(config[key])}</td>
              </tr>
            ))}
            {lastId && (
              <tr>
                <th>Last pattern</th>
                <td>
                  {file.backup.patternNames.has(lastId) ? (
                    <button class="link" onClick={() => onSelect(`pattern/${lastId}`)}>{file.backup.patternNames.get(lastId)}</button>
                  ) : (
                    <code>{lastPath}</code>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {patterns.length > 0 && (
        <>
          <h3>Patterns</h3>
          <div class="gallery">
            {patterns.map((g) => (
              <PatternCard key={g.group} group={g} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PatternCard({ group, onSelect }: { group: EntryGroup; onSelect: (group: string) => void }) {
  const preview = group.entries.find((e) => e.key.endsWith("/preview.jpg"));
  const url = useObjectUrl(preview);
  return (
    <button class="card" onClick={() => onSelect(group.group)}>
      {url ? <img src={url} alt="" /> : <span class="card-blank" />}
      <span class="card-name">{group.label}</span>
    </button>
  );
}
