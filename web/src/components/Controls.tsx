import { controlColor, type ControlKind, type PatternControl, type PatternSettings } from "../../../src/backup/controls.ts";

const KIND_LABEL: Record<ControlKind, string> = {
  slider: "Slider",
  toggle: "Toggle",
  hsvPicker: "HSV color",
  rgbPicker: "RGB color",
  inputNumber: "Number input",
  showNumber: "Number display",
  gauge: "Gauge",
  trigger: "Button",
};

export function SettingsTable({ settings }: { settings: PatternSettings }) {
  const { speed, palette } = settings;
  if (speed === undefined && !palette) return null;
  return (
    <table class="facts">
      <tbody>
        {speed !== undefined && (
          <tr>
            <th>Speed</th>
            <td>{formatNumber(speed)}×</td>
          </tr>
        )}
        {palette && (
          <tr>
            <th>Palette</th>
            <td>
              {palette.stops && <span class="palette-swatch" style={{ background: gradient(palette.stops) }} />}
              {palette.label}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function ControlsTable({ controls }: { controls: readonly PatternControl[] }) {
  if (controls.length === 0) return <p class="muted">This pattern has no controls.</p>;
  return (
    <table class="controls">
      <thead>
        <tr>
          <th>Control</th>
          <th>Type</th>
          <th>Saved value</th>
        </tr>
      </thead>
      <tbody>
        {controls.map((control) => (
          <tr key={control.name} class={control.inCode ? "" : "stale"}>
            <td>
              <div>{control.label || control.name}</div>
              <code class="muted">{control.name}</code>
              {!control.inCode && <span class="badge status-removed">not in code</span>}
            </td>
            <td>{KIND_LABEL[control.kind]}</td>
            <td>
              <ControlValue control={control} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ControlValue({ control }: { control: PatternControl }) {
  const { kind, value } = control;
  if (control.readOnly) return <span class="muted">shown while running</span>;
  if (kind === "trigger") return <span class="muted">—</span>;
  if (!control.hasValue) return <span class="muted">not saved</span>;

  const color = controlColor(kind, value);
  if (color)
    return (
      <span class="value-row">
        <span class="color-swatch" style={{ background: color }} />
        <code>{color}</code>
        <span class="muted">{(value as number[]).map(formatNumber).join(", ")}</span>
      </span>
    );

  if (kind === "toggle") return <span class={`pill ${value ? "on" : "off"}`}>{value ? "On" : "Off"}</span>;

  if (kind === "slider" && typeof value === "number")
    return (
      <span class="value-row">
        <span class="slider-bar" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value}>
          <span style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
        </span>
        <code>{formatNumber(value)}</code>
      </span>
    );

  return <code>{typeof value === "number" ? formatNumber(value) : JSON.stringify(value)}</code>;
}

export function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** A palette's stops, flattened (pos, r, g, b) groups, as a CSS gradient. */
function gradient(stops: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 3 < stops.length; i += 4) {
    const [pos, r, g, b] = stops.slice(i, i + 4).map((v) => Math.min(1, Math.max(0, v)));
    parts.push(`rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}) ${pos * 100}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
