/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class LanguageOverrider {
  constructor(overrider) {
    this.overrider = overrider;
    this.languageHook = this.overrider.register(
      "navigator.language", {
        get: (navLang, origGetter, args) => {
          return this.language ||
                 this.overrider.doCall(navLang, origGetter, args);
        }
      }
    );
    this.languagesHook = this.overrider.register(
      "navigator.languages", {
        get: (navLang, origGetter, args) => {
          return this.languages ||
                 this.overrider.doCall(navLang, origGetter, args);
        }
      }
    );
  }

  setOptions(opts) {
    if (opts.languages) {
      this.language = undefined;
      this.languages = undefined;

      const acceptHeaderValue = opts.languages.trim();
      if (acceptHeaderValue) {
        this.languages = acceptHeaderValue.split(",").map(lang => {
          return lang.split(";")[0].trim();
        });
        this.language = this.languages[0];
      }
    }
  }

  enable() {
    this.overrider.enable(this.languageHook);
    this.overrider.enable(this.languagesHook);
  }

  disable() {
    this.overrider.disable(this.languageHook);
    this.overrider.disable(this.languagesHook);
  }
}
