/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/*
  EventListenerManager is used to listen for the addition, removal,
  or firing of DOM events. It can detect event handlers added via
  addEventListener or setting the on-handlers of HTML elements
  using JS or directly set as markup attributes. In order for it
  to detect all of these early enough, it must be loaded before
  the page begins loading, as it uses DOM Mutation Events and
  overrides on the JS window environment to detect listeners.
*/

class EventListenerManager {
  constructor(overrider, logger, previousInstance) {
    this.overrider = overrider;
    this.logger = logger || (function() {});
    this.overrides = new Set();
    this.currentInstance = this;
    if (previousInstance) {
      this.handlerProxies = previousInstance.handlerProxies;
      previousInstance.currentInstance = this;
    } else {
      this.handlerProxies = new WeakMap();
    }
    this.monitorElementOnEventProperties();
    this.monitorElementOnEventAttributes();
    this.monitorEventListenerAPI();
  }

  watch(override) {
    this.overrides.add(override);
  }

  unwatch(override) {
    this.overrides.delete(override);
  }

  overrideCaresAboutEvent(override, type, elem) {
    if (override.types) {
      if (Array.isArray(override.types)) {
        if (!override.types.includes(type)) {
          return false;
        }
      } else if (override.types instanceof Function) {
        if (!override.types(type)) {
          return false;
        }
      } else if (override.types instanceof RegExp) {
        if (override.types.match(type).length < 1) {
          return false;
        }
      } else if (override.types !== type) {
        return false;
      }
    }
    if (override.matches) {
      if (Array.isArray(override.matches)) {
        for (const match of override.matches) {
          if (!this.elementMatches(elem, match)) {
            return false;
          }
        }
      } else if (!this.elementMatches(elem, override.matches)) {
        return false;
      }
    }
    return true;
  }

  elementMatches(elem, match) {
    if (match === "document") {
      return elem instanceof Document;
    } else if (match === "window") {
      return elem instanceof Window;
    } else if (elem.matches && typeof match === "string") {
      return elem.matches(match);
    }
    return elem === match;
  }

  onEvent(thisObj, event, originalHandler) {
    let stopEvent = false;
    for (const override of this.overrides.values()) {
      if (override.onEvent &&
          this.overrideCaresAboutEvent(override, event.type, event.target) &&
          override.onEvent(thisObj, this.overrider.unwrap(originalHandler), event) === false) {
        stopEvent = true;
      }
    }
    if (!stopEvent) {
      if (originalHandler.handleEvent) {
        return originalHandler.handleEvent(event);
      }
      return originalHandler.call(this, event);
    }
    return undefined;
  }

  ensureHandlerIsProxied(elem, type, handler, oldValue) {
    if (!handler) {
      return;
    }

    const actualType = type.substr(2); /* drop the "on" */

    const existingProxy = this.handlerProxies[handler];
    if (existingProxy && existingProxy !== handler) {
      for (const override of this.overrides.values()) {
        if (override.onRemoved &&
            this.overrideCaresAboutEvent(override, actualType, elem) &&
            override.onRemoved(elem, actualType, this.overrider.unwrap(handler)) === false) {
          elem[type] = oldValue;
          return;
        }
      }
    }

    for (const override of this.overrides.values()) {
      if (override.onAdded &&
          this.overrideCaresAboutEvent(override, actualType, elem) &&
          override.onAdded(elem, actualType, this.overrider.unwrap(handler), type) === false) {
        elem[type] = oldValue;
        return;
      }
    }

    const me = this;
    const proxy = function(event) {
      return me.currentInstance.onEvent(this, event || window.event, handler);
    };
    this.handlerProxies.set(handler, proxy);
    this.currentlySettingProxy = proxy;
    elem[type] = proxy;
  }

  monitorElementOnEventProperties() {
    if (this.attributeListenerHooks) {
      return;
    }
    this.possibleEventAttributes = {};
    this.attributeListenerHooks = [];
    const monitorOnEventPropertiesFor = (builtinName, builtin) => {
      for (const propName of Object.getOwnPropertyNames(builtin)) {
        if (!propName.startsWith("on")) {
          continue;
        }
        try {
          const override = this.overrider.register(
          `${builtinName}.${propName}`, {
            set: (elem, origSetter, [newValue]) => {
              if (this.currentlySettingProxy === newValue) {
                this.currentlySettingProxy = undefined;
                return origSetter.call(elem, newValue);
              }
              this.ensureHandlerIsProxied(elem, propName, newValue, elem[propName]);
              return origSetter.call(elem, elem[propName]);
            }
          });
          this.attributeListenerHooks.push(override);
          this.possibleEventAttributes[propName] = 1;
        } catch (_) {
          this.logger("CannotMonitor", [`${builtinName}.on${propName}`]);
          /* If the addon loads after page-load, there may be non-configurable
             properties like onPolymerReady, which will throw errors here */
        }
      }
    };
    monitorOnEventPropertiesFor("window", window);
    for (const builtinName of Object.getOwnPropertyNames(window)) {
      if (builtinName.startsWith("HTML") && builtinName.endsWith("Element")) {
        monitorOnEventPropertiesFor(`${builtinName}.prototype`, window[builtinName].prototype);
      }
    }
  }

  monitorElementOnEventAttributes() {
    if (this.observer) {
      return;
    }
    this.observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        const {addedNodes, attributeName, oldValue, target, type} = mutation;
        if (type === "childList") {
          for (const node of addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              for (const type of Object.keys(this.possibleEventAttributes)) {
                this.ensureHandlerIsProxied(node, type, node[type]);
              }
            }
          }
        } else if (type === "attributes") {
          if (this.possibleEventAttributes[attributeName]) {
            this.ensureHandlerIsProxied(target, attributeName, target[attributeName], oldValue);
          }
        }
      }
    });
  }

  monitorEventListenerAPI() {
    if (this.addEventListenerOverride) {
      return;
    }
    this.addEventListenerOverride = this.overrider.register(
      "EventTarget.prototype.addEventListener",
      {
        call: (elem, origAEL, args) => {
          const [type, handler, options] = args;
          for (const override of this.overrides.values()) {
            if (override.onAdded &&
                this.overrideCaresAboutEvent(override, type, elem) &&
                override.onAdded(elem, type, this.overrider.unwrap(handler), options) === false) {
              return undefined;
            }
          }
          if (!handler) { /* no handler, so this call will fizzle anyway */
            return undefined;
          }
          const me = this;
          const proxy = this.handlerProxies.get(handler) || function(event) {
            return me.currentInstance.onEvent(this, event, handler);
          };
          const returnValue = origAEL.call(elem, type, proxy, options);
          this.handlerProxies.set(handler, proxy);
          return returnValue;
        }
      }
    );
    this.removeEventListenerOverride = this.overrider.register(
      "EventTarget.prototype.removeEventListener",
      {
        call: (elem, origREL, args) => {
          const [type, handler, options] = args;
          if (handler && this.handlerProxies.has(handler)) {
            for (const override of this.overrides.values()) {
              if (override.onRemoved &&
                  this.overrideCaresAboutEvent(override, type, elem) &&
                  override.onRemoved(elem, type, this.overrider.unwrap(handler), options) === false) {
                return;
              }
            }
            const proxy = this.handlerProxies.get(handler);
            origREL.call(elem, type, proxy, options);
          } else {
            origREL.call(elem, type, handler, options);
          }
        }
      }
    );
  }

  enable() {
    this.overrider.enable(this.addEventListenerOverride);
    this.overrider.enable(this.removeEventListenerOverride);
    for (const override of this.attributeListenerHooks) {
      this.overrider.enable(override);
    }
    this.observer.observe(document, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
    });
  }

  disable() {
    this.overrider.unregister(this.addEventListenerOverride);
    this.overrider.unregister(this.removeEventListenerOverride);
    for (const override of this.attributeListenerHooks) {
      this.overrider.disable(override);
    }
    this.observer.disconnect();
  }
}
