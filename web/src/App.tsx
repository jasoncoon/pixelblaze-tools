import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { compareEntries, groupCategory, type GroupChange } from "../../src/backup/compare.ts";
import { groupEntries, type EntryGroup } from "../../src/backup/entries.ts";
import { pairSides } from "../../src/backup/pair.ts";
import { FileSlot, type Slot } from "./components/FileSlot.tsx";
import { FileGroupView, FileOverview } from "./components/FileView.tsx";
import { GroupView } from "./components/GroupView.tsx";
import { Overview } from "./components/Overview.tsx";
import { PatternDetails } from "./components/PatternDetails.tsx";
import { compareItems, fileItems, Sidebar } from "./components/Sidebar.tsx";
import { loadFile, mapFor, type LoadedFile } from "./load.ts";
import { usePreference } from "./preferences.ts";

const EMPTY: Slot = { status: "empty" };

/** Compare the two files, or look at one of them on its own. */
type Mode = "compare" | "a" | "b";

export function App() {
  const [slots, setSlots] = useState<[Slot, Slot]>([EMPTY, EMPTY]);
  const [selected, setSelected] = useState<string | undefined>();
  const [chosenMode, setChosenMode] = useState<Mode>("compare");
  const [sideBySide, setSideBySide] = usePreference("sideBySide", true);
  // A slot's latest load wins, so a slow file picked first cannot overwrite a later pick.
  const loadTokens = useRef([0, 0]);

  const setSlot = (index: 0 | 1, slot: Slot) =>
    setSlots((current) => (index === 0 ? [slot, current[1]] : [current[0], slot]));

  async function load(index: 0 | 1, file: File) {
    const token = ++loadTokens.current[index];
    setSlot(index, { status: "loading", fileName: file.name });
    try {
      const loaded = await loadFile(file);
      if (token === loadTokens.current[index]) setSlot(index, { status: "loaded", loaded });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (token === loadTokens.current[index]) setSlot(index, { status: "error", fileName: file.name, message });
    }
  }

  /** Two files at once go in name order, which for device backups is date order. */
  function loadDropped(files: File[]) {
    if (files.length >= 2) {
      const [first, second] = [...files].sort((x, y) => x.name.localeCompare(y.name));
      void load(0, first);
      void load(1, second);
    } else if (files.length === 1) {
      void load(slots[0].status === "empty" ? 0 : 1, files[0]);
    }
  }

  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      loadDropped([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  });

  const [a, b] = slots.map((s) => (s.status === "loaded" ? s.loaded : undefined));
  // With one file loaded there is nothing to compare, so it is shown on its own.
  const mode: Mode | undefined = a && b ? chosenMode : a ? "a" : b ? "b" : undefined;
  const viewed = mode === "a" ? a : mode === "b" ? b : undefined;

  const comparison = useMemo(() => {
    if (mode !== "compare" || !a || !b) return undefined;
    const paired = pairSides(a, b);
    return { note: paired.note, groups: compareEntries(paired.a, paired.b) };
  }, [mode, a, b]);
  const fileGroups = useMemo(() => (viewed ? groupEntries(viewed.entries) : undefined), [viewed]);

  // A pattern file, or a comparison that comes down to one pattern, has one thing to look at,
  // so open it rather than the overview.
  useEffect(() => {
    const only = comparison?.groups ?? fileGroups;
    if (only?.length === 1) setSelected(only[0].group);
  }, [comparison, fileGroups]);

  return (
    <div class="app">
      <header class="topbar">
        <h1>Pixelblaze File View / Diff</h1>
        <div class="slots">
          <FileSlot side="A" slot={slots[0]} otherLoaded={slots[1].status === "loaded"} onFile={(f) => load(0, f)} />
          <button
            class="swap"
            title="Swap A and B"
            disabled={slots[0].status === "loading" || slots[1].status === "loading"}
            onClick={() => setSlots(([x, y]) => [y, x])}
          >
            ⇄
          </button>
          <FileSlot side="B" slot={slots[1]} otherLoaded={slots[0].status === "loaded"} onFile={(f) => load(1, f)} />
        </div>
        {a && b && (
          <div class="modes" role="group" aria-label="View">
            {(
              [
                ["compare", "Compare"],
                ["a", "View A"],
                ["b", "View B"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} aria-pressed={mode === value} onClick={() => setChosenMode(value)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {comparison && a && b ? (
        <div class="workspace">
          <Sidebar items={compareItems(comparison.groups)} selected={selected} onSelect={setSelected} />
          <main class="detail">
            <CompareDetail
              a={a}
              b={b}
              group={comparison.groups.find((g) => g.group === selected)}
              groups={comparison.groups}
              note={comparison.note}
              sideBySide={sideBySide}
              onSideBySide={setSideBySide}
            />
          </main>
        </div>
      ) : viewed && fileGroups ? (
        <div class="workspace">
          <Sidebar items={fileItems(fileGroups)} selected={selected} onSelect={setSelected} />
          <main class="detail">
            <FileDetail
              file={viewed}
              other={mode === "a" && b ? { file: b, side: "B" } : mode === "b" && a ? { file: a, side: "A" } : undefined}
              groups={fileGroups}
              selected={selected}
              onSelect={setSelected}
            />
          </main>
        </div>
      ) : (
        <div class="empty-state">
          <p>Drop a Pixelblaze backup (.pbb) or pattern (.epe) here to look through it, or two to compare them.</p>
          <p class="muted">
            A pattern against a backup is compared with that pattern's copy in the backup. Bare pattern source
            (.pbp, .js, .txt) works too.
          </p>
          <p class="muted">Files are read in your browser and never uploaded.</p>
        </div>
      )}
    </div>
  );
}

interface CompareDetailProps {
  a: LoadedFile;
  b: LoadedFile;
  group: GroupChange | undefined;
  groups: readonly GroupChange[];
  note?: string;
  sideBySide: boolean;
  onSideBySide: (value: boolean) => void;
}

function CompareDetail({ a, b, group, groups, note, sideBySide, onSideBySide }: CompareDetailProps) {
  if (!group) return <Overview a={a} b={b} groups={groups} note={note} />;
  const maps = { a: mapFor(a, { file: b, side: "B" }), b: mapFor(b, { file: a, side: "A" }) };

  // A pattern on one side only has nothing to diff against; show what it is instead.
  if (groupCategory(group) === "pattern" && (group.status === "added" || group.status === "removed")) {
    const [side, file] = group.status === "added" ? (["B", b] as const) : (["A", a] as const);
    return (
      <PatternDetails
        key={group.group}
        entries={group.entries.map((e) => (e.a ?? e.b)!)}
        format={file.backup.format}
        map={side === "A" ? maps.a : maps.b}
        note={`Only in ${side}: ${file.fileName}`}
      />
    );
  }
  return (
    <GroupView key={group.group} group={group} maps={maps} note={note} sideBySide={sideBySide} onSideBySide={onSideBySide} />
  );
}

interface FileDetailProps {
  file: LoadedFile;
  /** The other loaded file, whose map a pattern file without one can borrow. */
  other?: { file: LoadedFile; side: string };
  groups: readonly EntryGroup[];
  selected: string | undefined;
  onSelect: (group: string | undefined) => void;
}

function FileDetail({ file, other, groups, selected, onSelect }: FileDetailProps) {
  const group = groups.find((g) => g.group === selected);
  if (!group) return <FileOverview file={file} groups={groups} onSelect={onSelect} />;
  return (
    <FileGroupView key={`${file.fileName}:${group.group}`} file={file} group={group} map={mapFor(file, other)} onSelect={onSelect} />
  );
}
