# Obsidian Chords

VS Code-style chord keyboard shortcuts for Obsidian, e.g. `Cmd+K` then `Cmd+N`.

## How it works

Obsidian's built-in hotkey system only supports single key combinations. This plugin adds a small state machine on top: when you press the first key of a configured chord, it waits (for a configurable timeout) for the second key. If the second key matches, the bound Obsidian command runs; otherwise the chord is cancelled.

Chords are configured in the plugin settings (they cannot be expressed in Obsidian's native hotkey settings).

## Settings

- **Chord timeout (ms)** — how long to wait for the next key.
- **Show status bar indicator** — displays the pending chord.
- **Chord bindings** — list of `{chord, command}` pairs. Use the **Record** button to capture a chord, or type it manually as space-separated steps, e.g. `Mod+k Mod+n`. `Mod` = Cmd on macOS, Ctrl otherwise.

## Notes

- If a configured chord's first key conflicts with an existing Obsidian hotkey, the plugin intercepts it (preventDefault) so the chord can complete.
- Press `Escape` (or wait for the timeout) to cancel a pending chord.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # typecheck + production build
npm test         # run tests
```
