/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, cloneInto, Config */

// This content script is called before any other page scripts, so we
// can modify the page script environment and set up the ability to
// create and modify hooks before other page scripts run.

function pageScript(Config, Messages) {
  const { UUID } = Config;

  const gSetTimeout = setTimeout;
  const gClearTimeout = clearTimeout;
  const gDateNow = Date.now;

  const Log = (function() {
    const origConsole = console;
    return function log() {
      origConsole.log.apply(origConsole, arguments);
    };
  }());

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
      return (obj, origHandler, args) => {
        // eslint-disable-next-line no-debugger
        debugger;
        return doCall(obj, origHandler, args);
      };
    } else if (code === "log stack trace") {
      return undefined;
    } else if (code === "ignore") {
      return (obj, origFn, args) => {
        LogTrace(Messages.LogIgnoringCall, obj, origFn, args);
        return null;
      };
    } else if (code === "nothing") {
      return (obj, origHandler, args) => {
        return doCall(obj, origHandler, args);
      };
    }
    return new Function("obj", "origHandler", "args",
                        code + "//" + Config.AllowEvalsToken);
  }

  function doCall(thisObj, fn, args) {
    if (!fn) {
      return undefined;
    }
    if (new.target) {
      return new (Function.prototype.bind.apply(fn, args));
    }
    return fn.apply(thisObj, args);
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
      this.onGetter = opts.onGetter || ((obj, origGetter, args) => doCall(obj, origGetter, args));
      this.onSetter = opts.onSetter || ((obj, origSetter, args) => doCall(obj, origSetter, args));
      this.onCalled = opts.onCalled || ((obj, origFn, args) => doCall(obj, origFn, args));
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
      this.enabled = true;
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
      this.enabled = false;
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

    wrapGetterWithCallCheck(getter) {
      const me = this;
      return function() {
        const that = this;
        const got = me.onGetter(that, getter, arguments);
        if (typeof got === "function") {
          return function() {
            return me.onCalled(that, got, arguments);
          };
        }
        return got;
      };
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
        } else { // must be get+set
          newprop.get = this.wrapGetterWithCallCheck(get);
          newprop.set = function() {
            return me.onSetter(this, set, arguments);
          };
        }
      } else {
        newprop.get = this.wrapGetterWithCallCheck(undefined);
        newprop.set = function() {
          return me.onSetter(this, undefined, arguments);
        };
      }
      Object.defineProperty(obj, name, newprop);
    }
  }

  class DisableHook extends PropertyHook {
    enable() {
      if (this.revertPoint) {
        return; // already disabling the property
      }

      let parentObj = window;
      let index = 0;
      const count = this.path.length;
      while (index < count - 1) {
        const name = this.path[index++];
        if (parentObj[name]) {
          parentObj = parentObj[name];
        } else {
          // if the property doesn't exist, do nothing.
          return;
        }
      }

      const revertName = this.path[index];
      const revertProp = this.findProperty(parentObj, revertName);
      this.revertPoint = [parentObj, revertName, revertProp];
      // Try deleting outright first.
      delete parentObj[revertName];
      // If the value is still in the prototype, then just
      // obscure ourselves as an undefined value.
      if (revertName in parentObj) {
        Object.defineProperty(parentObj, revertName, {
          configurable: true,
          enumerable: false,
          value: undefined,
        });
      }
    }
  }

  const matchRegex = (function() {
    const RE = /^\/(.*)\/([gimuy]*)$/;
    return function getRegex(str) {
      const isRE = str.match(RE);
      if (isRE) {
        try {
          const RE = new RegExp(isRE[1], isRE[2]);
          return {
            match: str => str.match(RE),
            replace: (str, rep) => str.replace(RE, rep),
          };
        } catch (_) { }
      }
      return undefined;
    };
  })();

  function getCommaSeparatedList(str) {
    const vals = str || "";
    if (vals) {
      return vals.split(",").map(v => v.trim());
    }
    return [];
  }

  function matchCommaSeparatedList(str) {
    const vals = getCommaSeparatedList(str);
    return {
      match: str => vals.includes(str),
      replace: (str, rep) => rep,
    };
  }

  function matchString(str) {
    return {
      match: str2 => str === str2,
      replace: (str, rep) => rep,
    };
  }

  class TTDSHook {
    constructor(name, oldTTDS) {
      this.name = name;
    }

    check() {
      return Config[this.name];
    }

    update(opts) {
      if (!("enabled" in opts)) {
        opts.enabled = true;
      }
      const changes = {};
      changes[this.name] = opts;
      channel.port1.postMessage(changes);
      return "OK";
    }

    // Will be called once by the constructor
    activate() {
    }

    // Will be called when this TTDS instance dies
    deactivate() {
    }
  }

  class ElementCreatedHook extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.audioConstructorHook = new PropertyHook("window.Audio", {
        onCalled: (win, origFn, args) => {
          const rv = this._onCreated("audio");
          if (rv !== undefined) {
            return rv;
          }
          return doCall(win, origFn, args);
        },
      });
      this.createElementHook = new PropertyHook("document.createElement", {
        onCalled: (doc, origFn, args) => {
          const name = args[0].toLowerCase();
          const rv = this._onCreated(name);
          if (rv !== undefined) {
            return rv;
          }
          return doCall(doc, origFn, args);
        },
      });
      this.createElementNSHook = new PropertyHook("document.createElementNS", {
        onCalled: (doc, origFn, args) => {
          const name = args[0].toLowerCase();
          const rv = this._onCreated(name);
          if (rv !== undefined) {
            return rv;
          }
          return doCall(doc, origFn, args);
        },
      });
      this.importNodeHook = new PropertyHook("document.importNode", {
        onCalled: (doc, origFn, args) => {
          const name = args[0].nodeName.toLowerCase();
          const rv = this._onCreated(name);
          if (rv !== undefined) {
            return rv;
          }
          return doCall(doc, origFn, args);
        },
      });
      this.cloneNodeHook = new PropertyHook("Element.prototype.cloneNode", {
        onCalled: (elem, origFn, args) => {
          const name = elem.nodeName.toLowerCase();
          const rv = this._onCreated(name);
          if (rv !== undefined) {
            return rv;
          }
          return doCall(elem, origFn, args);
        },
      });
      this.innerHTMLHook = new PropertyHook("Element.prototype.innerHTML", {
        onSetter: (elem, origSetter, args) => {
          const rv = this._onHTML(args[0]);
          if (rv !== undefined) {
            return rv;
          }
          return doCall(elem, origSetter, args);
        },
      });
      this.outerHTMLHook = new PropertyHook("Element.prototype.outerHTML", {
        onSetter: (elem, origSetter, args) => {
          const rv = this._onHTML(args[0]);
          if (rv !== undefined) {
            return rv;
          }
          return doCall(elem, origSetter, args);
        },
      });
    }

    deactivate() {
      this.disable();
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

      this.audioConstructorHook.enable();
      this.createElementHook.enable();
      this.createElementNSHook.enable();
      this.importNodeHook.enable();
      this.cloneNodeHook.enable();
      this.innerHTMLHook.enable();
      this.outerHTMLHook.enable();
    }

    disable() {
      this.enabled = false;

      this.audioConstructorHook.disable();
      this.createElementHook.disable();
      this.createElementNSHook.disable();
      this.importNodeHook.disable();
      this.cloneNodeHook.disable();
      this.innerHTMLHook.disable();
      this.outerHTMLHook.disable();
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
  }

  class ElementDetectionHook extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

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
          if (mutation.type === "attributes") {
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

    deactivate() {
      this.disable();
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
  }

  const EventListenerHook = (function() {
    class Rule {
      setOptions(opts) {
        if ("enabled" in opts) {
          this.enabled = !!opts.enabled;
        }
        if ("types" in opts) {
          this.types = matchRegex(opts.types) ||
                       matchCommaSeparatedList(opts.types);
        }
        if ("selector" in opts) {
          this.selector = opts.selector;
        }
        this.onAdded = (opts.onAdded === "ignore" &&
          ((type, elem, fn) => {
            if (this._matches(type, elem)) {
              LogTrace(type, Messages.LogIgnoringListenerAddedOn, elem, fn);
              return false;
            }
            return undefined;
          })) || getActionFor(opts.onAdded) || function(type, elem, fn) {
          LogTrace(type, Messages.LogListenerAddedOn, elem, fn);
        };
        this.onRemoved = (opts.onRemoved === "ignore" &&
          ((type, elem, fn) => {
            if (this._matches(type, elem)) {
              LogTrace(type, Messages.LogIgnoringListenerRemovedFrom, elem, fn);
              return false;
            }
            return undefined;
          })) || getActionFor(opts.onRemoved) || function(type, elem, fn) {
          LogTrace(type, Messages.LogListenerRemovedFrom, elem, fn);
        };
        this.onEvent = (opts.onEvent === "ignore" &&
          ((event, handler) => {
            if (this._matches(event.type, event.target)) {
              Log(event.type, Messages.LogIgnoringEvent, event.target, event, handler);
              return false;
            }
            return undefined;
          })) || getActionFor(opts.onEvent) || function(event, handler) {
            Log(event.type, Messages.LogEventFiredOn, event.target, event, handler);
          };
      }

      enable() {
        this.enabled = true;
      }

      disable() {
        this.enabled = false;
      }

      _matches(type, elem) {
         return (!this.types || this.types.match(type)) &&
                (!this.selector ||
                  (this.selector === "document" && elem instanceof Document) ||
                  (this.selector === "window" && elem instanceof Window) ||
                  (elem.matches && elem.matches(this.selector)));
      }

      _onAdded(elem, type, fn) {
        if (this.enabled && this._matches(type, elem)) {
          return this.onAdded(type, elem, fn);
        }
        return undefined;
      }

      _onRemoved(elem, type, fn) {
        if (this.enabled && this._matches(type, elem)) {
          return this.onRemoved(type, elem, fn);
        }
        return undefined;
      }

      _onEvent(event, handler) {
        if (this.enabled && this._matches(event.type, event.target)) {
          return this.onEvent(event, handler);
        }
        return undefined;
      }
    }

    return class EventListenerHook extends TTDSHook {
      constructor(name, oldTTDS) {
        super(name, oldTTDS);

        this.targetInstance = this;
        this.enabled = false;
        this.rules = [new Rule()];

        if (oldTTDS && oldTTDS[name]) {
          const oldInstance = oldTTDS[name];

          // Inherhit handler proxies
          this.handlerProxies = oldInstance.handlerProxies;

          // Make those proxies call us instead
          const originalInstance = oldInstance.originalInstance || oldInstance;
          this.originalInstance = originalInstance;
          originalInstance.targetInstance = this;
        } else {
          this.handlerProxies = new WeakMap();
        }
      }

      activate() {
        if (this.oldAEL) {
          return;
        }

        this.oldAEL = EventTarget.prototype.addEventListener;
        this.oldREL = EventTarget.prototype.removeEventListener;

        const me = this;
        EventTarget.prototype.addEventListener = function(type, handler, opts) {
          return me.onAddListener(this, type, handler, opts);
        };
        EventTarget.prototype.removeEventListener = function(type, handler, opts) {
          return me.onRemoveListener(this, type, handler, opts);
        };
      }

      deactivate() {
        if (!this.oldAEL) {
          return;
        }

        this.disable();

        EventTarget.prototype.addEventListener = this.oldAEL;
        EventTarget.prototype.removeEventListener = this.oldREL;

        this.oldAEL = undefined;
        this.oldREL = undefined;
      }

      enable() {
        for (const rule of this.rules) {
          rule.enable();
        }
      }

      disable() {
        for (const rule of this.rules) {
          rule.disable();
        }
      }

      onAddListener(elem, type, handler, options) {
        for (const rule of this.rules) {
          if (rule._onAdded(elem, type, handler, options) === false) {
            return undefined;
          }
        }
        if (!handler) { // no handler, so this call will fizzle anyway
          return undefined;
        }
        const me = this;
        const proxy = this.handlerProxies.get(handler) || function(event) {
          return me.targetInstance.onEvent(this, event, handler);
        };
        const returnValue = this.oldAEL.call(elem, type, proxy, options);
        this.handlerProxies.set(handler, proxy);
        return returnValue;
      }

      onRemoveListener(elem, type, handler, options) {
        if (handler && this.handlerProxies.has(handler)) {
          for (const rule of this.rules) {
            if (rule._onRemoved(elem, type, handler) === false) {
              return;
            }
          }
          const proxy = this.handlerProxies.get(handler);
          this.oldREL.call(elem, type, proxy, options);
        } else {
          this.oldREL.call(elem, type, handler, options);
        }
      }

      onEvent(thisObj, event, originalHandler) {
        let stopEvent = false;
        for (const rule of this.rules) {
          if (rule._onEvent(event, originalHandler) === false) {
            stopEvent = true;
          }
        }
        if (!stopEvent) {
          if (originalHandler.handleEvent) {
            return originalHandler.handleEvent.call(thisObj, event);
          }
          return originalHandler.call(thisObj, event);
        }
        return undefined;
      }

      setOptions(opts) {
        this.rules[0].setOptions(opts);
        this.enabled = this.rules[0].enabled;
      }
    };
  }());

  class StyleListenerHook extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.relatedElementForPropsObj = new WeakMap();

      this.styleHook = new PropertyHook(
        "HTMLElement.prototype.style",
        {
          onGetter: (elem, origGetter, args) => {
            const css2Properties = doCall(elem, origGetter, args);
            this.relatedElementForPropsObj.set(css2Properties, elem);
            return css2Properties;
          }
        }
      );

      this.propertyNameHooks = {};
    }

    activate() {
      this.styleHook.enable();
      for (const hook of Object.values(this.propertyNameHooks)) {
        hook.enable();
      }
    }

    deactivate() {
      this.disable();
      this.styleHook.disable();
      for (const hook of Object.values(this.propertyNameHooks)) {
        hook.disable();
      }
    }

    registerStylePropertyListener(listener, prop) {
      if (this.propertyNameHooks[prop]) {
        return;
      }

      this.propertyNameHooks[prop] = new PropertyHook(
        `CSS2Properties.prototype.${prop}`,
        {
          enabled: true,
          onGetter: (props, origGetter, args) => {
            if (this.relatedElementForPropsObj.has(props)) {
              const elem = this.relatedElementForPropsObj.get(props);
              const rv = this._onGet(prop, elem, args[0]);
              if (rv !== undefined) {
                return rv;
              }
            }
            return doCall(props, origGetter, args);
          },
          onSetter: (props, origSetter, args) => {
            if (this.relatedElementForPropsObj.has(props)) {
              const elem = this.relatedElementForPropsObj.get(props);
              const replacement = this._onSet(prop, elem, args[0]);
              if (replacement !== undefined) {
                return doCall(props, origSetter, [replacement]);
              }
            }
            return doCall(props, origSetter, args);
          },
        }
      );
    }

    setOptions(opts) {
      if ("enabled" in opts) {
        this.enabled = !!opts.enabled;
      }

      this.onGet = getActionFor(opts.onGet) || function(prop, elem, value) {
        LogTrace(elem, `.style.${prop}`, Messages.LogGetterAccessed, value);
        return value;
      };
      this.onSet = getActionFor(opts.onSet) || function(prop, elem, value) {
        LogTrace(elem, `.style.${prop}`, Messages.LogSetterCalled, value);
        return value;
      };
      if (opts.properties) {
        this.properties = getCommaSeparatedList(opts.properties);
      }
      if (opts.selector) {
        this.selector = opts.selector;
      }
      if (opts.onlyValues) {
        this.onlyValues = matchRegex(opts.onlyValues) ||
                          matchCommaSeparatedList(opts.onlyValues);
      }
      for (const prop of this.properties) {
        this.registerStylePropertyListener(this, prop);
      }
    }

    enable() {
      this.enabled = true;
    }

    disable() {
      this.enabled = false;
    }

    _matches(prop, elem, value) {
      return (!this.properties || this.properties.includes(prop)) &&
             (!this.selector || elem.matches(this.selector)) &&
             (!this.onlyValues || this.onlyValues.match(value));
    }

    _onGet(prop, elem, returnValue) {
      if (this.enabled && this.onGet && this._matches(prop, elem, returnValue)) {
        returnValue = this.onGet(prop, elem, returnValue);
      }
      return returnValue;
    }

    _onSet(prop, elem, newValue) {
      if (this.enabled && this.onSet && this._matches(prop, elem, newValue)) {
        newValue = this.onSet(prop, elem, newValue);
      }
      return newValue;
    }
  }

  class SyncXHRPolyfix {
    static get XHREvents() {
      return ["abort", "error", "load", "loadend", "loadstart",
              "progress", "readystatechange", "timeout"];
    }

    constructor() {
      this.openSyncXHRs = new WeakMap();
      this.stateSpoofs = new WeakMap();
      this.currentlyBlockingOnSyncXHRs = 0;
      this.mustUnblockEventsNow = false;
      this.currentlyBlockedEvents = [];
      this.unblockingEvents = false;

      this.openHook = new PropertyHook("XMLHttpRequest.prototype.open", {
        onCalled: (xhr, origXHROpen, args) => {
          if (args.length > 2 && !args[2]) {
            this.openSyncXHRs.set(xhr);

          }
          return doCall(xhr, origXHROpen, args);
        }
      });
      this.sendHook = new PropertyHook("XMLHttpRequest.prototype.send", {
        onCalled: (xhr, origXHRSend, args) => {
          if (this.openSyncXHRs.has(xhr)) {
            this.unblockEventsIfNecessary();
            this.currentlyBlockingOnSyncXHRs++;
            this.currentlyBlockedEvents = [];
            let caughtException;
            try {
              doCall(xhr, origXHRSend, args);
            } catch (exc) {
              caughtException = exc;
            }
            if (this.currentlyBlockingOnSyncXHRs === 1) {
              this.mustUnblockEventsNow = true;
              Promise.resolve().then(this.unblockEventsIfNecessary.bind(this));
            }
            if (caughtException) {
              throw caughtException;
            }
          } else {
            doCall(xhr, origXHRSend, args);
          }
        }
      });
      this.addListenerHook = new PropertyHook("XMLHttpRequest.addEventListener", {
        onCalled: (xhr, origXHRAEL, args) => {
          const type = args[0];
          const handler = args[1];
          const options = args[2];
          if (!handler) {
            return undefined;
          }
          const wrappedHandler = this.registeredListeners.has(handler) ?
                                   this.registeredListeners.get(handler) :
                                   this.wrapHandler(handler, type);
          const returnValue = origXHRAEL.call(xhr, type, wrappedHandler, options);
          this.registeredListeners.set(handler, wrappedHandler);
          return returnValue;
        }
      });
      this.removeListenerHook = new PropertyHook("XMLHttpRequest.removeEventListener", {
        onCalled: (xhr, origXHRREL, args) => {
          const type = args[0];
          const handler = args[1];
          const options = args[2];
          if (handler && this.registeredListeners.has(handler)) {
            const wrappedHandler = this.registeredListeners.get(handler);
            origXHRREL.call(xhr, type, wrappedHandler, options);
          } else {
            origXHRREL.apply(xhr, args);
          }
        }
      });
      this.readyStateHook = new PropertyHook("XMLHttpRequest.prototype.readyState", {
        onGetter: (xhr, origGetter, args) => {
          if (this.stateSpoofs.has(xhr)) {
            const spoof = this.stateSpoofs.get(xhr).readyState;
            if (spoof !== undefined) {
              return spoof;
            }
          }
          return doCall(xhr, origGetter, args);
        }
      });
      this.responseTextHook = new PropertyHook("XMLHttpRequest.prototype.responseText", {
        onGetter: (xhr, origGetter, args) => {
          const liveText = doCall(xhr, origGetter, args);
          if (this.stateSpoofs.has(xhr)) {
            const length = this.stateSpoofs.get(xhr).responseText;
            if (length !== undefined && length !== liveText.length) {
              return liveText.substr(0, length);
            }
          }
          return liveText;
        }
      });
      this.postMessageHook = new PropertyHook("window.postMessage", {
        onCalled: (win, origFn, args) => {
          Promise.resolve().then(() => {
            if (this.currentlyBlockingOnSyncXHRs) {
              this.currentlyBlockedEvents.push(function postMessage() {
                doCall(win, origFn, args);
              });
            } else {
              doCall(win, origFn, args);
            }
          });
        }
      });
      for (const eventName of SyncXHRPolyfix.XHREvents) {
        const prop = `on${eventName}`;
        let currentHandler;
        this[`${prop}Hook`] = new PropertyHook(`XMLHttpRequest.prototype.${prop}`, {
          onGetter: (xhr, origGetter, args) => {
            return currentHandler;
          },
          onSetter: (xhr, origSetter, args) => {
            currentHandler = args[0];
            doCall(xhr, origSetter, [this.wrapHandler(currentHandler, eventName)]);
          }
        });
      }
    }

    spoofXHRState(xhr, values) {
      if (!this.stateSpoofs.has(xhr)) {
        this.stateSpoofs.set(xhr, {});
      }
      const currentSpoofs = this.stateSpoofs.get(xhr);
      for (const [name, value] of Object.entries(values)) {
        currentSpoofs[name] = value;
      }
    }

    wrapHandler(handler, type) {
      const me = this;
      return function(event) {
        const xhr = this;
        const readyState = this.readyState;
        const responseType = this.responseType;

        const spoofs = {readyState};
        if (responseType === "" || responseType === "text") {
          if (readyState < 3) { // LOADING
            spoofs.responseTextLength = 0;
          } else if (event && event.type === "progress") {
            spoofs.responseTextLength = event.loaded;
          } else {
            spoofs.responseTextLength = this.responseText.length;
          }
        }

        // If this event is for an async XHR, and we're currently
        // doing a sync XHR, then we block the event.
        const isSync = me.openSyncXHRs.has(this);
        if (isSync || !me.currentlyBlockingOnSyncXHRs) {
          if (handler.handleEvent) {
            return handler.handleEvent.apply(this, arguments);
          }
          return handler.apply(this, arguments);
        }

        const wrappedHandler = function() {
          // We have to keep track of the relevant XHR state at the
          // time the handler was originally called, so that when
          // we finally fire the event, we can spoof that state.
          me.spoofXHRState(xhr, spoofs);
          const returnValue = handler.handleEvent ?
                                handler.handleEvent.apply(this, arguments) :
                                handler.apply(this, arguments);
          me.spoofXHRState(xhr, {
            readyState: undefined,
            responseTextLength: undefined,
          });
          return returnValue;
        };
        me.currentlyBlockedEvents.push(wrappedHandler);
        return undefined;
      };
    }

    enable() {
      this.openHook.enable();
      this.sendHook.enable();
      this.readyStateHook.enable();
      this.addListenerHook.enable();
      this.removeListenerHook.enable();
      this.responseTextHook.enable();
      this.postMessageHook.enable();
      for (const eventName of SyncXHRPolyfix.XHREvents) {
        this[`on${eventName}Hook`].enable();
      }
    }

    disable() {
      this.unblockEventsIfNecessary();
      this.openHook.disable();
      this.sendHook.disable();
      this.addListenerHook.disable();
      this.removeListenerHook.disable();
      this.readyStateHook.disable();
      this.responseTextHook.disable();
      this.postMessageHook.disable();
      for (const eventName of SyncXHRPolyfix.XHREvents) {
        this[`on${eventName}Hook`].disable();
      }
    }

    unblockEventsIfNecessary() {
      if (this.mustUnblockEventsNow) {
        this.mustUnblockEventsNow = false;
        if (!this.unblockingEvents) {
          this.unblockingEvents = true;
          while (this.currentlyBlockedEvents.length) {
            this.currentlyBlockedEvents.shift()();
          }
          this.unblockingEvents = true;
          this.currentlyBlockingOnSyncXHRs--;
        }
      }
    }
  }

  class XHRandFetchObserver extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.syncXHRPolyfix = new SyncXHRPolyfix();

      this.fetchHook = new PropertyHook(
        "window.fetch",
        {
          onCalled: (win, origFetch, args) => {
            const method = ((args[1] || {}).method || "get").toLowerCase();
            const url = new URL(args[0] || "", location).href.toLowerCase();
            if (this.onSend &&
                (!this.onlyMethods || this.onlyMethods.match(method)) &&
                (!this.onlyURLs || this.onlyURLs.match(url))) {
              this.onSend("fetch", args);
            }
            return doCall(win, origFetch, args);
          },
        }
      );

      this.openedXHRArgs = new WeakMap();

      // Save the method and URL on the XHR objects when opened (for the send hook's use)
      this.openXHRHook = new PropertyHook(
        "XMLHttpRequest.prototype.open",
        {
          onCalled: (xhr, origOpen, args) => {
            this.openedXHRArgs.set(xhr, args);
            return doCall(xhr, origOpen, args);
          },
        }
      );

      this.sendXHRHook = new PropertyHook(
        "XMLHttpRequest.prototype.send",
        {
          onCalled: (xhr, origSend, args) => {
            const openArgs = this.openedXHRArgs.get(xhr);
            const method = (openArgs[0] || "get").toLowerCase();
            const url = new URL(openArgs[1] || "", location).href.toLowerCase();
            if (this.onSend &&
                (!this.onlyMethods || this.onlyMethods.match(method)) &&
                (!this.onlyURLs || this.onlyURLs.match(url))) {
              this.onSend("XHR sent", openArgs);
            }
            return doCall(xhr, origSend, args);
          },
        }
      );
    }

    deactivate() {
      this.disable();
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
        this.onlyMethods = matchRegex(opts.onlyMethods) ||
                           matchCommaSeparatedList(opts.onlyMethods);
      }

      if (opts.onlyURLs) {
        this.onlyURLs = matchRegex(opts.onlyURLs) || matchString(opts.onlyURLs);
      }
      if (this.syncXHRPolyfix) {
        if (opts.flags && opts.flags.syncXHRPolyfix) {
          this.syncXHRPolyfix.enable();
        } else {
          this.syncXHRPolyfix.disable();
        }
      }
    }

    enable() {
      this.fetchHook.enable();
      this.openXHRHook.enable();
      this.sendXHRHook.enable();
      if (this.syncXHRPolyfix) {
        this.syncXHRPolyfix.enable();
      }
    }

    disable() {
      this.fetchHook.disable();
      this.openXHRHook.disable();
      this.sendXHRHook.disable();
      if (this.syncXHRPolyfix) {
        this.syncXHRPolyfix.disable();
      }
    }
  }

  class GeolocationHook extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.watchers = {};
      this.nextWatcherId = 1;
    }

    deactivate() {
      this.disable();
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
          onGetter: (navGeo, origGetter, args) => {
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
            return doCall(navGeo, origGetter, args);
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

  class LanguagesHook extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.languageHook = new PropertyHook("navigator.language", {
        onGetter: (navLang, origGetter, args) => {
          return this.language || doCall(navLang, origGetter, args);
        }
      });
      this.languagesHook = new PropertyHook("navigator.languages", {
        onGetter: (navLang, origGetter, args) => {
          return this.languages || doCall(navLang, origGetter, args);
        }
      });
    }

    deactivate() {
      this.disable();
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

  class SimpleOverrides extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.overrides = [];
    }

    deactivate() {
      this.disable();
    }

    setOptions(opts) {
      if (opts.overrides) {
        this.disable();

        this.overrides = [];
        const overrides = (opts.overrides || {}).script || {};
        for (const [override, newValue] of Object.entries(overrides)) {
          this.overrides.push(new PropertyHook(override, {
            onGetter: (obj, origGetter, args) => {
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

  class SimpleHookList extends TTDSHook {
    constructor(name, oldTTDS) {
      super(name, oldTTDS);

      this.hooks = [];
    }

    deactivate() {
      this.disable();
    }

    setOptions(opts) {
      this.disable();

      this.hooks = [];
      for (const [hook, action] of Object.entries(opts.properties || {})) {
        if (action === "hide") {
          this.hooks.push(new DisableHook(hook));
        } else {
          const hookAction = getActionFor(action);
          this.hooks.push(new PropertyHook(hook, {
            onGetter: hookAction || function(obj, origGetter, args) {
              LogTrace(hook, Messages.LogGetterAccessed, args[0]);
              return doCall(obj, origGetter, args);
            },
            onSetter: hookAction || function(obj, origSetter, args) {
              LogTrace(hook, Messages.LogSetterCalled, args[0]);
              return doCall(obj, origSetter, args);
            }
          }));
        }
      }
      for (const [hook, action] of Object.entries(opts.methods || {})) {
        if (action === "hide") {
          this.hooks.push(new DisableHook(hook));
        } else {
          this.hooks.push(new PropertyHook(hook, {
            onCalled: getActionFor(action) || function(thisObj, fn, args) {
              LogTrace(hook, thisObj, Messages.LogCalledWithArgs, args);
              return doCall(thisObj, fn, args);
            },
          }));
        }
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

  const DisableDebugger = (function() {
    const origFn = window.Function;
    const origEval = window.eval;
    const debuggerMatch = /debugger/g;
    const debuggerReplacement = "true /*debugger*/";

    function fnHandler(...args) {
      const o = args[args.length - 1];
      if (typeof o === "string" && o.includes("debugger")) {
        args[args.length - 1] = o.replace(debuggerMatch, debuggerReplacement);
      }
      return origFn.apply(args);
    }

    function evalHandler(o) {
      if (typeof o === "string" && o.includes("debugger")) {
        o = o.replace(debuggerMatch, debuggerReplacement);
      }
      return origEval(o);
    }

    return class DisableDebugger extends TTDSHook {
      deactivate() {
        this.disable();
      }

      setOptions(opts) {
        if ("enabled" in opts) {
          if (opts.enabled) {
            this.enable();
          } else {
            this.disable();
          }
        }
      }

      enable() {
        origFn.constructor = fnHandler;
        origFn.prototype.constructor = fnHandler;
        window.Function = fnHandler;
        window.eval = evalHandler;
      }

      disable() {
        origFn.constructor = origFn;
        origFn.prototype.constructor = origFn;
        window.Function = origFn;
        window.eval = origEval;
      }
    };
  }());

  class FunctionBind extends TTDSHook {
    activate() {
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

    deactivate() {
      this.disable();
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
  }

  class IgnoredBackgroundScriptHook extends TTDSHook {
    setOptions() {}
    enable() {}
    disable() {}
  }


  // We return a message port back to the outer content script, so we can
  // securely with it without polluting the window's namespace.
  const channel = new MessageChannel();

  // If there is an old instance of TTDS we're replacing, then first
  // deactivate it so it reverts its various hooks.
  const oldInstance = window[UUID];
  if (oldInstance) {
    oldInstance.deactivate();
  }

  // Expose an API object which requires a secret key that is logged to the
  // console, to help ease configuration when using the remote devtools.
  const Tinker = {
    activate: () => {
      for (const hook of Object.values(Tinker)) {
        if (hook.activate) {
          hook.activate();
        }
      }
    },

    deactivate: () => {
      for (const hook of Object.values(Tinker)) {
        if (hook.deactivate) {
          hook.deactivate();
        }
      }
    },

    // If TTDS is restarted, then its AllowEvalsToken will change.
    // We presume it was restarted because it's being upgraded,
    // and disallow reconnecting to this instance.
    reconnect: config => {
      if (Config.AllowEvalsToken !== config.AllowEvalsToken) {
        Config.AllowEvalsToken = config.AllowEvalsToken;
        return undefined;
      }
      Tinker.replaceConfig(config);
      return channel.port2;
    },

    getConfig: () => {
      return Config;
    },

    replaceConfig: config => {
      Config = config;
      for (const [name, options] of Object.entries(config || {})) {
        if (Tinker[name]) {
          Tinker[name].setOptions(options);
        }
      }
    },
  };

  function addHook(name, cls) {
    Tinker[name] = new cls(name, oldInstance);
    Tinker[name].activate();
  }

  addHook("ObserveXHRandFetch", XHRandFetchObserver);
  addHook("ElementCreation", ElementCreatedHook);
  addHook("ElementDetection", ElementDetectionHook);
  addHook("StyleProperties", StyleListenerHook);
  addHook("UserAgentOverrides", SimpleOverrides);
  addHook("DisableDebugger", DisableDebugger);
  addHook("FunctionBind", FunctionBind);
  addHook("Geolocation", GeolocationHook);
  addHook("OverrideLanguages", LanguagesHook);
  addHook("DetectUAChecks", SimpleHookList);
  addHook("EventListener", EventListenerHook);
  addHook("EventFeatures", SimpleHookList);
  addHook("Scrolling", SimpleHookList);
  addHook("DocumentWrite", SimpleHookList);
  addHook("History", SimpleHookList);
  addHook("InputsAndLinks", SimpleHookList);
  addHook("MediaElements", SimpleHookList);
  addHook("Scheduling", SimpleHookList);
  addHook("ShadowDOM", SimpleHookList);
  addHook("WebP", IgnoredBackgroundScriptHook);
  addHook("CORSBypass", IgnoredBackgroundScriptHook);
  addHook("OverrideRequestHeaders", IgnoredBackgroundScriptHook);
  addHook("OverrideNetworkRequests", IgnoredBackgroundScriptHook);

  if (oldInstance) {
    // Grab the configuration of known hooks, and send it to the
    // background script so all TTDS UI is updated to match it.
    const oldConfig = oldInstance.getConfig();
    const newConfig = {};
    for (const [name, hook] of Object.entries(Tinker)) {
      if (hook.update && oldConfig[name]) {
        newConfig[name] = oldConfig[name];
      }
    }
    if (Object.keys(newConfig).length) {
      Tinker.replaceConfig(newConfig);
      channel.port1.postMessage(newConfig);
    }
  } else {
    if (window.top === window) {
      console.info(Messages.apiAnnounceKey.replace("KEY", UUID));
    }
    Tinker.replaceConfig(Config);
  }

  Object.defineProperty(window, UUID, {
    configurable: true,
    enumerable: false,
    value: Tinker,
  });

  // If we hear no heartbeat from our content-script for 5
  // seconds, presume that the addon is toast (the script should
  // reconnect by then if upgrading or restarting).
  const addonIsStillAlive = (function() {
    let canary = -1;
    return function() {
      gClearTimeout.call(window, canary);
      canary = gSetTimeout(() => {
        if (window[UUID] === Tinker) {
          delete window[UUID];
        }
        Tinker.deactivate();
      }, 5000);
    };
  }());

  channel.port1.onmessage = event => {
    const message = event.data;
    if (message === "addonIsStillAlive") {
      addonIsStillAlive();
    } else {
      Tinker.replaceConfig(JSON.parse(message));
    }
  };
  return channel.port2;
}

(function(Config) {
  const Messages = {
    apiAnnounceKey: browser.i18n.getMessage("apiAnnounceKey"),
    LogIgnoringCall: browser.i18n.getMessage("logIgnoringCall"),
    LogIgnoringEvent: browser.i18n.getMessage("logIgnoringEvent"),
    LogElementCreated: browser.i18n.getMessage("logElementCreated"),
    LogElementDetected: browser.i18n.getMessage("logElementDetected"),
    LogElementLost: browser.i18n.getMessage("logElementLost"),
    LogListenerAddedOn: browser.i18n.getMessage("logListenerAddedOn"),
    LogListenerRemovedFrom: browser.i18n.getMessage("logListenerRemovedFrom"),
    LogIgnoringListenerAddedOn: browser.i18n.getMessage("logIgnoringListenerAddedOn"),
    LogIgnoringListenerRemovedFrom: browser.i18n.getMessage("logIgnoringListenerRemovedFrom"),
    LogEventFiredOn: browser.i18n.getMessage("logEventFiredOn"),
    LogGetterAccessed: browser.i18n.getMessage("logGetterAccessed"),
    LogSetterCalled: browser.i18n.getMessage("logSetterCalled"),
    LogCalledWithArgs: browser.i18n.getMessage("logCalledWithArgs"),
    LogInvalidFunctionBind: browser.i18n.getMessage("logInvalidFunctionBind"),
    LogBoundFunctionCalled: browser.i18n.getMessage("logBoundFunctionCalled"),
  };

  const { UUID } = Config;
  const existingTTDS = window.wrappedJSObject[UUID];
  const port = existingTTDS && existingTTDS.reconnect(cloneInto(Config, existingTTDS)) ||
               window.eval(`(${pageScript}(${JSON.stringify(Config)},
                                           ${JSON.stringify(Messages)}));`);

  port.onmessage = msg => {
    const tabConfigChanges = msg.data;
    if (tabConfigChanges && Object.keys(tabConfigChanges).length) {
      browser.runtime.sendMessage({tabConfigChanges});
    }
  };

  // delegate any changes to the inner window's script using a message port
  browser.runtime.onMessage.addListener(
    message => {
      if (message.decodeWebP) { // handled in webp/content.js
        return;
      }
      port.postMessage(JSON.stringify(message));
    }
  );

  setInterval(() => {
    port.postMessage("addonIsStillAlive");
  }, 1000);
})(Config);
