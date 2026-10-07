/**
 * Monaco with only what a read-only diff needs: the editor core, its diff worker, the icon
 * font, diff navigation, find, and the JavaScript tokenizer. The full bundle's language
 * services would flag Pixelblaze built-ins like `hsv` as undefined and add megabytes for nothing.
 */

import * as monaco from "monaco-editor/editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import "monaco-editor/features/codicon/register";
import "monaco-editor/features/diffEditor/register";
import "monaco-editor/features/find/register";
import "monaco-editor/languages/definitions/javascript/register";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => monaco.editor.setTheme(dark.matches ? "vs-dark" : "vs");
dark.addEventListener("change", applyTheme);
applyTheme();

export { monaco };
