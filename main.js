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
var import_obsidian2 = require("obsidian");

// src/chords.ts
var import_obsidian = require("obsidian");
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
var PLATFORM_IS_MAC = import_obsidian.Platform.isMacOS;
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
var ObsidianChordsPlugin = class extends import_obsidian2.Plugin {
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
        new import_obsidian2.Notice("Command not found: " + id);
      }
    } catch (err) {
      new import_obsidian2.Notice("Failed to run command: " + String(err));
    }
    this.updateStatus("");
  }
  updateStatus(text) {
    if (!this.statusBarItem) return;
    if (!this.settings.showIndicator) {
      this.statusBarItem.setText("");
      this.statusBarItem.setCssStyles({ display: "none" });
      return;
    }
    this.statusBarItem.setCssStyles({ display: "" });
    this.statusBarItem.setText(text);
  }
};
var ChordsSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.searchQuery = "";
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("chords-settings");
    new import_obsidian2.Setting(containerEl).setName("Chords").setHeading();
    new import_obsidian2.Setting(containerEl).setName("Chord timeout (ms)").setDesc("How long to wait for the next key in a chord.").addText((text) => {
      text.setValue(String(this.plugin.settings.timeoutMs)).onChange((v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 100) {
          this.plugin.settings.timeoutMs = n;
          void this.plugin.saveSettings();
        }
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Show status bar indicator").setDesc("Display the pending chord in the status bar.").addToggle((t) => {
      t.setValue(this.plugin.settings.showIndicator).onChange((v) => {
        this.plugin.settings.showIndicator = v;
        void this.plugin.saveSettings();
        this.plugin.updateStatus(this.plugin.pending ? this.plugin.pendingStatusText() : "");
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Hotkeys").setHeading();
    const search = containerEl.createEl("input", { type: "search" });
    search.placeholder = "Filter commands\u2026";
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
          const x = chip.createSpan({ text: "\xD7" });
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
      text: 'Click + on a command to record a chord (press two key combinations). Chords are sequences like "Mod+k Mod+n". Mod = Cmd on macOS, Ctrl otherwise.',
      cls: "setting-item-description"
    });
  }
  getCommands() {
    const app = this.app;
    let cmds = [];
    try {
      if (app.commands && typeof app.commands.listCommands === "function") {
        cmds = app.commands.listCommands();
      } else if (app.commands && app.commands.commands) {
        const cmdsMap = app.commands.commands;
        cmds = Object.keys(cmdsMap).map((id) => {
          var _a, _b;
          return {
            id,
            name: (_b = (_a = cmdsMap[id]) == null ? void 0 : _a.name) != null ? _b : id
          };
        });
      }
    } catch (e) {
      cmds = [];
    }
    cmds.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    return cmds;
  }
  stepsMatch(a, b) {
    const aMods = new Set(expandMod(a.modifiers.map(canonicalModifier)));
    const bMods = new Set(expandMod(b.modifiers.map(canonicalModifier)));
    if (aMods.size !== bMods.size) return false;
    for (const m of aMods) if (!bMods.has(m)) return false;
    return normalizeKey(a.key) === normalizeKey(b.key);
  }
  getConflicts(b) {
    const steps = parseChord(b.chord);
    const hm = this.app.hotkeyManager;
    const commands = this.getCommands();
    const conflicts = /* @__PURE__ */ new Set();
    for (const step of steps) {
      for (const cmd of commands) {
        let hks = [];
        try {
          if (hm && typeof hm.getHotkeys === "function") {
            const custom = hm.getHotkeys(cmd.id);
            if (custom !== void 0) hks = custom || [];
            else if (typeof hm.getDefaultHotkeys === "function") hks = hm.getDefaultHotkeys(cmd.id) || [];
          }
        } catch (e) {
          hks = [];
        }
        for (const hk of hks) {
          const hkStep = { modifiers: hk.modifiers || [], key: hk.key || "" };
          if (this.stepsMatch(hkStep, step)) {
            conflicts.add(cmd.name || cmd.id);
          }
        }
      }
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
};
var RecordChordModal = class extends import_obsidian2.Modal {
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
      const isMac = import_obsidian2.Platform.isMacOS;
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
        window.setTimeout(() => {
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
