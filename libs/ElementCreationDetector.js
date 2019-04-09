/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class ElementCreationDetector {
  constructor(overrider) {
    this.rules = new Set();
    this.overrider = overrider;
    this.audioConstructorHook = this.overrider.register(
      "window.Audio", {
        call: (win, origFn, args) => {
          return this._handle("audio", win, origFn, args);
        },
      }
    );
    this.createElementHook = this.overrider.register(
      "document.createElement", {
        call: (doc, origFn, args) => {
          const name = args[0].toLowerCase();
          return this._handle(name, doc, origFn, args);
        },
      }
    );
    this.createElementNSHook = this.overrider.register(
      "document.createElementNS", {
        call: (doc, origFn, args) => {
          const name = args[0].toLowerCase();
          return this._handle(name, doc, origFn, args);
        },
      }
    );
    this.importNodeHook = this.overrider.register(
      "document.importNode", {
        call: (doc, origFn, args) => {
          const name = args[0].nodeName.toLowerCase();
          return this._handle(name, doc, origFn, args);
        },
      }
    );
    this.cloneNodeHook = this.overrider.register(
      "Element.prototype.cloneNode", {
        call: (elem, origFn, args) => {
          const name = elem.nodeName.toLowerCase();
          return this._handle(name, elem, origFn, args);
        },
      }
    );
    this.innerHTMLHook = this.overrider.register(
      "Element.prototype.innerHTML", {
        set: (elem, origSetter, args) => {
          return this._handleHTML(args[0], elem, origSetter, args);
        },
      }
    );
    this.outerHTMLHook = this.overrider.register(
      "Element.prototype.outerHTML", {
        set: (elem, origSetter, args) => {
          return this._handleHTML(args[0], elem, origSetter, args);
        },
      }
    );
  }

  watch(rule) {
    if (!this.rules.has(rule)) {
      /* Normalize and pre-process the rules */
      const rawNames = rule.names || [];
      rule.names = [];
      rule.regexes = {};
      for (const rawName of rawNames) {
        const name = rawName.trim().toLowerCase();
        if (!rule.regexes[name]) {
          rule.regexes[name] = new RegExp(`<${name}`, "i");
          rule.names.push(name);
        }
      }
      this.rules.add(rule);
    }
  }

  unwatch(rule) {
    if (this.rules.has(rule)) {
      this.rules.delete(rule);
    }
  }

  enable() {
    this.overrider.enable(this.audioConstructorHook);
    this.overrider.enable(this.createElementHook);
    this.overrider.enable(this.createElementNSHook);
    this.overrider.enable(this.importNodeHook);
    this.overrider.enable(this.cloneNodeHook);
    this.overrider.enable(this.innerHTMLHook);
    this.overrider.enable(this.outerHTMLHook);
  }

  disable() {
    this.overrider.disable(this.audioConstructorHook);
    this.overrider.disable(this.createElementHook);
    this.overrider.disable(this.createElementNSHook);
    this.overrider.disable(this.importNodeHook);
    this.overrider.disable(this.cloneNodeHook);
    this.overrider.disable(this.innerHTMLHook);
    this.overrider.disable(this.outerHTMLHook);
  }

  _handleHTML(html, elem, origFn, args) {
    for (const rule of this.rules.values()) {
      for (const [name, regex] of Object.entries(rule.regexes)) {
        if (regex.test(html)) {
          const result = rule.onCreated(name, elem);
          if (result !== undefined) {
            return result;
          }
        }
      }
    }
    return this.overrider.doCall(elem, origFn, args);
  }

  _handle(name, elem, origFn, args) {
    for (const rule of this.rules.values()) {
      if (rule.names.includes(name)) {
        const result = rule.onCreated(name, elem);
        if (result !== undefined) {
          return result;
        }
      }
    }
    return this.overrider.doCall(elem, origFn, args);
  }
}
