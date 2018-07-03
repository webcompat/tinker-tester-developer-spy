/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, Config */

// This content script is called before any other page scripts, so we
// can modify the page script environment and set up the ability to
// create and modify hooks before other page scripts run.

window.Messages = {
  apiAnnounceKey: browser.i18n.getMessage("apiAnnounceKey"),
  apiNoSuchHook: browser.i18n.getMessage("apiNoSuchHook"),
  LogIgnoringCall: browser.i18n.getMessage("logIgnoringCall"),
  LogElementCreated: browser.i18n.getMessage("logElementCreated"),
  LogElementDetected: browser.i18n.getMessage("logElementDetected"),
  LogElementLost: browser.i18n.getMessage("logElementLost"),
  LogListenerAddedOn: browser.i18n.getMessage("logListenerAddedOn"),
  LogListenerRemovedFrom: browser.i18n.getMessage("logListenerRemovedFrom"),
  LogEventFiredOn: browser.i18n.getMessage("logEventFiredOn"),
  LogGetterAccessed: browser.i18n.getMessage("logGetterAccessed"),
  LogSetterCalled: browser.i18n.getMessage("logSetterCalled"),
  LogCalledWithArgs: browser.i18n.getMessage("logCalledWithArgs"),
  LogInvalidFunctionBind: browser.i18n.getMessage("logInvalidFunctionBind"),
  LogBoundFunctionCalled: browser.i18n.getMessage("logBoundFunctionCalled"),
};

function pageScript(Config, Messages) {
  const gSetTimeout = setTimeout;
  const gDateNow = Date.now;
  let gConfig = Config;

  const LogTrace = (function() {
    const origConsole = console;
    let tracing = false;
    return function logTrace() {
      if (tracing) {
        return;
      }
      tracing = true;
      origConsole.log.apply(origConsole, arguments);
      origConsole.trace();
      tracing = false;
    };
  }());

  function getActionFor(code) {
    if (code === "start debugger") {
      // eslint-disable-next-line no-debugger
      return () => { debugger; };
    } else if (code === "log stack trace") {
      return undefined;
    } else if (code === "ignore") {
      return (obj, args) => {
        LogTrace(Messages.LogIgnoringCall, obj, args);
        return null;
      };
    } else if (code === "nothing") {
      return function() {};
    }
    return new Function(code + "//" + Config.AllowEvalsToken);
  }

  class PropertyHook {
    constructor(path, options) {
      this.path = typeof path === "string" ? path.split(".") : path;
      this.revertPoint = undefined;
      if (options) {
        this.setOptions(options);
      }
    }

    setOptions(opts) {
      this.onGetter = opts.onGetter || ((o, rv) => rv);
      this.onSetter = opts.onSetter || ((o, nv) => nv);
      this.onCalled = opts.onCalled || ((o, a) => { return o.apply(this, a); });
      if (opts.enabled) {
        this.enable();
      } else {
        this.disable();
      }
    }

    enable() {
      if (this.enabled) {
        return;
      }
      let obj = window;
      let index = 0;
      const count = this.path.length;
      this.revertPoint = undefined;
      while (index < count - 1) {
        let name = this.path[index++];
        if (obj[name]) {
          obj = obj[name];
        } else {
          // if the property doesn't (yet) exist, then
          // add in a mock-object so we can track any
          // accesses for it early, but listen in case
          // it is later changed to a different value
          // and disable our current mock, then re-
          // enable the rule again.
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
        Object.defineProperty(obj, name, oldprop);
      } else {
        delete obj[name];
      }
    }

    findProperty(obj, name) {
      let proto = obj;
      do {
        const prop = Object.getOwnPropertyDescriptor(proto, name);
        if (prop) {
          return prop;
        }
        proto = Object.getPrototypeOf(proto);
      } while (proto);
      return undefined;
    }

    mockMissingProperty(obj, name) {
      const oldprop = this.findProperty(obj, name);
      Object.defineProperty(obj, name, {
        configurable: true, // So reloading the addon doesn't throw an error.
        get: () => {
          const v = oldprop.get.call(obj);
          if (v) {
            Object.defineProperty(obj, name, oldprop);
            if (!this.revertPoint) {
              this.revertPoint = [obj, name, oldprop];
            }
            this.enable();
          }
          return v;
        },
        set: v => {
          oldprop.set.call(obj, v);
          Object.defineProperty(obj, name, oldprop);
          if (!this.revertPoint) {
            this.revertPoint = [obj, name, oldprop];
          }
          this.enable();
        },
      });
      return Object.getOwnPropertyDescriptor(obj, name);
    }

    wrapValue(value) {
      if (typeof value === "function") {
        const me = this;
        return function() {
          let retval = me.onCalled(value, arguments);
          if (retval === undefined) {
            if (new.target) {
              retval = new (Function.prototype.bind.apply(value, arguments));
            } else {
              retval = value.apply(this, arguments);
            }
          }
          return retval;
        };
      }
      return value;
    }

    overrideProperty(obj, name) {
      const oldprop = this.findProperty(obj, name);
      if (!this.revertPoint) {
        this.revertPoint = [obj, name, oldprop];
      }
      const newprop = {
        configurable: true, // So reloading the addon doesn't throw an error.
        enumerable: oldprop && oldprop.enumerable || false,
      };
      if (oldprop && (oldprop.get || oldprop.set)) {
        const me = this;
        newprop.get = function() {
          return me.onGetter(this, oldprop.get.call(this));
        };
        newprop.set = function(newValue) {
          newValue = me.onSetter(this, newValue, oldprop.get.call(this));
          oldprop.set.call(this, newValue);
        };
      } else { // value, not get/set (or no such property)
        const me = this;
        newprop.get = function() {
          const curValue = oldprop && oldprop.value &&
                           me.wrapValue(oldprop.value);
          return me.onGetter(this, curValue);
        };
        if (!oldprop || oldprop.writable) {
          newprop.set = function(val) {
            const newValue = me.onSetter(this, me.wrapValue(val));
            if (oldprop) {
              oldprop.value = newValue;
            }
          };
        }
      }
      Object.defineProperty(obj, name, newprop);
    }
  }

  function getCommaSeparatedList(str) {
    const vals = str || "";
    if (vals) {
      return vals.split(",").map(v => v.trim());
    }
    return [];
  }

  const ElementCreatedHook = (function() {
    const listeners = [];
    let audioConstructorHook;
    let createElementHook;
    let createElementNSHook;
    let innerHTMLHook;
    let outerHTMLHook;

    function registerNameCreationListener(listener) {
      if (!createElementHook) {
        audioConstructorHook = new PropertyHook("window.Audio", {
          onCalled: (fn, args) => {
            for (const listener of listeners || []) {
              listener._onCreated("audio");
            }
          },
        });
        createElementHook = new PropertyHook("document.createElement", {
          onCalled: (fn, args) => {
            const name = args[0].toLowerCase();
            for (const listener of listeners || []) {
              listener._onCreated(name);
            }
          },
        });
        createElementNSHook = new PropertyHook("document.createElementNS", {
          onCalled: (fn, args) => {
            const name = args[0].toLowerCase();
            for (const listener of listeners || []) {
              listener._onCreated(name);
            }
          },
        });
        innerHTMLHook = new PropertyHook("Element.prototype.innerHTML", {
          onSetter: (obj, html) => {
            for (const listener of listeners || []) {
              listener._onHTML(html);
            }
            return html;
          },
        });
        outerHTMLHook = new PropertyHook("Element.prototype.outerHTML", {
          onSetter: (obj, html) => {
            for (const listener of listeners || []) {
              listener._onHTML(html);
            }
            return html;
          },
        });
      }

      if (!listeners.includes(listener)) {
        listeners.push(listener);
      }
    }

    return class ElementCreatedHook {
      constructor() {
        registerNameCreationListener(this);
      }

      setOptions(opts) {
        if (opts.onCreated) {
          this.onCreated = getActionFor(opts.onCreated) || function(elem) {
            LogTrace(Messages.LogElementCreated, elem);
          };
        }

        if (opts.names) {
          this.names = [];
          this.regexes = {};
          getCommaSeparatedList(opts.names).map(_name => {
            const name = _name.trim().toLowerCase();
            this.regexes[name] = new RegExp("<" + name, "i");
            this.names.push(name);
            return name;
          });
        } else {
          delete this.names;
        }

        if ("enabled" in opts) {
          if (opts.enabled) {
            this.enable();
          } else {
            this.disable();
          }
        }
      }

      enable() {
        this.enabled = true;

        audioConstructorHook.enable();
        createElementHook.enable();
        createElementNSHook.enable();
        innerHTMLHook.enable();
        outerHTMLHook.enable();
      }

      disable() {
        this.enabled = false;
      }

      _onCreated(name) {
        if (this.enabled && this.onCreated &&
            (!this.names || this.names.includes(name))) {
          this.onCreated(name);
        }
      }

      _onHTML(html) {
        if (this.enabled && this.onCreated && this.names) {
          for (const name of this.names) {
            if (this.regexes[name].test(html)) {
              this.onCreated(name);
            }
          }
        }
      }
    };
  }());

  class ElementDetectionHook {
    constructor() {
      this.observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if ("addedNodes" in mutation) {
            for (const node of mutation.addedNodes) {
              if (node.matches && node.matches(this.selector)) {
                this._currentlyMatchingNodes.add(node);
                this.onDetected(node);
              }
            }
          }
          if ("removedNodes" in mutation) {
            for (const node of mutation.removedNodes) {
              if (node.matches && this._currentlyMatchingNodes.has(node)) {
                this._currentlyMatchingNodes.delete(node);
                this.onLost(node, mutation.attributeName, mutation.oldValue);
              }
            }
          }
          if ("attributes") {
            const node = mutation.target;
            if (node.matches) {
              const currentlyMatches = this._currentlyMatchingNodes.has(node);
              if (node.matches(this.selector)) {
                if (!currentlyMatches) {
                  this._currentlyMatchingNodes.add(node);
                  this.onDetected(node, mutation.attributeName, mutation.oldValue);
                }
              } else if (currentlyMatches) {
                this._currentlyMatchingNodes.delete(node);
                this.onLost(node, mutation.attributeName, mutation.oldValue);
              }
            }
          }
        }
      });
    }

    setOptions(opts) {
      if ("enabled" in opts && !opts.enabled) {
        this.disable();
      }
      const shouldEnable = "enabled" in opts && opts.enabled;
      if ("selector" in opts) {
        this.selector = opts.selector;
        if (shouldEnable) {
          this._findCurrentlyMatchingNodes();
        }
      }
      if ("onDetected" in opts) {
        if (opts.onDetected) {
          this.onDetected = getActionFor(opts.onDetected) || function(elem) {
            LogTrace(Messages.LogElementDetected, elem);
          };
        } else {
          delete this.onDetected;
        }
      }
      if ("onLost" in opts) {
        if (opts.onLost) {
          this.onLost = getActionFor(opts.onLost) || function(elem, changed, oldValue) {
            LogTrace(Messages.LogElementLost, elem, changed, oldValue);
          };
        } else {
          delete this.onLost;
        }
      }
      if (shouldEnable) {
        this.enable();
      }
    }

    _findCurrentlyMatchingNodes() {
      const matches = this._currentlyMatchingNodes = new WeakSet();
      document.querySelectorAll(this.selector).forEach(node => {
        matches.add(node);
      });
    }

    enable() {
      this._findCurrentlyMatchingNodes();
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        subtree: true,
      });
    }

    disable() {
      this.observer.disconnect();
      this._currentlyMatchingNodes = new WeakSet();
    }
  };

  const EventListenerHook = (function() {
    const hooks = [];
    const oldAEL = EventTarget.prototype.addEventListener;
    const oldREL = EventTarget.prototype.removeEventListener;

    const registrations = {};

    EventTarget.prototype.addEventListener = function() {
      const elem = this;
      const type = arguments[0];
      const fn = arguments[1];
      const options = arguments[2];
      for (const hook of hooks) {
        hook._onAdded(type, elem, fn, options);
      }
      if (!fn) { // no handler, so this call will fizzle anyway
        return undefined;
      }
      if (!(type in registrations)) {
        registrations[type] = new WeakMap();
      }
      const replacementHandler = function(event) {
        let stopEvent = false;
        for (const hook of hooks) {
          if (hook._onEvent(event) === true) {
            stopEvent = true;
          }
        }
        if (!stopEvent) {
          return fn.apply(this, arguments);
        }
        return undefined;
      };
      oldAEL.call(this, arguments[0], replacementHandler, options);
      if (!registrations[type].has(fn)) {
        registrations[type].set(fn, replacementHandler);
      }
    };

    EventTarget.prototype.removeEventListener = function() {
      const elem = this;
      const type = arguments[0];
      const fn = arguments[1];
      const options = arguments[2];
      if (fn && registrations[type] && registrations[type].has(fn)) {
        const replacementHandler = registrations[type].get(fn);
        for (const hook of hooks) {
          hook._onRemoved(type, elem, replacementHandler);
        }
        oldREL.call(this, arguments[0], replacementHandler, options);
        registrations[type].delete(fn);
      } else {
        oldREL.apply(this, arguments);
      }
    };

    return class EventListenerHook {
      constructor() {
        hooks.push(this);
      }

      setOptions(opts) {
        if ("enabled" in opts) {
          this.enabled = !!opts.enabled;
        }
        this.types = opts.types;
        this.selector = opts.selector;
        this.onAdded = getActionFor(opts.onAdded) || function(type, elem, fn) {
          LogTrace(type, Messages.LogListenerAddedOn, elem, fn);
        };
        this.onRemoved = getActionFor(opts.onRemoved) || function(type, elem, fn) {
          LogTrace(type, Messages.LogListenerRemovedFrom, elem, fn);
        };
        this.onEvent = getActionFor(opts.onEvent) || function(event) {
          LogTrace(event.type, Messages.LogEventFiredOn, event.target, event);
        };
      }

      enable() {
        this.enabled = true;
      }

      disable() {
        this.enabled = false;
      }

      _onAdded(type, elem, fn) {
        if (this.enabled &&
            (!this.types || this.types.includes(type)) &&
            (!this.selector ||
              (this.selector === "document" && elem instanceof Document) ||
              (this.selector === "window" && elem instanceof Window) ||
              (elem.matches && elem.matches(this.selector)))) {
          this.onAdded(type, elem, fn);
        }
      }

      _onRemoved(type, elem, fn) {
        if (this.enabled &&
            (!this.types || this.types.includes(type)) &&
            (!this.selector ||
              (this.selector === "document" && elem instanceof Document) ||
              (this.selector === "window" && elem instanceof Window) ||
              (elem.matches && elem.matches(this.selector)))) {
          this.onRemoved(type, elem, fn);
        }
      }

      _onEvent(event) {
        if (this.enabled &&
            (!this.types || this.types.includes(event.type)) &&
            (!this.selector ||
              (this.selector === "document" && event.target instanceof Document) ||
              (this.selector === "window" && event.target instanceof Window) ||
              (event.target.matches && event.target.matches(this.selector)))) {
          this.onEvent(event);
        }
      }
    };
  }());

  const StyleListenerHook = (function() {
    const relatedElementForPropsObj = new WeakMap();

    new PropertyHook(
      "HTMLElement.prototype.style",
      {
        enabled: true,
        onGetter: (element, css2Properties) => {
          relatedElementForPropsObj.set(css2Properties, element);
          return css2Properties;
        }
      }
    );

    const PropertyNameHooks = {};
    function registerStylePropertyListener(listener, prop) {
      if (!PropertyNameHooks[prop]) {
        PropertyNameHooks[prop] = {
          listeners: [],
          hook: new PropertyHook(
            "CSS2Properties.prototype." + prop,
            {
              enabled: true,
              onGetter: (obj, value) => {
                if (relatedElementForPropsObj.has(obj)) {
                  const element = relatedElementForPropsObj.get(obj);
                  for (const listener of PropertyNameHooks[prop].listeners || []) {
                    value = listener._onGet(prop, element, value);
                  }
                }
                return value;
              },
              onSetter: (obj, newValue) => {
                if (relatedElementForPropsObj.has(obj)) {
                  const element = relatedElementForPropsObj.get(obj);
                  for (const listener of PropertyNameHooks[prop].listeners || []) {
                    newValue = listener._onSet(prop, element , newValue);
                  }
                }
                return newValue;
              },
            }
          ),
        };
      }
      const listeners = PropertyNameHooks[prop].listeners;
      if (!listeners.includes(listener)) {
        listeners.push(listener);
      }
    }

    return class StyleListenerHook {
      setOptions(opts) {
        if ("enabled" in opts) {
          this.enabled = !!opts.enabled;
        }

        this.onGet = getActionFor(opts.onGet) || function(prop, elem, value) {
          LogTrace(elem, ".style." + prop, Messages.LogGetterAccessed, value);
          return value;
        };
        this.onSet = getActionFor(opts.onSet) || function(prop, elem, value) {
          LogTrace(elem, ".style." + prop, Messages.LogSetterCalled, value);
          return value;
        };
        this.properties = getCommaSeparatedList(opts.properties);
        this.selector = opts.selector;
        this.onlyValues = opts.onlyValues;
        for (const prop of this.properties) {
          registerStylePropertyListener(this, prop);
        }
      }

      enable() {
        this.enabled = true;
      }

      disable() {
        this.enabled = false;
      }

      _onGet(prop, elem, returnValue) {
        if (this.enabled && this.onGet &&
            (!this.properties || this.properties.includes(prop)) &&
            (!this.selector || elem.matches(this.selector)) &&
            (!this.onlyValues || this.onlyValues.includes(returnValue))) {
          returnValue = this.onGet(prop, elem, returnValue);
        }
        return returnValue;
      }

      _onSet(prop, elem, newValue) {
        if (this.enabled && this.onSet &&
            (!this.properties || this.properties.includes(prop)) &&
            (!this.selector || elem.matches(this.selector)) &&
            (!this.onlyValues || this.onlyValues.includes(newValue))) {
          newValue = this.onSet(prop, elem, newValue);
        }
        return newValue;
      }
    };
  }());

  class XHRandFetchObserver {
    constructor() {
      this.fetchHook = new PropertyHook(
        "window.fetch",
        {
          onCalled: (obj, args) => {
            const method = ((args[1] || {}).method || "get").toLowerCase();
            const url = new URL(args[0] || "", location).href.toLowerCase();
            if (this.onSend &&
                (!this.onlyMethods || this.onlyMethods.includes(method)) &&
                (!this.onlyURLs || url.match(this.onlyURLs))) {
              this.onSend("fetch", args);
            }
          },
        }
      );

      const openedXHRArgs = new WeakMap();

      // Save the method and URL on the XHR objects when opened (for the send hook's use)
      this.openXHRHook = new PropertyHook(
        "XMLHttpRequest.prototype.open",
        {
          onCalled: (obj, args) => {
            openedXHRArgs.set(this, args);
          },
        }
      );

      this.sendXHRHook = new PropertyHook(
        "XMLHttpRequest.prototype.send",
        {
          onCalled: (obj, args) => {
            const openArgs = openedXHRArgs.get(this);
            const method = (openArgs[0] || "get").toLowerCase();
            const url = new URL(openArgs[1] || "", location).href.toLowerCase();
            if (this.onSend &&
                (!this.onlyMethods || this.onlyMethods.includes(method)) &&
                (!this.onlyURLs || url.match(this.onlyURLs))) {
              this.onSend("XHR sent", openArgs);
            }
          },
        }
      );
    }

    setOptions(opts) {
      if ("enabled" in opts) {
        if (opts.enabled) {
          this.enable();
        } else {
          this.disable();
        }
      }

      if (opts.onSend) {
        this.onSend = getActionFor(opts.onSend) || LogTrace;
      }

      if (opts.onlyMethods) {
        this.onlyMethods = getCommaSeparatedList(opts.onlyMethods);
      }

      if (opts.onlyURLs) {
        this.onlyURLs = opts.onlyURLs ? new RegExp(opts.onlyURLs) : undefined;
      }
    }

    enable() {
      this.fetchHook.enable();
      this.openXHRHook.enable();
      this.sendXHRHook.enable();
    }

    disable() {
      this.fetchHook.disable();
      this.openXHRHook.disable();
      this.sendXHRHook.disable();
    }
  }

  class GeolocationHook {
    constructor() {
      this.enabled = false;
      this.watchers = {};
      this.nextWatcherId = 1;
    }

    getCoords() {
      return Object.assign(this.geolocation, {timestamp: gDateNow.call()});
    }

    updateWatcher(callback) {
      gSetTimeout.call(window, () => callback(this.getCoords()), 1);
    }

    setOptions(opts) {
      if (opts.enabled) {
        this.enable();
      } else {
        this.disable();
      }

      if (opts.accuracy || opts.altitude || opts.altitudeAccuracy ||
          opts.heading || opts.latitude || opts.longitude || opts.speed) {
        this.geolocation = {
          coords: {
            accuracy: parseFloat(opts.accuracy) || 1000,
            altitude: parseFloat(opts.altitude) || 0,
            altitudeAccuracy: parseFloat(opts.altitudeAccuracy) || 0,
            heading: parseFloat(opts.heading) || NaN,
            latitude: parseFloat(opts.latitude) || 0,
            longitude: parseFloat(opts.longitude) || 0,
            speed: parseFloat(opts.speed) || NaN,
          }
        };

        for (const callback of Object.values(this.watchers)) {
          this.updateWatcher(callback);
        }
      }
    }

    enable() {
      if (!this.override) {
        this.override = new PropertyHook("navigator.geolocation", {
          onGetter: (obj, value) => {
            if (this.geolocation) {
              return {
                getCurrentPosition: success => {
                  success(this.getCoords());
                },
                clearWatch: id => {
                  delete this.watchers[id];
                },
                watchPosition: success => {
                  this.watchers[this.nextWatcherId] = success;
                  this.updateWatcher(success);
                  return this.nextWatcherId++;
                },
              };
            }
            return value;
          }
        });
      }
      this.override.enable();
    }

    disable() {
      if (this.override) {
        this.override.disable();
      }
    }
  }

  class LanguagesHook {
    constructor() {
      this.languageHook = new PropertyHook("navigator.language", {
        onGetter: (obj, value) => {
          return this.language || value;
        }
      });
      this.languagesHook = new PropertyHook("navigator.languages", {
        onGetter: (obj, value) => {
          return this.languages || value;
        }
      });
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

      if (opts.enabled) {
        this.enable();
      } else {
        this.disable();
      }
    }

    enable() {
      this.languageHook.enable();
      this.languagesHook.enable();
    }

    disable() {
      this.languageHook.disable();
      this.languagesHook.disable();
    }
  }

  class SimpleOverrides {
    constructor() {
      this.overrides = [];
    }

    setOptions(opts) {
      if (opts.overrides) {
        this.disable();

        this.overrides = [];
        const overrides = (opts.overrides || {}).script || {};
        for (const [override, newValue] of Object.entries(overrides)) {
          this.overrides.push(new PropertyHook(override, {
            onGetter: (obj, value) => {
              return newValue;
            }
          }));
        }
      }

      if ("enabled" in opts) {
        if (opts.enabled) {
          this.enable();
        } else {
          this.disable();
        }
      }
    }

    enable() {
      for (const override of this.overrides) {
        override.enable();
      }
    }

    disable() {
      for (const override of this.overrides) {
        override.disable();
      }
    }
  }

  class SimpleHookList {
    constructor() {
      this.hooks = [];
    }

    setOptions(opts) {
      this.disable();

      this.hooks = [];
      for (const [hook, action] of Object.entries(opts.properties || {})) {
        this.hooks.push(new PropertyHook(hook, {
          onGetter: getActionFor(action) || function(obj, value) {
            LogTrace(hook, Messages.LogGetterAccessed, value);
            return value;
          },
          onSetter: getActionFor(action) || function(obj, newValue) {
            LogTrace(hook, Messages.LogSetterCalled, newValue);
            return newValue;
          }
        }));
      }
      for (const [hook, action] of Object.entries(opts.methods || {})) {
        const onCalled = getActionFor(action) || function(obj, args) {
          LogTrace(hook, Messages.LogCalledWithArgs, args);
        };
        this.hooks.push(new PropertyHook(hook, {
          onGetter: function(obj, fn) {
            // If the method didn't originally exist, just return our hook
            return fn || onCalled;
          },
          onCalled,
        }));
      }

      if (opts.enabled) {
        this.enable();
      }
    }

    enable() {
      for (const hook of this.hooks) {
        hook.enable();
      }
    }

    disable() {
      for (const hook of this.hooks) {
        hook.disable();
      }
    }
  }

  const FunctionBind = (function() {
    return class FunctionBind {
      constructor() {
        this.enabled = false;
        const me = this;

        Function.prototype.bind = function(oThis) {
          if (typeof this !== "function") {
            // closest thing possible to the ECMAScript 5
            // internal IsCallable function
            throw new TypeError(Messages.InvalidFunctionBind);
          }

          const aArgs   = Array.prototype.slice.call(arguments, 1);
          const fToBind = this;
          const fNOP    = function() {};
          const fBound  = function() {
            if (me.enabled) {
              LogTrace(Messages.LogBoundFunctionCalled, fToBind.toString());
            }
            return fToBind.apply(this instanceof fNOP
                   ? this
                   : oThis,
                   aArgs.concat(Array.prototype.slice.call(arguments)));
          };

          if (this.prototype) {
            // Function.prototype doesn't have a prototype property
            fNOP.prototype = this.prototype;
          }
          fBound.prototype = new fNOP();

          fBound._boundFunction = fToBind;
          fBound._boundArguments = aArgs;

          return fBound;
        };
      }

      setOptions(opts) {
        if ("enabled" in opts) {
          this.enabled = !!opts.enabled;
        }
      }

      enable() {
        this.enabled = true;
      }

      disable() {
        this.enabled = false;
      }
    };
  }());

  class IgnoredBackgroundScriptHook {
    setOptions() {}
    enable() {}
    disable() {}
  }

  const Hooks = (function() {
    const hooks = {};

    return function Hooks(name) {
      if (!hooks[name]) {
        switch (name) {
          case "ObserveXHRandFetch":
            hooks[name] = new XHRandFetchObserver();
            break;
          case "ElementCreation":
            hooks[name] = new ElementCreatedHook();
            break;
          case "ElementDetection":
            hooks[name] = new ElementDetectionHook();
            break;
          case "DOMEvents":
            hooks[name] = new EventListenerHook();
            break;
          case "StyleProperties":
            hooks[name] = new StyleListenerHook();
            break;
          case "UserAgentOverrides":
            hooks[name] = new SimpleOverrides();
            break;
          case "FunctionBind":
            hooks[name] = new FunctionBind();
            break;
          case "Geolocation":
            hooks[name] = new GeolocationHook();
            break;
          case "OverrideLanguages":
            hooks[name] = new LanguagesHook();
            break;
          case "DetectUAChecks":
          case "Scrolling":
          case "DocumentWrite":
          case "InputsAndLinks":
          case "MediaElements":
          case "Scheduling":
          case "ShadowDOM":
            hooks[name] = new SimpleHookList();
            break;
          case "CORSBypass":
          case "OverrideRequestHeaders":
          case "OverrideNetworkRequests":
            hooks[name] = new IgnoredBackgroundScriptHook();
            break;
          default:
            return undefined;
        }
      }

      return hooks[name];
    };
  }());

  function setOverrides(config) {
    gConfig = config;
    for (const [name, options] of Object.entries(config || {})) {
      const hook = Hooks(name);
      if (hook) {
        hook.setOptions(options);
      }
    }
  }

  // expose an API object which requires a secret key that is logged to the
  // console, to help ease configuration when using the remote devtools.
  const Tinker = (function() {
    function Tinker(name) {
      if (Config.apiPermissionDenied) {
        return undefined;
      }

      if (!Config.apiPermissionGranted) {
        if (name.toString() === Config.apiKey) {
          Config.apiPermissionGranted = true;
          channel.port1.postMessage({apiPermissionGranted: true});
          return "OK";
        }
        Config.apiPermissionDenied = true;
        channel.port1.postMessage({apiPermissionDenied: true});
        return undefined;
      }

      const hook = Hooks(name);
      if (!hook) {
        throw new Error(Messages.apiNoSuchHook.replace("HOOK", name));
      }
      return {
        check: () => {
          return gConfig[name];
        },
        update: opts => {
          if (!("enabled" in opts)) {
            opts.enabled = true;
          }
          const changes = {};
          changes[name] = opts;
          channel.port1.postMessage(changes);
        },
      };
    }

    Tinker.maybeAnnounce = () => {
      if (!Config.apiPermissionGranted && !Config.apiPermissionDenied) {
        console.info(Messages.apiAnnounceKey.replace("KEY", Config.apiKey));
      }
    };

    Tinker.resetAPITest = () => {
      delete Config.apiPermissionDenied;
      Tinker.maybeAnnounce();
    };

    return Tinker;
  }());

  Tinker.maybeAnnounce();

  window.Tinker = function() {
    return Tinker.apply(null, arguments);
  };

  setOverrides(gConfig);

  // return a message port back to the outer content script, so we can securely
  // communicate with it without polluting the window's namespace.
  const channel = new MessageChannel();
  channel.port1.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message === "resetAPITest") {
      Tinker.resetAPITest();
    } else {
      setOverrides(message);
    }
  };
  return channel.port2;
}

window.port = window.eval(`(${pageScript}(${JSON.stringify(window.Config)},
                                          ${JSON.stringify(window.Messages)}));`);

window.port.onmessage = msg => {
  const tabConfigChanges = msg.data;
  if (tabConfigChanges && Object.keys(tabConfigChanges).length) {
    browser.runtime.sendMessage({tabConfigChanges});
  }
};

// delegate any changes to the inner window's script using a message port
browser.runtime.onMessage.addListener(
  message => {
    window.port.postMessage(JSON.stringify(message));
  }
);

