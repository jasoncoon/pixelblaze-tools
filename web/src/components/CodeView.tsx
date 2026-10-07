import { useEffect, useRef } from "preact/hooks";

import { monaco } from "../monaco.ts";

/** A read-only Monaco editor, for viewing one file's code or JSON. */
export function CodeView({ value, language }: { value: string; language: string }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor>(null);

  useEffect(() => {
    const view = monaco.editor.create(host.current!, {
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
    });
    editor.current = view;
    return () => {
      view.getModel()?.dispose();
      view.dispose();
    };
  }, []);

  useEffect(() => {
    const view = editor.current!;
    const previous = view.getModel();
    view.setModel(monaco.editor.createModel(value, language));
    previous?.dispose();
  }, [value, language]);

  return <div class="text-diff" ref={host} />;
}

export function languageFor(path: string): string {
  return /\.(js|json)$/.test(path) ? "javascript" : "plaintext";
}
