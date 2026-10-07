import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concatBytes, u32le } from "../formats/bytes.ts";
import { compareEntries, diffValues } from "./compare.ts";
import { decodeBackupText, type DecodedBackup } from "./decode.ts";
import { manifest, safeName, toEntries, type Entry } from "./entries.ts";
import { archive, ID_A, ID_B, ID_C, json, pattern } from "./fixtures.test-helpers.ts";
import { summarize } from "./summary.ts";

function backupA(): DecodedBackup {
  return decodeBackupText(
    archive({
      "/config.json": json({ rev: 1, name: "Puck", beat: { minBpm: 38 } }),
      [`/x/${ID_A}`]: pattern({ name: "Rainbow", main: "export function render(i) {\n  hsv(0, 1, 1)\n}\n" }),
      [`/x/${ID_A}.c`]: json({ sliderSpeed: 0.5 }),
      [`/x/${ID_B}`]: pattern({ name: "Old Name", main: "// b\n" }),
      [`/x/${ID_C}`]: pattern({ name: "Doomed", main: "// c\n" }),
      "/l/_defaultplaylist_": json({ items: [{ id: ID_A, ms: 30000 }, { id: ID_C, ms: 30000 }] }),
      "/favicon.ico": new Uint8Array([0, 0, 1, 0]),
    }),
  );
}

function backupB(): DecodedBackup {
  return decodeBackupText(
    archive({
      "/config.json": json({ rev: 2, name: "Puck" }),
      [`/x/${ID_A}`]: pattern({ name: "Rainbow", main: "export function render(i) {\n  hsv(0.5, 1, 1)\n}\n", bytecode: [9] }),
      [`/x/${ID_A}.c`]: json({ sliderSpeed: 0.75, sliderHue: 0 }),
      [`/x/${ID_B}`]: pattern({ name: "New Name", main: "// b\n", preview: [0xff, 0xd8, 0xff] }),
      "/l/_defaultplaylist_": json({ items: [{ id: ID_B, ms: 10000 }, { id: ID_A, ms: 15000 }] }),
      "/favicon.ico": new Uint8Array([0, 0, 1, 0]),
    }),
  );
}

const byKey = (entries: Entry[]) => new Map(entries.map((e) => [e.key, e]));

describe("decodeBackup", () => {
  it("unpacks a pattern's name and sources", () => {
    const file = backupA().files.find((f) => f.path === `/x/${ID_A}`);
    assert.equal(file?.type, "pattern");
    if (file?.type !== "pattern") return;
    assert.equal(file.pattern.name, "Rainbow");
    assert.match(file.pattern.sources.main as string, /hsv\(0, 1, 1\)/);
  });

  it("reads version 2 pattern files", () => {
    const backup = decodeBackupText(archive({ [`/x/${ID_A}`]: pattern({ name: "Legacy", main: "", version: 2 }) }));
    const file = backup.files[0];
    assert.equal(file.type === "pattern" && file.pattern.version, 2);
  });

  it("keeps a pattern that fails to decode as a raw file with the reason", () => {
    const bad = pattern({ name: "Bad", main: "" });
    bad[0] = 7;
    const [file] = decodeBackupText(archive({ [`/x/${ID_A}`]: bad })).files;
    assert.equal(file.type, "raw");
    assert.match(file.type === "raw" ? file.error ?? "" : "", /version 7/);
    assert.ok(file.bytes);
  });

  it("records an entry that is not base64 instead of throwing", () => {
    const [file] = decodeBackupText(archive({ "/broken": "not base64!!" })).files;
    assert.deepEqual(file, { path: "/broken", type: "raw", error: "entry is not base64" });
  });

  it("decodes both pixel map files", () => {
    const coords = new Uint8Array(new Uint16Array([1, 2, 3, 4]).buffer);
    const backup = decodeBackupText(
      archive({ "/pixelmap.dat": concatBytes([u32le(2, 2, 8), coords]), "/pixelmap.txt": json([[0, 1], [2, 3]]) }),
    );
    const dat = backup.files.find((f) => f.path === "/pixelmap.dat");
    assert.deepEqual(dat?.type === "pixelmapData" && dat.map.points, [[1, 2], [3, 4]]);
    assert.equal(backup.files.find((f) => f.path === "/pixelmap.txt")?.type, "pixelmapText");
  });

  it("rejects things that are not archives", () => {
    assert.throws(() => decodeBackupText("nope"), /not JSON/);
    assert.throws(() => decodeBackupText("{}"), /no files/);
  });
});

describe("toEntries", () => {
  it("names pattern folders for people and keys them by id", async () => {
    const entries = byKey(await toEntries(backupA()));
    const main = entries.get(`pattern/${ID_A}/main.js`);
    assert.equal(main?.path, `patterns/Rainbow (${ID_A})/main.js`);
    assert.equal(entries.get(`pattern/${ID_A}/controls.json`)?.path, `patterns/Rainbow (${ID_A})/controls.json`);
    assert.equal(entries.get(`pattern/${ID_A}/preview.jpg`)?.kind, "image");
    assert.equal(entries.get("favicon.ico")?.path, "files/favicon.ico");
  });

  it("files controls whose pattern is missing under an unknown pattern", async () => {
    const backup = decodeBackupText(archive({ [`/x/${ID_C}.c`]: json({ a: 1 }) }));
    const [entry] = await toEntries(backup);
    assert.equal(entry.path, `patterns/unknown (${ID_C})/controls.json`);
    assert.equal(entry.groupLabel, `(unknown pattern ${ID_C})`);
  });

  it("lists playlist items with pattern names, one per line", async () => {
    const entries = byKey(await toEntries(backupA()));
    assert.equal(
      entries.get("playlist/_defaultplaylist_.txt")?.content,
      `30000 ms\tRainbow [${ID_A}]\n30000 ms\tDoomed [${ID_C}]\n`,
    );
  });

  it("pretty-prints JSON settings", async () => {
    const config = byKey(await toEntries(backupA())).get("config.json");
    assert.equal(config?.path, "config.json");
    assert.match(config?.content as string, /\n {2}"rev": 1,\n/);
  });
});

describe("compareEntries and summarize", () => {
  async function report() {
    const [a, b] = [backupA(), backupB()];
    const groups = compareEntries(await toEntries(a), await toEntries(b));
    return { groups, text: summarize(groups, new Map([...a.patternNames, ...b.patternNames])) };
  }

  it("lines a renamed pattern up with itself", async () => {
    const { groups, text } = await report();
    const renamed = groups.find((g) => g.group === `pattern/${ID_B}`);
    assert.equal(renamed?.status, "changed");
    assert.match(text, new RegExp(`~ Old Name → New Name \\[${ID_B}\\]: preview, renamed\\n`));
  });

  it("says which parts of a pattern changed, with control values", async () => {
    const { text } = await report();
    assert.match(text, new RegExp(`~ Rainbow \\[${ID_A}\\]: code, bytecode, controls\\n`));
    assert.match(text, /~ sliderSpeed: 0.5 → 0.75\n/);
    assert.match(text, /\+ sliderHue: 0\n/);
  });

  it("reports removed patterns and counts", async () => {
    const { text } = await report();
    assert.match(text, /Patterns: 0 added, 1 removed, 2 changed, 0 unchanged/);
    assert.match(text, new RegExp(`- Doomed \\[${ID_C}\\]`));
  });

  it("reports playlist additions, removals, durations and order", async () => {
    const { text } = await report();
    assert.match(text, /_defaultplaylist_: 2 → 2 items/);
    assert.match(text, new RegExp(`\\+ New Name \\[${ID_B}\\] \\(10000 ms\\)`));
    assert.match(text, new RegExp(`- Doomed \\[${ID_C}\\]`));
    assert.match(text, /~ Rainbow \[A+\]: 30000 → 15000 ms/);
  });

  it("reports settings key by key and leaves identical files out", async () => {
    const { text } = await report();
    assert.match(text, /~ rev: 1 → 2/);
    assert.match(text, /- beat: \{"minBpm":38\}/);
    assert.doesNotMatch(text, /favicon/);
  });
});

describe("diffValues", () => {
  it("walks objects and compares arrays whole", () => {
    assert.deepEqual(diffValues({ a: { b: 1 }, c: [1, 2] }, { a: { b: 2 }, c: [1, 2] }), [
      { path: "a.b", status: "changed", a: 1, b: 2 },
    ]);
    assert.deepEqual(diffValues([1], [2]), [{ path: "", status: "changed", a: [1], b: [2] }]);
  });
});

describe("safeName", () => {
  it("replaces characters file systems reject", () => {
    assert.equal(safeName('a/b:c*d?"e"<f>|g'), "a_b_c_d__e__f__g");
    assert.equal(safeName(" trailing dots... "), "trailing dots");
    assert.equal(safeName(""), "untitled");
  });
});

describe("manifest", () => {
  it("lists every archive entry, including undecodable ones", async () => {
    const backup = decodeBackupText(archive({ "/broken": "!!", "/obconf.dat": new Uint8Array([5]) }));
    const lines = (await manifest(backup)).trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /\/broken +! entry is not base64$/);
    assert.match(lines[1], /^[0-9a-f]{64} +1 +raw +\/obconf\.dat$/);
  });
});
