import { Plugin, PluginSettingTab, Setting, Modal, Notice, Platform, App } from "obsidian";
import {
  bindingFromRaw,
  isValidBinding,
  matchesStep,
  formatStep,
  parseChord,
  canonicalModifier,
  expandMod,
  normalizeKey,
  type ChordBinding,
} from "./chords";

type AppWithCommands = App & {
  commands?: {
    commands?: Record<string, { name?: string }>;
    listCommands?: () => { id: string; name: string }[];
    executeCommandById?: (id: string) => unknown;
  };
};

interface ChordsSettings {
  timeoutMs: number;
  showIndicator: boolean;
  bindings: { id: string; chord: string; commandId: string }[];
}

const DEFAULT_SETTINGS: ChordsSettings = {
  timeoutMs: 1500,
  showIndicator: true,
  bindings: [],
};

let bindingCounter = 0;
function newId(): string {
  bindingCounter += 1;
  return `binding-${Date.now()}-${bindingCounter}`;
}

export default class ObsidianChordsPlugin extends Plugin {
  settings: ChordsSettings = { ...DEFAULT_SETTINGS };
  bindings: ChordBinding[] = [];
  pending: { binding: ChordBinding; stepIndex: number; timer: number } | null = null;
  private statusBarItem: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.rebuildBindings();

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatus("");

    this.addSettingTab(new ChordsSettingTab(this.app, this));

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);
    this.registerDomEvent(document, "keydown", this.keydownHandler, { capture: true });

    // Command to cancel pending chord.
    this.addCommand({
      id: "cancel-chord",
      name: "Cancel pending chord",
      callback: () => this.cancelPending(),
    });
  }

  onunload(): void {
    this.cancelPending();
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ChordsSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
    if (!Array.isArray(this.settings.bindings)) this.settings.bindings = [];
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  rebuildBindings(): void {
    this.bindings = this.settings.bindings.map((b) =>
      bindingFromRaw(b.id || newId(), b.chord, b.commandId)
    );
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ignore if recording in settings? We'll handle via modal separately.
    if (this.pending) {
      const p = this.pending;
      const nextStep = p.binding.steps[p.stepIndex];
      if (matchesStep(e, nextStep)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        p.stepIndex += 1;
        if (p.stepIndex >= p.binding.steps.length) {
          // complete
          const cmdId = p.binding.commandId;
          this.cancelPending(false);
          void this.executeCommand(cmdId);
        } else {
          // reset timer
          window.clearTimeout(p.timer);
          p.timer = window.setTimeout(() => this.cancelPending(), this.settings.timeoutMs);
          this.updateStatus(this.pendingStatusText());
        }
        return;
      }
      // Not a match: cancel, then maybe start a new chord with this key.
      this.cancelPending(false);
      // fall through to try first-step match
    }

    // Try first step of any binding.
    for (const b of this.bindings) {
      if (!isValidBinding(b)) continue;
      const first = b.steps[0];
      if (matchesStep(e, first)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const timer = window.setTimeout(() => this.cancelPending(), this.settings.timeoutMs);
        this.pending = { binding: b, stepIndex: 1, timer };
        this.updateStatus(this.pendingStatusText());
        return;
      }
    }
  }

  pendingStatusText(): string {
    if (!this.pending) return "";
    const b = this.pending.binding;
    const done = b.steps.slice(0, this.pending.stepIndex).map((s) => formatStep(s)).join(" ");
    const remaining = b.steps.slice(this.pending.stepIndex).map((s) => formatStep(s)).join(" ");
    return `Chord: ${done} → ${remaining}`;
  }

  cancelPending(update = true): void {
    if (this.pending) {
      window.clearTimeout(this.pending.timer);
      this.pending = null;
    }
    if (update) this.updateStatus("");
  }

  private async executeCommand(id: string): Promise<void> {
    try {
      const app = this.app as AppWithCommands;
      if (app.commands && typeof app.commands.executeCommandById === "function") {
        await app.commands.executeCommandById(id);
      } else {
        new Notice("Command not found: " + id);
      }
    } catch (err) {
      new Notice("Failed to run command: " + String(err));
    }
    this.updateStatus("");
  }

  updateStatus(text: string): void {
    if (!this.statusBarItem) return;
    if (!this.settings.showIndicator) {
      this.statusBarItem.setText("");
      this.statusBarItem.setCssStyles({ display: "none" });
      return;
    }
    this.statusBarItem.setCssStyles({ display: "" });
    this.statusBarItem.setText(text);
  }
}


class ChordsSettingTab extends PluginSettingTab {
  plugin: ObsidianChordsPlugin;
  private searchQuery = "";

  constructor(app: App, plugin: ObsidianChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("chords-settings");

    new Setting(containerEl).setName("Chords").setHeading();

    new Setting(containerEl)
      .setName("Chord timeout (ms)")
      .setDesc("How long to wait for the next key in a chord.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.timeoutMs))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 100) {
              this.plugin.settings.timeoutMs = n;
              void this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Show status bar indicator")
      .setDesc("Display the pending chord in the status bar.")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.showIndicator).onChange((v) => {
          this.plugin.settings.showIndicator = v;
          void this.plugin.saveSettings();
          this.plugin.updateStatus(this.plugin.pending ? this.plugin.pendingStatusText() : "");
        });
      });

    new Setting(containerEl).setName("Hotkeys").setHeading();

    const search = containerEl.createEl("input", { type: "search" });
    search.placeholder = "Filter commands…";
    search.setCssStyles({ width: "100%" });
    search.setCssStyles({ marginBottom: "8px" });
    search.addEventListener("input", () => {
      this.searchQuery = search.value.toLowerCase();
      render();
    });

    const list = containerEl.createDiv({ cls: "chords-hotkey-list" });
    list.setCssStyles({ maxHeight: "60vh" });
    list.setCssStyles({ overflowY: "auto" });

    const commands = this.getCommands();

    const persist = async () => {
      this.plugin.rebuildBindings();
      await this.plugin.saveSettings();
    };

    const render = () => {
      list.empty();
      const q = this.searchQuery;
      const filtered = commands.filter((c) => {
        if (!q) return true;
        return (c.name || "").toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
      });

      for (const cmd of filtered) {
        const row = list.createDiv({ cls: "chords-hotkey-row" });
        row.setCssStyles({ display: "flex" });
        row.setCssStyles({ alignItems: "center" });
        row.setCssStyles({ justifyContent: "space-between" });
        row.setCssStyles({ padding: "6px 4px" });
        row.setCssStyles({ borderBottom: "1px solid var(--background-modifier-border)" });

        const left = row.createDiv();
        left.createDiv({ text: cmd.name || cmd.id, cls: "chords-cmd-name" }).setCssStyles({ fontWeight: "500" });
        const idEl = left.createDiv({ text: cmd.id, cls: "chords-cmd-id" });
        idEl.setCssStyles({ fontSize: "0.8em" });
        idEl.setCssStyles({ opacity: "0.6" });

        const right = row.createDiv();
        right.setCssStyles({ display: "flex" });
        right.setCssStyles({ alignItems: "center" });
        right.setCssStyles({ gap: "6px" });
        right.setCssStyles({ flexWrap: "wrap" });
        right.setCssStyles({ justifyContent: "flex-end" });

        const bindingsForCmd = this.plugin.settings.bindings.filter((b) => b.commandId === cmd.id);

        for (const b of bindingsForCmd) {
          const chip = right.createSpan({ cls: "chords-chip" });
          chip.textContent = b.chord || "(empty)";
          chip.setCssStyles({ padding: "2px 6px" });
          chip.setCssStyles({ borderRadius: "4px" });
          chip.setCssStyles({ background: "var(--background-secondary)" });
          chip.setCssStyles({ fontSize: "0.85em" });
          chip.setCssStyles({ display: "inline-flex" });
          chip.setCssStyles({ alignItems: "center" });
          chip.setCssStyles({ gap: "4px" });

          const x = chip.createSpan({ text: "×" });
          x.setCssStyles({ cursor: "pointer" });
          x.setCssStyles({ opacity: "0.7" });
          x.addEventListener("click", () => {
            const idx = this.plugin.settings.bindings.indexOf(b);
            if (idx >= 0) this.plugin.settings.bindings.splice(idx, 1);
            void persist().then(() => render());
          });

          const conflicts = this.getConflicts(b);
          if (conflicts.length > 0) {
            const bang = right.createSpan({ text: "!" });
            bang.setCssStyles({ color: "var(--text-error)" });
            bang.setCssStyles({ fontWeight: "700" });
            bang.setCssStyles({ cursor: "help" });
            bang.setCssStyles({ marginLeft: "2px" });
            bang.setAttribute("tabindex", "0");
            bang.setAttribute("title", "Conflict: " + conflicts.join(", "));
            bang.setAttribute("aria-label", bang.getAttribute("title") || "");
          }
        }

        const addBtn = right.createEl("button", { text: "+" });
        addBtn.setCssStyles({ padding: "0 8px" });
        addBtn.addEventListener("click", () => {
          const modal = new RecordChordModal(this.app, (chord) => {
            this.plugin.settings.bindings.push({ id: newId(), chord, commandId: cmd.id });
            void persist().then(() => render());
          });
          modal.open();
        });
      }

      if (filtered.length === 0) {
        list.createEl("p", { text: "No commands match." });
      }
    };

    render();

    containerEl.createEl("p", {
      text: "Click + on a command to record a chord (press two key combinations). Chords are sequences like \"Mod+k Mod+n\". Mod = Cmd on macOS, Ctrl otherwise.",
      cls: "setting-item-description",
    });
  }

  private getCommands(): { id: string; name: string }[] {
    const app = this.app as AppWithCommands;
    let cmds: { id: string; name: string }[] = [];
    try {
      if (app.commands && typeof app.commands.listCommands === "function") {
        cmds = app.commands.listCommands();
      } else if (app.commands && app.commands.commands) {
        const cmdsMap = app.commands.commands;
        cmds = Object.keys(cmdsMap).map((id) => ({
          id,
          name: cmdsMap[id]?.name ?? id,
        }));
      }
    } catch {
      cmds = [];
    }
    cmds.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    return cmds;
  }

  private stepsMatch(a: { modifiers: string[]; key: string }, b: { modifiers: string[]; key: string }): boolean {
    const aMods = new Set(expandMod(a.modifiers.map(canonicalModifier)));
    const bMods = new Set(expandMod(b.modifiers.map(canonicalModifier)));
    if (aMods.size !== bMods.size) return false;
    for (const m of aMods) if (!bMods.has(m)) return false;
    return normalizeKey(a.key) === normalizeKey(b.key);
  }

  private getConflicts(b: { chord: string; commandId: string }): string[] {
    const steps = parseChord(b.chord);
    const hm = (this.app as any).hotkeyManager;
    const commands = this.getCommands();
    const conflicts = new Set<string>();

    for (const step of steps) {
      for (const cmd of commands) {
        let hks: any[] = [];
        try {
          if (hm && typeof hm.getHotkeys === "function") {
            const custom = hm.getHotkeys(cmd.id);
            if (custom !== undefined) hks = custom || [];
            else if (typeof hm.getDefaultHotkeys === "function") hks = hm.getDefaultHotkeys(cmd.id) || [];
          }
        } catch {
          hks = [];
        }
        for (const hk of hks) {
          const hkStep = { modifiers: hk.modifiers || [], key: hk.key || "" };
          if (this.stepsMatch(hkStep, step)) {
            conflicts.add(cmd.name || cmd.id);
          }
        }
      }
      // conflicts with other chord bindings using the same step
      for (const other of this.plugin.settings.bindings) {
        if (other === b) continue;
        for (const os of parseChord(other.chord)) {
          if (this.stepsMatch(os, step)) {
            conflicts.add(`Chord: ${other.chord || "(empty)"}`);
          }
        }
      }
    }
    return [...conflicts];
  }
}

class RecordChordModal extends Modal {
  private onDone: (chord: string) => void;
  private steps: string[] = [];
  private infoEl: HTMLElement | null = null;
  private handler: ((e: KeyboardEvent) => void) | null = null;
  private finished = false;

  constructor(app: App, onDone: (chord: string) => void) {
    super(app);
    this.onDone = onDone;
  }

  onOpen(): void {
    this.titleEl.setText("Record chord");
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: "Press the first key combination, then the second. Press Escape to cancel.",
    });
    this.infoEl = this.contentEl.createEl("p", { text: "Waiting for first key…" });

    this.handler = (e: KeyboardEvent) => {
      if (this.finished) return;
      if (e.key === "Escape") {
        this.finished = true;
        this.close();
        return;
      }
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.metaKey) mods.push("Meta");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      const isMac = Platform.isMacOS;
      const modStr = mods
        .map((m) => {
          if (m === "Meta" && isMac) return "Mod";
          if (m === "Ctrl" && !isMac) return "Mod";
          return m;
        })
        .join("+");
      const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const token = modStr ? `${modStr}+${key}` : key;
      this.steps.push(token);
      if (this.infoEl) this.infoEl.setText("Recorded: " + this.steps.join("  ") + "  — " + (this.steps.length < 2 ? "now second key…" : "done"));

      if (this.steps.length >= 2) {
        this.finished = true;
        const chord = this.steps.join(" ");
        window.setTimeout(() => {
          this.onDone(chord);
          this.close();
        }, 200);
      }
    };
    window.addEventListener("keydown", this.handler, true);
  }

  onClose(): void {
    if (this.handler) window.removeEventListener("keydown", this.handler, true);
    this.contentEl.empty();
  }
}
