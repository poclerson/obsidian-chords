/*
Obsidian Chords: VS Code-style chord keyboard shortcuts.
Bundled with esbuild. Source: src/
*/
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianChordsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/chords.ts
var MODIFIER_ALIASES = {
  mod: "Mod",
  ctrl: "Ctrl",
  control: "Ctrl",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  opt: "Alt"
};
var PLATFORM_IS_MAC = typeof navigator !== "undefined" ? /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "") : process.platform === "darwin";
function canonicalModifier(name) {
  var _a;
  const key = name.trim().toLowerCase();
  return (_a = MODIFIER_ALIASES[key]) != null ? _a : name.trim();
}
function normalizeKey(key) {
  const k = key.trim();
  if (k === " ") return "Space";
  if (k.length === 1) return k.toLowerCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}
function parseStep(token) {
  const parts = token.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map(canonicalModifier);
  const seen = /* @__PURE__ */ new Set();
  const uniq = [];
  for (const m of mods) {
    if (!seen.has(m)) {
      seen.add(m);
      uniq.push(m);
    }
  }
  return { modifiers: uniq, key: normalizeKey(key) };
}
function parseChord(chord) {
  const tokens = chord.trim().split(/\s+/).filter(Boolean);
  const steps = [];
  for (const t of tokens) {
    const s = parseStep(t);
    if (s) steps.push(s);
  }
  return steps;
}
function formatStep(step) {
  if (step.modifiers.length === 0) return step.key;
  return step.modifiers.join("+") + "+" + step.key;
}
function pressedModifiers(evt) {
  const mods = [];
  if (evt.ctrlKey) mods.push("Ctrl");
  if (evt.metaKey) mods.push("Meta");
  if (evt.shiftKey) mods.push("Shift");
  if (evt.altKey) mods.push("Alt");
  return mods;
}
function expandMod(mods) {
  return mods.map((m) => m === "Mod" ? PLATFORM_IS_MAC ? "Meta" : "Ctrl" : m);
}
function eventKey(evt) {
  const k = evt.key === " " ? "Space" : evt.key;
  if (k.length === 1) return k.toLowerCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}
function matchesStep(evt, step) {
  const evtMods = new Set(pressedModifiers(evt));
  const stepMods = new Set(expandMod(step.modifiers));
  if (evtMods.size !== stepMods.size) return false;
  for (const m of stepMods) {
    if (!evtMods.has(m)) return false;
  }
  return eventKey(evt) === normalizeKey(step.key);
}
function bindingFromRaw(id, chord, commandId) {
  return { id, chord, steps: parseChord(chord), commandId };
}
function isValidBinding(b) {
  return b.steps.length >= 2 && !!b.commandId;
}

// src/main.ts
var DEFAULT_SETTINGS = {
  timeoutMs: 1500,
  showIndicator: true,
  bindings: []
};
var bindingCounter = 0;
function newId() {
  bindingCounter += 1;
  return `binding-${Date.now()}-${bindingCounter}`;
}
var ObsidianChordsPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.bindings = [];
    this.pending = null;
    this.statusBarItem = null;
    this.keydownHandler = null;
  }
  async onload() {
    await this.loadSettings();
    this.rebuildBindings();
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatus("");
    this.addSettingTab(new ChordsSettingTab(this.app, this));
    this.keydownHandler = (e) => this.handleKeydown(e);
    this.registerDomEvent(document, "keydown", this.keydownHandler, { capture: true });
    this.addCommand({
      id: "cancel-chord",
      name: "Cancel pending chord",
      callback: () => this.cancelPending()
    });
  }
  onunload() {
    this.cancelPending();
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }
  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored != null ? stored : {});
    if (!Array.isArray(this.settings.bindings)) this.settings.bindings = [];
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  rebuildBindings() {
    this.bindings = this.settings.bindings.map(
      (b) => bindingFromRaw(b.id || newId(), b.chord, b.commandId)
    );
  }
  handleKeydown(e) {
    if (this.pending) {
      const p = this.pending;
      const nextStep = p.binding.steps[p.stepIndex];
      if (matchesStep(e, nextStep)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        p.stepIndex += 1;
        if (p.stepIndex >= p.binding.steps.length) {
          const cmdId = p.binding.commandId;
          this.cancelPending(false);
          void this.executeCommand(cmdId);
        } else {
          window.clearTimeout(p.timer);
          p.timer = window.setTimeout(() => this.cancelPending(), this.settings.timeoutMs);
          this.updateStatus(this.pendingStatusText());
        }
        return;
      }
      this.cancelPending(false);
    }
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
  pendingStatusText() {
    if (!this.pending) return "";
    const b = this.pending.binding;
    const done = b.steps.slice(0, this.pending.stepIndex).map((s) => formatStep(s)).join(" ");
    const remaining = b.steps.slice(this.pending.stepIndex).map((s) => formatStep(s)).join(" ");
    return `Chord: ${done} \u2192 ${remaining}`;
  }
  cancelPending(update = true) {
    if (this.pending) {
      window.clearTimeout(this.pending.timer);
      this.pending = null;
    }
    if (update) this.updateStatus("");
  }
  async executeCommand(id) {
    try {
      const app = this.app;
      if (app.commands && typeof app.commands.executeCommandById === "function") {
        await app.commands.executeCommandById(id);
      } else {
        new import_obsidian.Notice("Command not found: " + id);
      }
    } catch (err) {
      new import_obsidian.Notice("Failed to run command: " + String(err));
    }
    this.updateStatus("");
  }
  updateStatus(text) {
    if (!this.statusBarItem) return;
    if (!this.settings.showIndicator) {
      this.statusBarItem.setText("");
      this.statusBarItem.style.display = "none";
      return;
    }
    this.statusBarItem.style.display = "";
    this.statusBarItem.setText(text);
  }
};
var ChordsSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian Chords" });
    new import_obsidian.Setting(containerEl).setName("Chord timeout (ms)").setDesc("How long to wait for the next key in a chord.").addText((text) => {
      text.setValue(String(this.plugin.settings.timeoutMs)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 100) {
          this.plugin.settings.timeoutMs = n;
          await this.plugin.saveSettings();
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("Show status bar indicator").setDesc("Display the pending chord in the status bar.").addToggle((t) => {
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
    new import_obsidian.Setting(containerEl).addButton((btn) => {
      btn.setButtonText("Add binding").setCta().onClick(async () => {
        this.plugin.settings.bindings.push({ id: newId(), chord: "", commandId: "" });
        await this.persist();
        render();
      });
    });
    containerEl.createEl("p", {
      text: 'Chords are sequences of key combos separated by spaces, e.g. "Mod+k Mod+n". Mod = Cmd on macOS, Ctrl otherwise.',
      cls: "setting-item-description"
    });
  }
  async persist() {
    this.plugin.rebuildBindings();
    await this.plugin.saveSettings();
  }
  populateCommands(select, selected) {
    select.empty();
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "\u2014 select command \u2014";
    select.appendChild(opt0);
    const app = this.app;
    let cmds = [];
    try {
      if (app.commands && typeof app.commands.listCommands === "function") {
        cmds = app.commands.listCommands();
      } else if (app.commands && app.commands.commands) {
        cmds = Object.keys(app.commands.commands).map((id) => {
          var _a, _b;
          return {
            id,
            name: (_b = (_a = app.commands.commands[id]) == null ? void 0 : _a.name) != null ? _b : id
          };
        });
      }
    } catch (e) {
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
};
var RecordChordModal = class extends import_obsidian.Modal {
  constructor(app, onDone) {
    super(app);
    this.steps = [];
    this.infoEl = null;
    this.handler = null;
    this.finished = false;
    this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText("Record chord");
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: "Press the first key combination, then the second. Press Escape to cancel."
    });
    this.infoEl = this.contentEl.createEl("p", { text: "Waiting for first key\u2026" });
    this.handler = (e) => {
      if (this.finished) return;
      if (e.key === "Escape") {
        this.finished = true;
        this.close();
        return;
      }
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const mods = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.metaKey) mods.push("Meta");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      const isMac = /Mac/i.test(navigator.platform || "");
      const modStr = mods.map((m) => {
        if (m === "Meta" && isMac) return "Mod";
        if (m === "Ctrl" && !isMac) return "Mod";
        return m;
      }).join("+");
      const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const token = modStr ? `${modStr}+${key}` : key;
      this.steps.push(token);
      if (this.infoEl) this.infoEl.setText("Recorded: " + this.steps.join("  ") + "  \u2014 " + (this.steps.length < 2 ? "now second key\u2026" : "done"));
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
  onClose() {
    if (this.handler) window.removeEventListener("keydown", this.handler, true);
    this.contentEl.empty();
  }
};
