import { useEffect, useRef } from "preact/hooks";

import { monaco } from "../monaco.ts";

interface Props {
  original: string;
  modified: string;
  language: string;
  sideBySide: boolean;
}

/** A read-only Monaco diff that folds away long unchanged stretches. */
export function TextDiff({ original, modified, language, sideBySide }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor>(null);

  useEffect(() => {
    const diff = monaco.editor.createDiffEditor(host.current!, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderSideBySide: sideBySide,
      hideUnchangedRegions: { enabled: true, contextLineCount: 4, minimumLineCount: 6, revealLineCount: 20 },
      fontSize: 13,
    });
    editor.current = diff;
    return () => {
      const model = diff.getModel();
      diff.dispose();
      model?.original.dispose();
      model?.modified.dispose();
    };
  }, []);

  useEffect(() => {
    const diff = editor.current!;
    const previous = diff.getModel();
    diff.setModel({
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    });
    previous?.original.dispose();
    previous?.modified.dispose();
  }, [original, modified, language]);

  useEffect(() => editor.current!.updateOptions({ renderSideBySide: sideBySide }), [sideBySide]);

  return <div class="text-diff" ref={host} />;
}
