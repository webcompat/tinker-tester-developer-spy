/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global cloneInto */

function CreateOverriderPageScript(pageScript) {
  const pageScriptFunction = pageScript.Function;
  const pageScriptObject = pageScript.Object;

  const clone = typeof cloneInto === "undefined" ? obj => obj :
                    obj => cloneInto(obj, pageScript, {cloneFunctions: true});

  function doCall(thisObj, fn, args) {
    if (!fn) {
      return undefined;
    }
    if (new.target) {
      return new (pageScriptFunction.prototype.bind.apply(fn, args));
    }
    return fn.apply(thisObj, args);
  }

  class PropertyHook {
    constructor(path, options) {
      this.path = typeof path === "string" ? path.split(".") : path;
      if (!this.checkIfConfigurable()) {
        throw `Cannot override ${path}; it's marked as non-configurable`;
      }
      this.revertPoint = undefined;
      if (options) {
        this.setOptions(options);
      }
    }

    setOptions(opts) {
      this.onGetter = opts.onGetter || ((obj, origGetter, args) => doCall(obj, origGetter, args));
      this.onSetter = opts.onSetter || ((obj, origSetter, args) => doCall(obj, origSetter, args));
      this.onCalled = opts.onCalled || ((obj, origFn, args) => doCall(obj, origFn, args));
      this.enumerable = opts.enumerable;
      if (opts.enabled) {
        this.enable();
      } else {
        this.disable();
      }
    }

    checkIfConfigurable() {
      if (this.enabled) {
        return true;
      }
      let obj = pageScript;
      let index = 0;
      const count = this.path.length;
      while (index < count - 1) {
        const name = this.path[index++];
        if (!obj[name]) {
          return true;
        }
        obj = obj[name];
      }
      const oldprop = this.findProperty(obj, this.path[this.path.length - 1]);
      return !oldprop || oldprop.configurable !== false;
    }

    enable() {
      if (this.enabled) {
        return;
      }
      this.enabled = true;
      let obj = pageScript;
      let index = 0;
      const count = this.path.length;
      this.revertPoint = undefined;
      while (index < count - 1) {
        let name = this.path[index++];
        if (obj[name]) {
          obj = obj[name];
        } else {
          /* If the property doesn't (yet) exist, then
             add in a mock-object so we can track any
             accesses for it early, but listen in case
             it is later changed to a different value
             and disable our current mock, then re-
             enable the rule again. */
          while (index++ < count) {
            obj = this.mockMissingProperty(obj, name);
            name = this.path[index];
          }
        }
      }
      this.overrideProperty(obj, this.path[this.path.length - 1]);
    }

    disable() {
      if (!this.revertPoint) {
        return;
      }
      const [obj, name, oldprop] = this.revertPoint;
      this.revertPoint = undefined;
      if (oldprop) {
        pageScriptObject.defineProperty(obj, name, oldprop);
      } else {
        delete obj[name];
      }
      this.enabled = false;
    }

    findProperty(obj, name) {
      let proto = obj;
      do {
        const prop = pageScriptObject.getOwnPropertyDescriptor(proto, name);
        if (prop) {
          return prop;
        }
        proto = pageScriptObject.getPrototypeOf(proto);
      } while (proto);
      return undefined;
    }

    mockMissingProperty(obj, name) {
      const oldprop = this.findProperty(obj, name);
      pageScriptObject.defineProperty(obj, name, {
        configurable: true, /* So reloading the addon doesn't throw an error */
        get: () => {
          const v = oldprop.get.call(obj);
          if (v) {
            pageScriptObject.defineProperty(obj, name, oldprop);
            if (!this.revertPoint) {
              this.revertPoint = [obj, name, oldprop];
            }
            this.enable();
          }
          return v;
        },
        set: v => {
          oldprop.set.call(obj, v);
          pageScriptObject.defineProperty(obj, name, oldprop);
          if (!this.revertPoint) {
            this.revertPoint = [obj, name, oldprop];
          }
          this.enable();
        },
      });
      return pageScriptObject.getOwnPropertyDescriptor(obj, name);
    }

    wrapGetterWithCallCheck(getter) {
      const me = this;
      return function wrapped() {
        const that = this;
        const got = me.onGetter(that, getter, arguments);
        if (typeof got === "function") {
          const fn = function() {
            return me.onCalled(that, got, arguments);
          };
          fn.__unwrapped = got;
          return fn;
        }
        return got;
      };
    }

    overrideProperty(obj, name) {
      const oldprop = this.findProperty(obj, name);
      if (!this.revertPoint) {
        this.revertPoint = [obj, name, oldprop];
      }
      const enumerable = this.enumerable !== undefined ? this.enumerable :
                            (oldprop && oldprop.enumerable || false);
      const newprop = {
        configurable: true, /* So reloading the addon doesn't throw an error */
        enumerable,
      };
      const me = this;
      if (oldprop) {
        const {value, get, set} = oldprop;
        if (typeof value === "function") {
          newprop.value = function() {
            return me.onCalled(this, value, arguments);
          };
        } else if (value !== undefined) {
          newprop.value = function() {
            return me.onGetter(this, value, arguments);
          };
        } else { /* must be get+set */
          newprop.get = function() {
            return me.onGetter(this, get, arguments);
          };
          newprop.set = function() {
            return me.onSetter(this, set, arguments);
          };
        }
      } else {
        newprop.get = function() {
          return me.onGetter(this, undefined, arguments);
        };
        newprop.set = function() {
          return me.onSetter(this, undefined, arguments);
        };
      }
      pageScriptObject.defineProperty(obj, name, clone(newprop));
    }
  }

  class DisableHook extends PropertyHook {
    enable() {
      if (this.revertPoint) {
        return; /* Already disabling the property */
      }

      let parentObj = window;
      let index = 0;
      const count = this.path.length;
      while (index < count - 1) {
        const name = this.path[index++];
        if (parentObj[name]) {
          parentObj = parentObj[name];
        } else {
          /* If the property doesn't exist, do nothing. */
          return;
        }
      }

      const revertName = this.path[index];
      const revertProp = this.findProperty(parentObj, revertName);
      this.revertPoint = [parentObj, revertName, revertProp];
      /* Try deleting outright first. */
      delete parentObj[revertName];
      /* If the value is still in the prototype, then just
         obscure ourselves as an undefined value. */
      if (revertName in parentObj) {
        Object.defineProperty(parentObj, revertName, {
          configurable: true,
          enumerable: false,
          value: undefined,
        });
      }
    }
  }

  let nextOverrideID = 1;
  const currentOverrides = {};
  return {
    register: (path, property) => {
      const id = nextOverrideID++;
      if (property === undefined) {
        currentOverrides[id] = new DisableHook(path);
      } else {
        currentOverrides[id] = new PropertyHook(path, {
          onGetter: property.get,
          onSetter: property.set,
          onCalled: property.call,
          enumerable: property.enumerable,
        });
      }
      return id;
    },
    enable: id => {
      const hook = currentOverrides[id];
      if (hook) {
        hook.enable();
      }
    },
    disable: id => {
      const hook = currentOverrides[id];
      if (hook) {
        hook.disable();
      }
    },
    unregister: id => {
      const hook = currentOverrides[id];
      if (hook) {
        hook.disable();
        delete currentOverrides[id];
      }
    },
    doCall: (thisObj, fn, args) => {
      return doCall(thisObj, fn, args);
    },
    unwrap: fn => {
      return fn.__unwrapped || fn;
    }
  };
}
