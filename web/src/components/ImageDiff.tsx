import { useEffect, useState } from "preact/hooks";

import type { Entry } from "../../../src/backup/entries.ts";
import { formatBytes } from "./BinaryDiff.tsx";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Widest an image is scaled up to; previews are tiny and would be unreadable at 1:1. */
const MAX_WIDTH = 520;

export function ImageDiff({ a, b }: { a?: Entry; b?: Entry }) {
  return (
    <div class="image-diff">
      <ImageView label="A" entry={a} />
      <ImageView label="B" entry={b} />
    </div>
  );
}

/** One image, scaled up by a whole factor so small previews stay crisp. */
export function ImageView({ label, entry }: { label?: string; entry?: Entry }) {
  const url = useObjectUrl(entry);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const prefix = label ? `${label}: ` : "";

  if (!entry) return <figure class="image-side missing"><figcaption>{prefix}not in this file</figcaption></figure>;

  const scale = size ? Math.max(1, Math.floor(MAX_WIDTH / size.width)) : 1;
  return (
    <figure class="image-side">
      <figcaption>
        {prefix}{formatBytes(entry.content.length)}{size && `, ${size.width}×${size.height}`}
        {scale > 1 && `, shown at ${scale}×`}
      </figcaption>
      {url && (
        <img
          src={url}
          alt={`${prefix}${entry.path}`}
          style={size ? { width: size.width * scale, height: size.height * scale } : undefined}
          onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        />
      )}
    </figure>
  );
}

export function useObjectUrl(entry?: Entry): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!entry) return setUrl(undefined);
    const type = MIME[entry.path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
    const objectUrl = URL.createObjectURL(new Blob([entry.content as Uint8Array<ArrayBuffer>], { type }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry]);
  return url;
}
