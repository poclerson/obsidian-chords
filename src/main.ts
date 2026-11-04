import { Plugin, PluginSettingTab, Setting, Modal, Notice } from "obsidian";
import {
  bindingFromRaw,
  formatChord,
  isValidBinding,
  matchesStep,
  parseChord,
  formatStep,
  type ChordBinding,
  type ChordStep,
} from "./chords";

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
        e.stopPropagation();
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
        e.stopPropagation();
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
      const app: any = this.app;
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
      this.statusBarItem.style.display = "none";
      return;
    }
    this.statusBarItem.style.display = "";
    this.statusBarItem.setText(text);
  }
}

class ChordsSettingTab extends PluginSettingTab {
  plugin: ObsidianChordsPlugin;
  constructor(app: any, plugin: ObsidianChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Chords" });

    new Setting(containerEl)
      .setName("Chord timeout (ms)")
      .setDesc("How long to wait for the next key in a chord.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.timeoutMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 100) {
              this.plugin.settings.timeoutMs = n;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Show status bar indicator")
      .setDesc("Display the pending chord in the status bar.")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.showIndicator).onChange(async (v) => {
          this.plugin.settings.showIndicator = v;
          await this.plugin.saveSettings();
          this.plugin.updateStatus(this.plugin.pending ? this.plugin.pendingStatusText() : "");
        });
      });

    containerEl.createEl("h3", { text: "Chord bindings" });

    const list = containerEl.createDiv({ cls: "chords-bindings-list" });

    const render = () => {
      list.empty();
      this.plugin.settings.bindings.forEach((b, idx) => {
        const row = list.createDiv({ cls: "chords-binding-row" });
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.alignItems = "center";
        row.style.marginBottom = "8px";

        const chordInput = row.createEl("input", { type: "text" });
        chordInput.value = b.chord;
        chordInput.placeholder = "Mod+k Mod+n";
        chordInput.style.flex = "1";
        chordInput.addEventListener("change", async () => {
          b.chord = chordInput.value;
          await this.persist();
        });

        const recordBtn = row.createEl("button", { text: "Record" });
        recordBtn.addEventListener("click", () => {
          const modal = new RecordChordModal(this.app, (chord) => {
            b.chord = chord;
            chordInput.value = chord;
            void this.persist();
          });
          modal.open();
        });

        const cmdSelect = row.createEl("select");
        cmdSelect.style.flex = "2";
        this.populateCommands(cmdSelect, b.commandId);
        cmdSelect.addEventListener("change", async () => {
          b.commandId = cmdSelect.value;
          await this.persist();
        });

        const delBtn = row.createEl("button", { text: "Delete" });
        delBtn.addEventListener("click", async () => {
          this.plugin.settings.bindings.splice(idx, 1);
          await this.persist();
          render();
        });
      });
    };

    render();

    new Setting(containerEl).addButton((btn) => {
      btn.setButtonText("Add binding").setCta().onClick(async () => {
        this.plugin.settings.bindings.push({ id: newId(), chord: "", commandId: "" });
        await this.persist();
        render();
      });
    });

    containerEl.createEl("p", {
      text: "Chords are sequences of key combos separated by spaces, e.g. \"Mod+k Mod+n\". Mod = Cmd on macOS, Ctrl otherwise.",
      cls: "setting-item-description",
    });
  }

  private async persist(): Promise<void> {
    this.plugin.rebuildBindings();
    await this.plugin.saveSettings();
  }

  private populateCommands(select: HTMLSelectElement, selected: string): void {
    select.empty();
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— select command —";
    select.appendChild(opt0);

    const app: any = this.app;
    let cmds: { id: string; name: string }[] = [];
    try {
      if (app.commands && typeof app.commands.listCommands === "function") {
        cmds = app.commands.listCommands();
      } else if (app.commands && app.commands.commands) {
        cmds = Object.keys(app.commands.commands).map((id) => ({
          id,
          name: app.commands.commands[id]?.name ?? id,
        }));
      }
    } catch {
      cmds = [];
    }
    cmds.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    for (const c of cmds) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name ? `${c.name} (${c.id})` : c.id;
      if (c.id === selected) opt.selected = true;
      select.appendChild(opt);
    }
  }
}

class RecordChordModal extends Modal {
  private onDone: (chord: string) => void;
  private steps: string[] = [];
  private infoEl: HTMLElement | null = null;
  private handler: ((e: KeyboardEvent) => void) | null = null;
  private finished = false;

  constructor(app: any, onDone: (chord: string) => void) {
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
      // Ignore lone modifier presses.
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.metaKey) mods.push("Meta");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      // Convert platform Mod? Record actual modifiers; but normalize Cmd/Ctrl to Mod? Keep actual for clarity?
      // We'll store using Mod convention: if (mac && meta) or (!mac && ctrl) single mod, use Mod.
      const isMac = /Mac/i.test(navigator.platform || "");
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
        setTimeout(() => {
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
