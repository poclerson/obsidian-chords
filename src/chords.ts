// Pure helpers for parsing and matching VS Code-style chord key sequences.
// A chord is a sequence of one or more "steps". Each step is a key combination
// such as "Mod+k" or "Ctrl+Shift+P". Steps are separated by whitespace:
//   "Mod+k Mod+n"  ->  [Mod+k, Mod+n]

export type ChordStep = {
  modifiers: string[]; // canonical modifier names, e.g. ["Mod"]
  key: string;        // canonical key name, e.g. "k", "Enter"
};

export type ChordBinding = {
  id: string;
  chord: string;       // raw chord string
  steps: ChordStep[];  // parsed
  commandId: string;
};

const MODIFIER_ALIASES: Record<string, string> = {
  mod: "Mod",
  ctrl: "Ctrl",
  control: "Ctrl",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
};

export const PLATFORM_IS_MAC =
  typeof navigator !== "undefined"
    ? /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "")
    : process.platform === "darwin";

export function canonicalModifier(name: string): string {
  const key = name.trim().toLowerCase();
  return MODIFIER_ALIASES[key] ?? name.trim();
}

export function normalizeKey(key: string): string {
  const k = key.trim();
  if (k === " ") return "Space";
  if (k.length === 1) return k.toLowerCase();
  // Capitalize first letter for named keys, keep rest.
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export function parseStep(token: string): ChordStep | null {
  const parts = token.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map(canonicalModifier);
  // dedupe modifiers preserving order
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const m of mods) {
    if (!seen.has(m)) {
      seen.add(m);
      uniq.push(m);
    }
  }
  return { modifiers: uniq, key: normalizeKey(key) };
}

export function parseChord(chord: string): ChordStep[] {
  const tokens = chord.trim().split(/\s+/).filter(Boolean);
  const steps: ChordStep[] = [];
  for (const t of tokens) {
    const s = parseStep(t);
    if (s) steps.push(s);
  }
  return steps;
}

export function formatStep(step: ChordStep): string {
  if (step.modifiers.length === 0) return step.key;
  return step.modifiers.join("+") + "+" + step.key;
}

export function formatChord(steps: ChordStep[]): string {
  return steps.map(formatStep).join(" ");
}

export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function pressedModifiers(evt: KeyEventLike): string[] {
  const mods: string[] = [];
  if (evt.ctrlKey) mods.push("Ctrl");
  if (evt.metaKey) mods.push("Meta");
  if (evt.shiftKey) mods.push("Shift");
  if (evt.altKey) mods.push("Alt");
  return mods;
}

// Expand "Mod" to platform modifier for comparison.
export function expandMod(mods: string[]): string[] {
  return mods.map((m) => (m === "Mod" ? (PLATFORM_IS_MAC ? "Meta" : "Ctrl") : m));
}

export function eventKey(evt: KeyEventLike): string {
  const k = evt.key === " " ? "Space" : evt.key;
  if (k.length === 1) return k.toLowerCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export function matchesStep(evt: KeyEventLike, step: ChordStep): boolean {
  const evtMods = new Set(pressedModifiers(evt));
  const stepMods = new Set(expandMod(step.modifiers));
  if (evtMods.size !== stepMods.size) return false;
  for (const m of stepMods) {
    if (!evtMods.has(m)) return false;
  }
  return eventKey(evt) === normalizeKey(step.key);
}

export function bindingFromRaw(id: string, chord: string, commandId: string): ChordBinding {
  return { id, chord, steps: parseChord(chord), commandId };
}

export function isValidBinding(b: ChordBinding): boolean {
  return b.steps.length >= 2 && !!b.commandId;
}
