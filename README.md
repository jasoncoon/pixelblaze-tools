# Pixelblaze Tools

Tools for viewing and comparing Pixelblaze backups (`.pbb`) and patterns (`.epe` exports, or bare source as `.pbp`, `.js`, `.txt`). Requires Node 24+. Node runs the TypeScript directly, so there is no build step.

```sh
npm install
npm run pbb -- summary a b      # report what changed from a to b
npm run pbb -- explode a [dir]  # unpack into readable files (default out/<file name>)
npm run pbb -- diff a b         # explode both into out/, then summarize
```

Either side can be a backup or a pattern file. Backups and `.epe` files are told apart by content; bare source by its extension.

- **Two backups:** everything is compared.
- **A pattern and a backup:** the pattern is compared with its copy in the backup, found by id or, failing that, by name.
- **Two pattern files:** compared as one pattern, even when their ids differ.

Across formats, only what both can hold is compared. An `.epe` has no bytecode or file version, and bare source has only code, so those never show as differences.

## Web app

```sh
npm run web          # dev server at http://localhost:5173
npm run web:build    # static build in dist/web (serve it, e.g. `npx vite preview`)
```

Drop one file to look through it, or two to compare them; with two loaded, **Compare / View A / View B** switches between the comparison and either file on its own.

Viewing one file: a backup opens on the device's settings and a gallery of its patterns with their previews; a pattern file opens straight on its details. A pattern's details show its preview, ID and sizes, its speed and palette settings, its controls with their saved values (sliders, toggles, color swatches), and its exported variables, with the code on its own tab. Controls come from the code's exported functions, the way the device finds them, so a saved value whose control was removed from the code is flagged. Playlists show as a table of pattern names that open each pattern. A pattern's preview image holds one captured frame per row and one pixel per column, so it plays back as an animation (about 30 fps, with pause, a frame scrubber, speed, and a playhead on the still image you can click to jump to a frame). It plays on the device's pixel map when one is available (2D, a spiral for 1D, rotating with axes for 3D), using the backup's own `/pixelmap.dat` or, for a pattern file, the map of a backup loaded on the other side; otherwise it plays as a strip. When comparing, A and B play in sync on one set of controls. In a comparison, a pattern that exists on only one side opens on the same details page.

When comparing, drop two backups or pattern files anywhere on the page, or pick each side. A comparison that comes down to a single pattern opens straight on it. Two files dropped together are sorted by name, which puts device backups in date order. Files are read in the browser and never uploaded. The sidebar lists patterns, playlists and settings with added (+), removed (−), changed (~) and unchanged (=) marks; arrow keys move through it. A pattern opens with tabs for its code, controls, preview and meta: text shows in a Monaco diff with unchanged stretches folded, previews show side by side, and other binary files show size, hash and the first differing byte. The overview is the same report as `pbb summary`.

## Exploded layout

| Path | From |
|---|---|
| `patterns/<name> (<id>)/main.js` | pattern source, from the LZ-String sources in `/x/<id>` |
| `patterns/<name> (<id>)/sources.json` | any other source keys (e.g. `blockly`), if present |
| `patterns/<name> (<id>)/controls.json` | `/x/<id>.c` |
| `patterns/<name> (<id>)/preview.jpg` | the pattern's preview image |
| `patterns/<name> (<id>)/meta.json` | name, file version, and the sizes and hashes of the preview and bytecode |
| `playlists/<name>.json`, `.txt` | `/l/<name>`; the `.txt` lists one item per line with pattern names |
| `config.json`, `config2.json` | pretty-printed |
| `pixelmap.txt`, `pixelmap.dat.txt` | one point per line |
| `files/…` | everything else, copied as is |
| `manifest.txt` | every archive entry: sha256, size, how it was decoded, and any decode error |

Compare two exploded folders with `git diff --no-index out/A out/B`, a folder-compare tool, or `code --diff` on individual files.

## Layout

- `src/formats/`: byte-level formats, mostly ported from neoimage `www/src/formats/`, plus `epe.ts`
- `src/backup/`: decode → entries → pair → compare → summary. This code has no Node imports, so the web app reuses it.
- `src/cli/pbb.ts`: the command-line tool
- `web/`: the Preact + Vite web app, built on `src/backup/`

`npm test` typechecks and runs the tests.

## Deployment

`.github/workflows/pages.yml` publishes the web app to GitHub Pages on every push to `main` (or when run by hand from the Actions tab). It typechecks and tests first, so a failing build never replaces the live site. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
