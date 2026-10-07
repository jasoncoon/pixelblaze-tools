import { useEffect, useState } from "preact/hooks";

import { sha256 } from "../../../src/formats/bytes.ts";
import type { Entry } from "../../../src/backup/entries.ts";

/** What can usefully be said about two binary files: sizes, hashes, and where they part. */
export function BinaryDiff({ a, b }: { a?: Entry; b?: Entry }) {
  const bytesA = asBytes(a);
  const bytesB = asBytes(b);
  const hashA = useHash(a);
  const hashB = useHash(b);

  return (
    <table class="binary-diff">
      <thead>
        <tr><th /><th>A</th><th>B</th></tr>
      </thead>
      <tbody>
        <tr>
          <th>Size</th>
          <td>{bytesA ? formatBytes(bytesA.length) : "—"}</td>
          <td>{bytesB ? formatBytes(bytesB.length) : "—"}</td>
        </tr>
        <tr>
          <th>SHA-256</th>
          <td class="hash">{hashA ?? "—"}</td>
          <td class="hash">{hashB ?? "—"}</td>
        </tr>
        {bytesA && bytesB && (
          <tr>
            <th>First difference</th>
            <td colSpan={2}>{firstDifference(bytesA, bytesB)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function asBytes(entry?: Entry): Uint8Array | undefined {
  if (!entry) return undefined;
  return typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content;
}

/** Keyed on the entry, which is stable, rather than its bytes, which text entries rebuild. */
export function useHash(entry?: Entry): string | undefined {
  const [hash, setHash] = useState<string>();
  useEffect(() => {
    let current = true;
    setHash(undefined);
    const bytes = asBytes(entry);
    if (bytes) void sha256(new Uint8Array(bytes)).then((h) => current && setHash(h));
    return () => {
      current = false;
    };
  }, [entry]);
  return hash;
}

/** Size and hash of one file. */
export function BinaryInfo({ entry }: { entry: Entry }) {
  const hash = useHash(entry);
  return (
    <table class="binary-diff">
      <tbody>
        <tr><th>Size</th><td>{formatBytes(asBytes(entry)!.length)}</td></tr>
        <tr><th>SHA-256</th><td class="hash">{hash ?? "…"}</td></tr>
      </tbody>
    </table>
  );
}

function firstDifference(a: Uint8Array, b: Uint8Array): string {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return `at byte ${i.toLocaleString()} (0x${i.toString(16)})`;
  return a.length === b.length ? "none, identical" : `at byte ${length.toLocaleString()}: one file is a prefix of the other`;
}

export function formatBytes(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "byte" : "bytes"}`;
}
