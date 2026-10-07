/**
 * Pixelblaze backup (.pbb) and pattern (.epe, .pbp, .js, .txt) tools.
 *
 *   pbb explode <file> [outDir]   unpack into readable files (default out/<file name>)
 *   pbb summary <a> <b>           report what changed from a to b
 *   pbb diff <a> <b>              both of the above: explode each, then summarize
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { compareEntries } from "../backup/compare.ts";
import { decodeAnyText, type DecodedBackup } from "../backup/decode.ts";
import { manifest, toEntries, type Entry } from "../backup/entries.ts";
import { pairSides, type Pairing } from "../backup/pair.ts";
import { summarize } from "../backup/summary.ts";

const MANIFEST = "manifest.txt";

async function load(path: string): Promise<DecodedBackup> {
  return decodeAnyText(await readFile(path, "utf8"), basename(path));
}

function defaultOutDir(filePath: string): string {
  return join("out", basename(filePath, extname(filePath)));
}

async function explode(filePath: string, outDir = defaultOutDir(filePath)): Promise<string> {
  const backup = await load(filePath);
  await clearOutDir(outDir);

  for (const entry of await toEntries(backup)) {
    const target = join(outDir, entry.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.content);
  }
  await writeFile(join(outDir, MANIFEST), await manifest(backup));
  return outDir;
}

/**
 * Empties a previous explode so files from patterns since deleted do not linger and show up
 * as unchanged. Only a folder this tool wrote (it has a manifest) is ever removed.
 */
async function clearOutDir(outDir: string) {
  if (!existsSync(outDir)) return;
  if ((await readdir(outDir)).length === 0) return;
  if (!existsSync(join(outDir, MANIFEST)))
    throw new Error(`${outDir} is not empty and was not written by pbb explode; choose another folder.`);
  await rm(outDir, { recursive: true });
}

async function compareFiles(pathA: string, pathB: string): Promise<{ report: string; paired: Pairing }> {
  const [a, b] = await Promise.all([load(pathA), load(pathB)]);
  const paired = pairSides({ backup: a, entries: await toEntries(a) }, { backup: b, entries: await toEntries(b) });
  const groups = compareEntries(paired.a, paired.b);
  const names = new Map([...a.patternNames, ...b.patternNames]);
  const note = paired.note ? `${paired.note}\n` : "";
  return { report: `a: ${pathA}\nb: ${pathB}\n${note}\n` + summarize(groups, names), paired };
}

/** The folder a side's compared pattern was exploded to, when only one pattern was compared. */
function patternDir(outDir: string, entries: readonly Entry[]): string | undefined {
  const meta = entries.find((e) => e.key.endsWith("/meta.json"));
  return meta && join(outDir, dirname(meta.path));
}

const USAGE = `Usage:
  pbb explode <file> [outDir]   unpack into readable files (default out/<file name>)
  pbb summary <a> <b>           report what changed from a to b
  pbb diff <a> <b>              explode both into out/, then summarize

Files are backups (.pbb) or patterns (.epe, or bare source as .pbp, .js, .txt).`;

async function main(args: string[]) {
  const [command, ...rest] = args;

  if (command === "explode" && (rest.length === 1 || rest.length === 2)) {
    console.log(`Wrote ${await explode(rest[0], rest[1])}`);
  } else if (command === "summary" && rest.length === 2) {
    process.stdout.write((await compareFiles(rest[0], rest[1])).report);
  } else if (command === "diff" && rest.length === 2) {
    const [outA, outB] = [defaultOutDir(rest[0]), defaultOutDir(rest[1])];
    if (outA === outB) throw new Error("Both files have the same name; explode them to separate folders.");
    await Promise.all([explode(rest[0], outA), explode(rest[1], outB)]);
    const { report, paired } = await compareFiles(rest[0], rest[1]);
    process.stdout.write(report);
    // Only one pattern was compared, so point the diff at its folders rather than the whole trees.
    const [dirA, dirB] = paired.note ? [patternDir(outA, paired.a), patternDir(outB, paired.b)] : [];
    const [diffA, diffB] = dirA && dirB ? [dirA, dirB] : [outA, outB];
    console.log(`Exploded to:\n  ${outA}\n  ${outB}\n\nFull diff:\n  git diff --no-index "${diffA}" "${diffB}"`);
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
