/**
 * What a pattern's code and saved controls mean together. Controls are discovered the way the
 * device discovers them, from exported function names: the prefix picks the widget and the rest
 * is the label (neoimage www/src/app/controls.ts). Saved values are lined up against them, so a
 * value whose control was since removed from the code stands out.
 */

import { PALETTE_CYCLE, SYSTEM_PALETTES, USER_PALETTE_ID_BASE } from "../formats/palettes.ts";

export type ControlKind =
  | "slider"
  | "inputNumber"
  | "hsvPicker"
  | "rgbPicker"
  | "toggle"
  | "trigger"
  | "showNumber"
  | "gauge";

/** Longest first, so a prefix that contains another still resolves to the right kind. */
const PREFIXES: readonly (readonly [string, ControlKind])[] = [
  ["inputNumber", "inputNumber"],
  ["showNumber", "showNumber"],
  ["hsvPicker", "hsvPicker"],
  ["rgbPicker", "rgbPicker"],
  ["trigger", "trigger"],
  ["slider", "slider"],
  ["toggle", "toggle"],
  ["gauge", "gauge"],
];

/** Shown by the device, never set from the UI, so they have no saved value worth showing. */
const READ_ONLY: ReadonlySet<ControlKind> = new Set<ControlKind>(["showNumber", "gauge"]);

/** Saved alongside the controls but naming no export: pattern speed and palette override. */
const SPEED_KEY = "__speed";
const PALETTE_KEY = "__palette";

export interface PatternControl {
  /** Export name, e.g. `sliderSpeed`. */
  name: string;
  kind: ControlKind;
  /** Derived from the name, e.g. "Speed". */
  label: string;
  readOnly: boolean;
  /** The saved value; absent when none was saved. */
  value?: unknown;
  hasValue: boolean;
  /** False for a saved value whose control is no longer exported by the code. */
  inCode: boolean;
}

export interface PatternExports {
  functions: string[];
  variables: string[];
}

export interface PatternSettings {
  /** Speed multiplier, 1 for normal speed. */
  speed?: number;
  palette?: { value: unknown; label: string; stops?: readonly number[] };
}

/** "someControlName" -> "Some Control Name"; underscores count as word breaks. */
export function sentenceCase(text: string): string {
  return text
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/ {2}/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.substring(1))
    .join(" ");
}

export function controlKind(name: string): { kind: ControlKind; label: string } | undefined {
  for (const [prefix, kind] of PREFIXES)
    if (name.startsWith(prefix)) return { kind, label: sentenceCase(name.substring(prefix.length)) };
  return undefined;
}

/**
 * Names the code exports, in the order they appear. Comments are stripped first so a
 * commented-out control does not count; this is a scan, not a parse, which is enough for the
 * declarations Pixelblaze code uses.
 */
export function findExports(code: string): PatternExports {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const functions: string[] = [];
  const variables: string[] = [];

  for (const match of stripped.matchAll(/\bexport\s+(function|var|let|const)\s+([^;\n]*)/g)) {
    if (match[1] === "function") {
      const name = /^([A-Za-z_$][\w$]*)/.exec(match[2]);
      if (name) functions.push(name[1]);
      continue;
    }
    // `export var a = 1, b = array(3)`: every declarator's name, skipping commas inside calls.
    for (const declarator of splitTopLevel(match[2])) {
      const name = /^\s*([A-Za-z_$][\w$]*)/.exec(declarator);
      if (name) variables.push(name[1]);
    }
  }
  return { functions: unique(functions), variables: unique(variables) };
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function unique(names: string[]): string[] {
  return [...new Set(names)];
}

/** The code's controls in code order with their saved values, then saved values with no control. */
export function patternControls(code: string | undefined, saved: unknown): PatternControl[] {
  const values = isObject(saved) ? saved : {};
  const has = (name: string) => Object.prototype.hasOwnProperty.call(values, name);
  const exported = code === undefined ? [] : findExports(code).functions;

  const controls: PatternControl[] = [];
  for (const name of exported) {
    const described = controlKind(name);
    if (!described) continue;
    controls.push({
      name,
      ...described,
      readOnly: READ_ONLY.has(described.kind),
      value: values[name],
      hasValue: has(name),
      inCode: true,
    });
  }

  // Without code (an export compared on controls alone) nothing can be called stale.
  const inCode = new Set(exported);
  for (const name of Object.keys(values)) {
    if (name.startsWith("__") || inCode.has(name)) continue;
    const described = controlKind(name) ?? { kind: "slider" as const, label: name };
    controls.push({
      name,
      ...described,
      readOnly: READ_ONLY.has(described.kind),
      value: values[name],
      hasValue: true,
      inCode: code === undefined,
    });
  }
  return controls;
}

export function patternSettings(saved: unknown): PatternSettings {
  if (!isObject(saved)) return {};
  const settings: PatternSettings = {};
  if (typeof saved[SPEED_KEY] === "number") settings.speed = saved[SPEED_KEY];
  if (PALETTE_KEY in saved) settings.palette = describePalette(saved[PALETTE_KEY]);
  return settings;
}

function describePalette(value: unknown): NonNullable<PatternSettings["palette"]> {
  if (value === null) return { value, label: "Off (the pattern's own colors)" };
  if (value === PALETTE_CYCLE) return { value, label: "Cycle through enabled palettes" };
  if (typeof value !== "number") return { value, label: `Unrecognized (${JSON.stringify(value)})` };
  if (value >= USER_PALETTE_ID_BASE) return { value, label: `User palette #${value - USER_PALETTE_ID_BASE}` };
  const system = SYSTEM_PALETTES.find((p) => p.id === value);
  return system ? { value, label: system.name, stops: system.stops } : { value, label: `System palette #${value}` };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A picker's saved components as a CSS hex color, or undefined for anything else. */
export function controlColor(kind: ControlKind, value: unknown): string | undefined {
  if (kind !== "hsvPicker" && kind !== "rgbPicker") return undefined;
  if (!Array.isArray(value) || value.length < 3 || !value.every((v) => typeof v === "number")) return undefined;
  const [a, b, c] = value as number[];
  const rgb = kind === "hsvPicker" ? hsvToRgb(a, b, c) : [a, b, c];
  return "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

function hsvToRgb(h: number, s: number, v: number): number[] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
