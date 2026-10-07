import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareEntries } from "./compare.ts";
import { decodeAnyText } from "./decode.ts";
import { toEntries } from "./entries.ts";
import { archive, epe, ID_A, ID_B, json, pattern } from "./fixtures.test-helpers.ts";
import { pairSides } from "./pair.ts";
import { summarize } from "./summary.ts";

const MAIN = "export function render(i) {\n  hsv(0, 1, 1)\n}\n";

const backup = archive({
  "/config.json": json({ rev: 1 }),
  [`/x/${ID_A}`]: pattern({ name: "Rainbow", main: MAIN }),
  [`/x/${ID_A}.c`]: json({ sliderSpeed: 0.5 }),
  [`/x/${ID_B}`]: pattern({ name: "Other", main: "// other\n" }),
});

async function compare(textA: string, nameA: string, textB: string, nameB: string) {
  const [a, b] = [decodeAnyText(textA, nameA), decodeAnyText(textB, nameB)];
  const paired = pairSides({ backup: a, entries: await toEntries(a) }, { backup: b, entries: await toEntries(b) });
  const groups = compareEntries(paired.a, paired.b);
  return { paired, groups, text: summarize(groups, new Map([...a.patternNames, ...b.patternNames])) };
}

describe("decodeAnyText", () => {
  it("reads an .epe as a backup holding that one pattern and its controls", () => {
    const decoded = decodeAnyText(epe({ id: ID_A, name: "Rainbow", main: MAIN, controls: { sliderSpeed: 1 } }), "r.epe");
    assert.equal(decoded.format, "epe");
    assert.deepEqual(decoded.files.map((f) => f.type), ["pattern", "controls"]);
    const [file] = decoded.files;
    assert.equal(file.type === "pattern" && file.pattern.bytecode, undefined);
  });

  it("tells a backup from an .epe by content, whatever the extension", () => {
    assert.equal(decodeAnyText(backup, "misnamed.epe").format, "pbb");
    assert.equal(decodeAnyText(epe({ id: ID_A, name: "R", main: "" }), "misnamed.pbb").format, "epe");
  });

  it("reads bare source by extension and names it after the file", () => {
    const decoded = decodeAnyText("// hi\n", "folder/My Pattern.js");
    assert.equal(decoded.format, "source");
    const [file] = decoded.files;
    assert.equal(file.type === "pattern" && file.pattern.name, "My Pattern");
  });

  it("keeps an old export's bare src and gsrc bodies as they are", async () => {
    const decoded = decodeAnyText(JSON.stringify({ name: "Old", src: "hsv(0,1,1)", gsrc: "t = time(.1)" }), "old.epe");
    const entries = await toEntries(decoded);
    assert.deepEqual(entries.map((e) => e.path), ["patterns/Old/sources.json", "patterns/Old/meta.json"]);
    assert.deepEqual(entries[0].value, { src: "hsv(0,1,1)", gsrc: "t = time(.1)" });
  });

  it("rejects files that are neither", () => {
    assert.throws(() => decodeAnyText("hello", "x.pbb"), /not JSON/);
    assert.throws(() => decodeAnyText("{}", "x.epe"), /no sources/);
  });
});

describe("pairSides", () => {
  it("compares an .epe with its copy in a backup by id, ignoring bytecode it cannot hold", async () => {
    const { paired, text } = await compare(
      epe({ id: ID_A, name: "Rainbow", main: MAIN, controls: { sliderSpeed: 0.5 } }), "Rainbow.epe",
      backup, "device.pbb",
    );
    assert.match(paired.note ?? "", /matched by id/);
    assert.match(text, /Patterns: 0 added, 0 removed, 0 changed, 1 unchanged/);
    assert.doesNotMatch(text, /Settings|Other/);
  });

  it("falls back to the name when the ids differ", async () => {
    const { paired, text } = await compare(
      backup, "device.pbb",
      epe({ id: "ZZZZZZZZZZZZZZZZZ", name: "Rainbow", main: "// changed\n", controls: { sliderSpeed: 0.5 } }), "R.epe",
    );
    assert.match(paired.note ?? "", /matched by name; the ids differ/);
    assert.match(text, new RegExp(`~ Rainbow \\[${ID_A}\\]: code\\n`));
  });

  it("shows the pattern as added when the backup has no match", async () => {
    const { paired, text } = await compare(backup, "device.pbb", epe({ id: "Z", name: "Nope", main: "" }), "n.epe");
    assert.match(paired.note ?? "", /no pattern with id Z or named "Nope"/);
    assert.match(text, /Patterns: 1 added, 0 removed, 0 changed, 0 unchanged/);
  });

  it("compares two pattern files as one pattern even when their ids differ", async () => {
    const { paired, groups } = await compare(
      epe({ id: ID_A, name: "Rainbow", main: MAIN }), "a.epe",
      epe({ id: ID_B, name: "Rainbow 2", main: MAIN }), "b.epe",
    );
    assert.match(paired.note ?? "", /different ids/);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].labelA, "Rainbow");
    assert.equal(groups[0].labelB, "Rainbow 2");
  });

  it("compares bare source with an .epe on code alone", async () => {
    const { paired, groups } = await compare(MAIN, "Rainbow.js", epe({ id: ID_A, name: "Rainbow", main: MAIN, controls: {} }), "r.epe");
    assert.equal(paired.note, undefined);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].group, `pattern/${ID_A}`);
    assert.equal(groups[0].status, "same");
    assert.deepEqual(groups[0].entries.map((e) => e.key.split("/").pop()), ["main.js", "meta.json"]);
  });

  it("leaves two backups as they are", async () => {
    const { paired } = await compare(backup, "a.pbb", backup, "b.pbb");
    assert.equal(paired.note, undefined);
    assert.ok(paired.a.some((e) => e.key === "config.json"));
  });
});
