/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class ElementStyleListener {
  constructor(overrider) {
    this.overrider = overrider;
    this.rules = new Set();
    this.relatedElementForPropsObj = new WeakMap();
    this.propertyNameHooks = {};
    this.styleHook = this.overrider.register(
      "HTMLElement.prototype.style", {
        get: (elem, origGetter, args) => {
          const css2Properties = this.overrider.doCall(elem, origGetter, args);
          this.relatedElementForPropsObj.set(css2Properties, elem);
          return css2Properties;
        }
      }
    );
  }

  watch(rule) {
    if (!this.rules.has(rule)) {
      this.rules.add(rule);
      for (const prop of rule.properties || []) {
        this._registerStylePropertyListener(prop);
      }
    }
  }

  unwatch(rule) {
    if (this.rules.has(rule)) {
      this.rules.delete(rule);
    }
  }

  enable() {
    this.enabled = true;
    this.overrider.enable(this.styleHook);
    for (const hook of Object.values(this.propertyNameHooks)) {
      this.overrider.enable(hook);
    }
  }

  disable() {
    this.enabled = false;
    this.overrider.disable(this.styleHook);
    for (const hook of Object.values(this.propertyNameHooks)) {
      this.overrider.disable(hook);
    }
  }

  _ruleMatches(rule, prop, elem, value) {
    if (rule.onlyValues) {
      if (Array.isArray(rule.onlyValues)) {
        if (!rule.onlyValues.includes(value)) {
          return false;
        }
      } else if (rule.onlyValues instanceof Function) {
        if (!rule.onlyValues(value)) {
          return false;
        }
      } else if (rule.onlyValues instanceof RegExp) {
        if (!rule.onlyValues.test(value)) {
          return false;
        }
      } else if (rule.onlyValues !== value) {
        return false;
      }
    }
    return (!rule.properties || rule.properties.includes(prop)) &&
           (!rule.selector || elem.matches(rule.selector));
  }

  _registerStylePropertyListener(prop) {
    if (this.propertyNameHooks[prop]) {
      return;
    }

    const hook = this.propertyNameHooks[prop] = this.overrider.register(
      `CSS2Properties.prototype.${prop}`, {
        get: (props, origGetter, args) => {
          if (this.relatedElementForPropsObj.has(props)) {
            const elem = this.relatedElementForPropsObj.get(props);
            for (const rule of this.rules.values()) {
              if (this._ruleMatches(rule, prop, elem, args[0])) {
                const rv = rule.onGet(prop, elem, args[0]);
                if (rv !== undefined) {
                  return rv;
                }
              }
            }
          }
          return this.overrider.doCall(props, origGetter, args);
        },
        set: (props, origSetter, args) => {
          if (this.relatedElementForPropsObj.has(props)) {
            const elem = this.relatedElementForPropsObj.get(props);
            for (const rule of this.rules.values()) {
              if (this._ruleMatches(rule, prop, elem, args[0])) {
                const replacement = rule.onSet(prop, elem, args[0]);
                if (replacement !== undefined) {
                  return this.overrider.doCall(props, origSetter, [replacement]);
                }
              }
            }
          }
          return this.overrider.doCall(props, origSetter, args);
        },
      }
    );
    if (this.enabled) {
      this.overrider.enable(hook);
    }
  }
}
