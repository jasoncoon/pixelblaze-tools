import { useState } from "preact/hooks";

import { groupCategory, groupTitle, type Category, type GroupChange, type Status } from "../../../src/backup/compare.ts";
import type { EntryGroup } from "../../../src/backup/entries.ts";
import { usePreference } from "../preferences.ts";

const SECTIONS: { category: Category; title: string }[] = [
  { category: "pattern", title: "Patterns" },
  { category: "playlist", title: "Playlists" },
  { category: "other", title: "Settings and files" },
];

export const MARK: Record<Status, string> = { added: "+", removed: "−", changed: "~", same: "=" };

/** A row: a compared group carries a status, a single file's group does not. */
export interface SidebarItem {
  group: string;
  title: string;
  /** What rows sort by; a renamed pattern sorts under its new name. */
  sortLabel: string;
  status?: Status;
}

export function compareItems(groups: readonly GroupChange[]): SidebarItem[] {
  return groups.map((g) => ({ group: g.group, title: groupTitle(g), sortLabel: (g.labelB ?? g.labelA)!, status: g.status }));
}

export function fileItems(groups: readonly EntryGroup[]): SidebarItem[] {
  return groups.map((g) => ({ group: g.group, title: g.label, sortLabel: g.label }));
}

interface Props {
  items: readonly SidebarItem[];
  /** Undefined for the overview. */
  selected: string | undefined;
  onSelect: (group: string | undefined) => void;
}

export function Sidebar({ items, selected, onSelect }: Props) {
  const [showUnchanged, setShowUnchanged] = usePreference("showUnchanged", false);
  const [query, setQuery] = useState("");
  const comparing = items.some((item) => item.status !== undefined);

  const needle = query.trim().toLowerCase();
  const visible = (item: SidebarItem) =>
    (!comparing || showUnchanged || item.status !== "same" || item.group === selected) &&
    (!needle || item.title.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle));

  const sections = SECTIONS.map(({ category, title }) => {
    const all = items.filter((item) => groupCategory(item) === category);
    const shown = all
      .filter(visible)
      .sort((x, y) => x.sortLabel.localeCompare(y.sortLabel, undefined, { sensitivity: "base" }));
    return { title, all, shown };
  });
  // The order the arrow keys walk: the overview, then every visible row top to bottom.
  const order: (string | undefined)[] = [undefined, ...sections.flatMap((s) => s.shown.map((item) => item.group))];

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = order.indexOf(selected);
    const next = order[Math.min(order.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    onSelect(next);
    document.querySelector<HTMLElement>(`[data-group="${CSS.escape(next ?? "")}"]`)?.focus();
  }

  return (
    <nav class="sidebar">
      <div class="sidebar-tools">
        <input
          type="search"
          placeholder="Filter by name"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        {comparing && (
          <label class="check">
            <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.currentTarget.checked)} />
            Show unchanged
          </label>
        )}
      </div>

      <div class="sidebar-list" onKeyDown={onKeyDown}>
        <button class={`row row-overview ${selected === undefined ? "selected" : ""}`} data-group="" onClick={() => onSelect(undefined)}>
          Overview
        </button>

        {sections.filter(({ all }) => all.length > 0).map(({ title, all, shown }) => (
          <section key={title}>
            <h2>
              {title} {comparing ? <Counts items={all} /> : <span class="counts">{all.length}</span>}
            </h2>
            {shown.length === 0 && <p class="muted row-empty">{needle ? "No matches" : "No differences"}</p>}
            {shown.map((item) => (
              <button
                key={item.group}
                class={`row ${item.status ? `status-${item.status}` : ""} ${item.group === selected ? "selected" : ""}`}
                data-group={item.group}
                title={item.group}
                onClick={() => onSelect(item.group)}
              >
                {item.status && <span class="mark" aria-label={item.status}>{MARK[item.status]}</span>}
                <span class="row-label">{item.title}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </nav>
  );
}

function Counts({ items }: { items: readonly SidebarItem[] }) {
  const count = (status: Status) => items.filter((item) => item.status === status).length;
  return (
    <span class="counts">
      {(["added", "removed", "changed"] as const).map((status) =>
        count(status) > 0 ? <span key={status} class={`count status-${status}`}>{MARK[status]}{count(status)}</span> : null,
      )}
    </span>
  );
}
