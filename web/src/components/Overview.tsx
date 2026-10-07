import { useMemo } from "preact/hooks";

import type { GroupChange } from "../../../src/backup/compare.ts";
import { summarize } from "../../../src/backup/summary.ts";
import { undecodedFiles, type LoadedFile } from "../load.ts";

interface Props {
  a: LoadedFile;
  b: LoadedFile;
  groups: readonly GroupChange[];
  /** How the two files were lined up, when they are not both backups. */
  note?: string;
}

/** The same report the CLI's `summary` prints, so the two never disagree. */
export function Overview({ a, b, groups, note }: Props) {
  const report = useMemo(
    () => summarize(groups, new Map([...a.backup.patternNames, ...b.backup.patternNames])),
    [a, b, groups],
  );

  return (
    <div class="overview">
      <h2>Overview</h2>
      <p class="muted">
        A: {a.fileName}
        <br />
        B: {b.fileName}
      </p>
      {note && <p class="note-line">{note}</p>}
      <DecodeWarnings lines={[...undecodedFiles(a, "A "), ...undecodedFiles(b, "B ")]} />
      <pre class="report">{report}</pre>
    </div>
  );
}

export function DecodeWarnings({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <div class="warning">
      <strong>Some files could not be decoded</strong> and are shown as raw bytes:
      <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
    </div>
  );
}
