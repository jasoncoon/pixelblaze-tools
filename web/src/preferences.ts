import { useState } from "preact/hooks";

const PREFIX = "pbb-diff:";

/** A per-browser view setting. Storage can be unavailable (private windows), so it is optional. */
export function usePreference<T>(name: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(PREFIX + name);
      return stored === null ? fallback : (JSON.parse(stored) as T);
    } catch {
      return fallback;
    }
  });

  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(PREFIX + name, JSON.stringify(next));
    } catch {
      // Not remembered; the setting still applies for this visit.
    }
  };
  return [value, update];
}
