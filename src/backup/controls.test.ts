import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { controlColor, findExports, patternControls, patternSettings, sentenceCase } from "./controls.ts";

const CODE = `
// export function sliderCommentedOut(v) {}
/* export function toggleAlsoOut(v) {} */
export var speed = 1, sixAxis = array(6), count
export function sliderGrainSize(v) { size = v }
export function toggleInvert_X(v) { inv = v }
export function hsvPickerColor(h, s, v) {}
export function showNumberFps() { return fps }
export function beforeRender(delta) {}
`;

describe("findExports", () => {
  it("finds exported functions and every variable declarator, skipping comments", () => {
    assert.deepEqual(findExports(CODE), {
      functions: ["sliderGrainSize", "toggleInvert_X", "hsvPickerColor", "showNumberFps", "beforeRender"],
      variables: ["speed", "sixAxis", "count"],
    });
  });
});

describe("patternControls", () => {
  it("lists the code's controls in order with their saved values", () => {
    const controls = patternControls(CODE, { sliderGrainSize: 0.7, hsvPickerColor: [0.5, 1, 1] });
    assert.deepEqual(
      controls.map((c) => [c.name, c.kind, c.label, c.value, c.hasValue, c.readOnly]),
      [
        ["sliderGrainSize", "slider", "Grain Size", 0.7, true, false],
        ["toggleInvert_X", "toggle", "Invert X", undefined, false, false],
        ["hsvPickerColor", "hsvPicker", "Color", [0.5, 1, 1], true, false],
        ["showNumberFps", "showNumber", "Fps", undefined, false, true],
      ],
    );
  });

  it("flags saved values whose control is gone from the code, and ignores settings", () => {
    const controls = patternControls(CODE, { sliderOld: 0.2, __speed: 1, __palette: null });
    const stale = controls.filter((c) => !c.inCode);
    assert.deepEqual(stale.map((c) => [c.name, c.label]), [["sliderOld", "Old"]]);
  });

  it("calls nothing stale when there is no code to check against", () => {
    assert.ok(patternControls(undefined, { sliderOld: 0.2 }).every((c) => c.inCode));
  });
});

describe("patternSettings", () => {
  it("reads speed and names the palette", () => {
    const settings = patternSettings({ __speed: 2, __palette: 10 });
    assert.equal(settings.speed, 2);
    assert.equal(settings.palette?.label, "Rainbow");
    assert.ok((settings.palette?.stops?.length ?? 0) > 0);
  });

  it("describes the palette's special values", () => {
    assert.match(patternSettings({ __palette: null }).palette!.label, /Off/);
    assert.match(patternSettings({ __palette: -1 }).palette!.label, /Cycle/);
    assert.equal(patternSettings({ __palette: 1003 }).palette!.label, "User palette #3");
    assert.equal(patternSettings({}).palette, undefined);
  });
});

describe("sentenceCase", () => {
  it("splits camel case and underscores", () => {
    assert.equal(sentenceCase("mountRotation_deg"), "Mount Rotation Deg");
  });
});

describe("controlColor", () => {
  it("converts picker values to hex", () => {
    assert.equal(controlColor("hsvPicker", [0, 1, 1]), "#ff0000");
    assert.equal(controlColor("hsvPicker", [1 / 3, 1, 1]), "#00ff00");
    assert.equal(controlColor("rgbPicker", [0, 0, 1]), "#0000ff");
    assert.equal(controlColor("slider", 0.5), undefined);
    assert.equal(controlColor("rgbPicker", "nope"), undefined);
  });
});
