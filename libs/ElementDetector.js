/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class ElementDetector {
  constructor(name, previousInstance) {
    this.rules = new Set();

    if (previousInstance) {
      this.handlerProxies = previousInstance.handlerProxies;
      previousInstance.currentInstance = this;
    } else {
      this.handlerProxies = new WeakMap();
    }

    this.observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if ("addedNodes" in mutation) {
          for (const node of mutation.addedNodes) {
            if (node.matches) {
              for (const rule of this.rules.values()) {
                if (node.matches(rule.selector)) {
                  rule.currentMatches.add(node);
                  rule.onDetected(node);
                }
              }
            }
          }
        }
        if ("removedNodes" in mutation) {
          for (const node of mutation.removedNodes) {
            if (node.matches) {
              for (const rule of this.rules.values()) {
                if (rule.currentMatches.has(node)) {
                  rule.currentMatches.delete(node);
                  rule.onLost(node, mutation.attributeName, mutation.oldValue);
                }
              }
            }
          }
        }
        if (mutation.type === "attributes") {
          const node = mutation.target;
          if (node.matches) {
            for (const rule of this.rules.values()) {
              const currentlyMatches = rule.currentMatches.has(node);
              if (node.matches(rule.selector)) {
                if (!currentlyMatches) {
                  rule.currentMatches.add(node);
                  rule.onDetected(node, mutation.attributeName, mutation.oldValue);
                }
              } else if (currentlyMatches) {
                rule.currentMatches.delete(node);
                rule.onLost(node, mutation.attributeName, mutation.oldValue);
              }
            }
          }
        }
      }
    });
  }

  enable() {
    for (const rule of this.rules.values()) {
      this._findCurrentMatchesForRule(rule);
    }
    this.observer.observe(document, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
    });
  }

  disable() {
    this.observer.disconnect();
  }

  watch(rule) {
    if (!this.rules.has(rule)) {
      this.rules.add(rule);
      this._findCurrentMatchesForRule(rule);
    }
  }

  unwatch(rule) {
    if (this.rules.has(rule)) {
      this.rules.delete(rule);
      delete rule.currentMatches;
    }
  }

  _findCurrentMatchesForRule(rule) {
    const matches = rule.currentMatches = new WeakSet();
    document.querySelectorAll(rule.selector).forEach(node => {
      matches.add(node);
    });
  }
}
