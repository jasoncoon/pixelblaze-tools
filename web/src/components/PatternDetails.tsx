import { useMemo, useState } from "preact/hooks";

import { findExports, patternControls, patternSettings } from "../../../src/backup/controls.ts";
import type { SourceFormat } from "../../../src/backup/decode.ts";
import type { Entry, PatternMeta } from "../../../src/backup/entries.ts";
import { formatBytes } from "./BinaryDiff.tsx";
import { CodeView } from "./CodeView.tsx";
import { ControlsTable, SettingsTable } from "./Controls.tsx";
import { PreviewPlayer, type MapChoice } from "./PreviewPlayer.tsx";

interface Props {
  /** The pattern group's entries: code, controls, preview, meta, other sources. */
  entries: readonly Entry[];
  format: SourceFormat;
  /** The pixel map to animate the preview on, when there is one. */
  map?: MapChoice;
  /** Shown above the details, e.g. that the pattern is only on one side of a comparison. */
  note?: string;
}

type Tab = "details" | "code" | "sources";

/** Everything one file says about one pattern: preview, facts, settings, controls, and code. */
export function PatternDetails({ entries, format, map, note }: Props) {
  const file = (name: string) => entries.find((e) => e.key.endsWith(`/${name}`));
  const main = file("main.js");
  const sources = file("sources.json");
  const preview = file("preview.jpg");
  const controlsEntry = file("controls.json");
  const meta = file("meta.json")?.value as PatternMeta | undefined;
  const code = typeof main?.content === "string" ? main.content : undefined;

  const [tab, setTab] = useState<Tab>("details");
  const controls = useMemo(() => patternControls(code, controlsEntry?.value), [code, controlsEntry]);
  const settings = useMemo(() => patternSettings(controlsEntry?.value), [controlsEntry]);
  const variables = useMemo(() => (code === undefined ? [] : findExports(code).variables), [code]);

  const tabs: [Tab, string][] = [["details", "Details"]];
  if (main) tabs.push(["code", "Code"]);
  if (sources) tabs.push(["sources", "Other sources"]);

  return (
    <div class="group-view">
      <header class="group-header">
        <div>
          <h2>{meta?.name || entries[0]?.groupLabel}</h2>
          <p class="paths muted">{(main ?? entries[0]).path.replace(/\/[^/]*$/, "")}</p>
          {note && <p class="note-line">{note}</p>}
        </div>
      </header>

      <div class="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} class="tab" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div class="entry-view">
        {tab === "details" && (
          <div class="details">
            <section class="details-top">
              {preview ? <PreviewPlayer entry={preview} map={map} /> : <p class="muted no-preview">No preview image</p>}
              <table class="facts">
                <tbody>
                  <tr><th>Name</th><td>{meta?.name || "—"}</td></tr>
                  <tr><th>ID</th><td>{meta?.id ? <code>{meta.id}</code> : <span class="muted">none</span>}</td></tr>
                  <tr><th>From</th><td>{formatLabel(format, meta)}</td></tr>
                  {code !== undefined && <tr><th>Code</th><td>{lineCount(code)} lines, {formatBytes(code.length)}</td></tr>}
                  {meta?.bytecode && <tr><th>Bytecode</th><td>{formatBytes(meta.bytecode.bytes)}</td></tr>}
                </tbody>
              </table>
            </section>

            {(settings.speed !== undefined || settings.palette) && (
              <section>
                <h3>Settings</h3>
                <SettingsTable settings={settings} />
              </section>
            )}

            <section>
              <h3>Controls</h3>
              {!controlsEntry && controls.length > 0 && <p class="muted">No saved control values in this file.</p>}
              <ControlsTable controls={controls} />
            </section>

            {variables.length > 0 && (
              <section>
                <h3>Exported variables</h3>
                <p class="chips">{variables.map((name) => <code key={name}>{name}</code>)}</p>
              </section>
            )}
          </div>
        )}
        {tab === "code" && main && <CodeView value={code ?? ""} language="javascript" />}
        {tab === "sources" && sources && <CodeView value={sources.content as string} language="javascript" />}
      </div>
    </div>
  );
}

function formatLabel(format: SourceFormat, meta?: PatternMeta): string {
  switch (format) {
    case "pbb":
      return `Device backup${meta?.version !== undefined ? `, program file version ${meta.version}` : ""}`;
    case "epe":
      return "Pattern export (.epe)";
    case "source":
      return "Pattern source file";
  }
}

function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}
