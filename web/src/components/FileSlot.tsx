import { ACCEPTED_FILES, describeFile, type LoadedFile } from "../load.ts";

export type Slot =
  | { status: "empty" }
  | { status: "loading"; fileName: string }
  | { status: "loaded"; loaded: LoadedFile }
  | { status: "error"; fileName: string; message: string };

interface Props {
  side: "A" | "B";
  slot: Slot;
  /** Whether the other side has a file, which makes this one optional. */
  otherLoaded: boolean;
  onFile: (file: File) => void;
}

/** One side's file: click to pick, or drop a file on it to put it on that side. */
export function FileSlot({ side, slot, otherLoaded, onFile }: Props) {
  const fileName = slot.status === "loaded" ? slot.loaded.fileName : slot.status === "empty" ? undefined : slot.fileName;

  return (
    <label
      class={`slot slot-${slot.status}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files[0];
        if (file) onFile(file);
      }}
    >
      <input
        type="file"
        accept={ACCEPTED_FILES}
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          if (input.files?.[0]) onFile(input.files[0]);
          input.value = "";
        }}
      />
      <span class="slot-side">{side}</span>
      <span class="slot-body">
        <span class="slot-name" title={fileName}>{fileName ?? (otherLoaded ? "Add a file to compare" : `Choose a file…`)}</span>
        <span class="slot-status">
          {slot.status === "loading" && "Reading…"}
          {slot.status === "error" && slot.message}
          {slot.status === "loaded" && describeFile(slot.loaded)}
          {slot.status === "empty" && (otherLoaded ? "optional" : '')}
        </span>
      </span>
    </label>
  );
}
