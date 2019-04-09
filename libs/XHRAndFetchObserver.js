/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class XHRAndFetchObserver {
  constructor(overrider) {
    this.overrider = overrider;
    this.rules = new Set();

    this.fetchHook = this.overrider.register(
      "window.fetch",
      {
        call: (win, origFetch, args) => {
          const method = ((args[1] || {}).method || "get").toLowerCase();
          const url = new URL(args[0] || "", location).href.toLowerCase();
          for (const rule of this.rules.values()) {
            if ((!rule.onlyMethods || rule.onlyMethods.match(method)) &&
                (!rule.onlyURLs || rule.onlyURLs.match(url))) {
              if (rule.onOpen && !rule.onOpen(args)) {
                return undefined;
              }
              if (rule.onSend && !rule.onSend(args)) {
                return undefined;
              }
            }
          }
          return this.overrider.doCall(win, origFetch, args);
        },
      }
    );

    this.openedXHRArgs = new WeakMap();

    /* Save the method and URL on the XHR objects when opened (for the send hook's use) */
    this.openXHRHook = this.overrider.register(
      "XMLHttpRequest.prototype.open",
      {
        call: (xhr, origOpen, args) => {
          this.openedXHRArgs.set(xhr, args);
          const method = ((args[1] || {}).method || "get").toLowerCase();
          const url = new URL(args[2] || "", location).href.toLowerCase();
          for (const rule of this.rules.values()) {
            if (rule.onOpen &&
                (!rule.onlyMethods || rule.onlyMethods.match(method)) &&
                (!rule.onlyURLs || rule.onlyURLs.match(url))) {
              if (!rule.onOpen(args)) {
                return undefined;
              }
            }
          }
          return this.overrider.doCall(xhr, origOpen, args);
        },
      }
    );

    this.sendXHRHook = this.overrider.register(
      "XMLHttpRequest.prototype.send",
      {
        call: (xhr, origSend, args) => {
          const openArgs = this.openedXHRArgs.get(xhr);
          const method = (openArgs[0] || "get").toLowerCase();
          const url = new URL(openArgs[1] || "", location).href.toLowerCase();
          for (const rule of this.rules.values()) {
            if (rule.onSend &&
                (!rule.onlyMethods || rule.onlyMethods.match(method)) &&
                (!rule.onlyURLs || rule.onlyURLs.match(url))) {
              rule.onSend(openArgs);
            }
          }
          return this.overrider.doCall(xhr, origSend, args);
        },
      }
    );
  }

  watch(rule) {
    if (!this.rules.has(rule)) {
      this.rules.add(rule);
    }
  }

  unwatch(rule) {
    if (this.rules.has(rule)) {
      this.rules.delete(rule);
    }
  }

  enable() {
    this.overrider.enable(this.fetchHook);
    this.overrider.enable(this.openXHRHook);
    this.overrider.enable(this.sendXHRHook);
  }

  disable() {
    this.overrider.disable(this.fetchHook);
    this.overrider.disable(this.openXHRHook);
    this.overrider.disable(this.sendXHRHook);
  }
}
