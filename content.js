/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, Config */

// This content script is called before any other page scripts, so we
// can modify the page script environment and set up the ability to
// create and modify hooks before other page scripts run.

var Messages = {
  LogIgnoringCall: browser.i18n.getMessage("logIgnoringCall"),
  LogElementCreated: browser.i18n.getMessage("logElementCreated"),
  LogListenerAddedOn: browser.i18n.getMessage("logListenerAddedOn"),
  LogListenerRemovedFrom: browser.i18n.getMessage("logListenerRemovedFrom"),
  LogEventFiredOn: browser.i18n.getMessage("logEventFiredOn"),
  LogGetterAccessed: browser.i18n.getMessage("logGetterAccessed"),
  LogSetterCalled: browser.i18n.getMessage("logSetterCalled"),
  LogCalledWithArgs: browser.i18n.getMessage("logCalledWithArgs"),
  LogInvalidFunctionBind: browser.i18n.getMessage("logInvalidFunctionBind"),
  LogBoundFunctionCalled: browser.i18n.getMessage("logBoundFunctionCalled"),
};

var port = window.eval(`(function(Config, Messages) {
  const gSetTimeout = setTimeout;
  const gDateNow = Date.now;

  function StartDebugger(rv) {
    debugger;
  }

  let LogTrace = (function() {
    let origConsole = console;
    let tracing = false;
    return function logTrace() {
      if (tracing) {
        return;
      }
      tracing = true;
      origConsole.log.apply(origConsole, arguments);
      origConsole.trace();
      tracing = false;
    }
  }());

  function getActionFor(code) {
    if (code === "start debugger") {
      return () => { debugger; };
    } else if (code === "log stack trace") {
      return;
    } else if (code === "ignore") {
      return (obj, args) => {
        LogTrace(Messages.LogIgnoringCall, obj, args);
        return null;
      };
    } else if (code === "nothing") {
      return function() {};
    } else {
      return new Function(code + "//" + Config.AllowEvalsToken);
    }
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
      let count = this.path.length;
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
      let [obj, name, oldprop] = this.revertPoint;
      this.revertPoint = undefined;
      if (oldprop) {
        Object.defineProperty(obj, name, oldprop);
      } else {
        delete(obj[name]);
      }
    }

    findProperty(obj, name) {
      let proto = obj;
      do {
        let prop = Object.getOwnPropertyDescriptor(proto, name);
        if (prop) {
          return prop;
        }
        proto = Object.getPrototypeOf(proto);
      } while(proto);
    }

    mockMissingProperty(obj, name) {
      let oldprop = this.findProperty(obj, name);
      Object.defineProperty(obj, name, {
        configurable: true, // So reloading the addon doesn't throw an error.
        get: () => {
          let v = oldprop.get.call(obj);
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
        let me = this;
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
        }
      } else {
        return value;
      }
    }

    overrideProperty(obj, name) {
      let oldprop = this.findProperty(obj, name);
      if (!this.revertPoint) {
        this.revertPoint = [obj, name, oldprop];
      }
      let newprop = {
        configurable: true, // So reloading the addon doesn't throw an error.
        enumerable: oldprop && oldprop.enumerable || false,
      };
      if (oldprop && (oldprop.get || oldprop.set)) {
        let me = this;
        newprop.get = function() {
          return me.onGetter(this, oldprop.get.call(this));
        };
        newprop.set = function(newValue) {
          newValue = me.onSetter(this, newValue, oldprop.get.call(this));
          oldprop.set.call(this, newValue);
        };
      } else { // value, not get/set (or no such property)
        let me = this;
        newprop.get = function() {
          let curValue = oldprop && oldprop.value &&
                         me.wrapValue(oldprop.value);
          return me.onGetter(this, curValue);
        }
        if (!oldprop || oldprop.writable) {
          newprop.set = function(val) {
            oldprop.value = me.onSetter(this, me.wrapValue(val));
          }
        }
      }
      Object.defineProperty(obj, name, newprop);
    }
  };

  function getCommaSeparatedList(str) {
    let vals = str || "";
    if (vals) {
      return vals.split(",").map(v => v.trim());
    }
    return [];
  }

  ElementCreatedHook = (function() {
    let listeners = [];
    let createElementHook;
    let createElementNSHook;
    let innerHTMLHook;
    let outerHTMLHook;

    function registerNameCreationListener(listener) {
      if (!createElementHook) {
        createElementHook = new PropertyHook("document.createElement", {
          onCalled: function(fn, args) {
            let name = args[0].toLowerCase();
            for (let listener of listeners || []) {
              listener._onCreated(name);
            }
          },
        });
        createElementNSHook = new PropertyHook("document.createElementNS", {
          onCalled: function(fn, args) {
            let name = args[0].toLowerCase();
            for (let listener of listeners || []) {
              listener._onCreated(name);
            }
          },
        });
        innerHTMLHook = new PropertyHook("Element.prototype.innerHTML", {
          onSetter: function(obj, html) {
            for (let listener of listeners || []) {
              listener._onHTML(html);
            }
            return html;
          },
        });
        outerHTMLHook = new PropertyHook("Element.prototype.outerHTML", {
          onSetter: function(obj, html) {
            for (let listener of listeners || []) {
              listener._onHTML(html);
            }
            return html;
          },
        });
      }

      if (listeners.indexOf(listener) < 0) {
        listeners.push(listener);
      }
    }

    return class ElementCreatedHook {
      constructor() {
        registerNameCreationListener(this);
      }

      setOptions(opts) {
        this.onCreated = getActionFor(opts.onCreated) || function(elem) {
          LogTrace(Messages.LogElementCreated, elem);
        };

        this.regexes = {};
        let names = getCommaSeparatedList(opts.names).map(_name => {
          let name = _name.trim().toLowerCase();
          this.regexes[name] = new RegExp("<" + name, "i");
          return name;
        });

        if (opts.enabled) {
          this.enable();
        } else {
          this.disable();
        }
      }

      enable() {
        this.enabled = true;

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
          for (let name of this.names) {
            if (this.regexes[name].test(html)) {
              this.onCreated(name);
            }
          }
        }
      }
    };
  }());

  EventListenerHook = (function() {
    const hooks = [];
    const oldAEL = EventTarget.prototype.addEventListener;
    const oldREL = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function() {
      let elem = this;
      let type = arguments[0];
      let fn = arguments[1];
      if (!fn || fn.__innerHandler) {
        return; // already added, or no handler
      }
      for (let hook of hooks) {
        hook._onAdded(type, elem, fn);
      }
      fn.__innerHandler = function(event) {
        let stopEvent = false;
        for (let hook of hooks) {
          if (hook._onEvent(event) === true) {
            stopEvent = true;
          }
        }
        if (!stopEvent) {
          return fn.apply(this, arguments);
        }
      }
      oldAEL.call(this, arguments[0], fn.__innerHandler, arguments[1]);
    }

    EventTarget.prototype.removeEventListener = function() {
      let elem = this;
      let type = arguments[0];
      let fn = arguments[1];
      if (fn.__innerHandler) {
        for (let hook of hooks) {
          hook._onRemoved(type, elem, fn.__innerHandler);
        }
        oldREL.call(this, arguments[0], fn.__innerHandler, arguments[1]);
        delete(fn.__innerHandler);
      } else {
        oldREL.apply(this, arguments);
      }
    }

    return class EventListenerHook {
      constructor() {
        hooks.push(this);
      }

      setOptions(opts) {
        this.enabled = opts.enabled;
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

  StyleListenerHook = (function() {
    const ElementStyleHook = new PropertyHook(
      "HTMLElement.prototype.style",
      {
        enabled: true,
        onGetter: function(element, css2Properties) {
          css2Properties.__relatedElement = element;
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
              onGetter: function(obj, value) {
                if (obj.__relatedElement) {
                  for (let listener of PropertyNameHooks[prop].listeners || []) {
                    value = listener._onGet(prop, obj.__relatedElement, value);
                  }
                }
                return value;
              },
              onSetter: function(obj, newValue) {
                if (obj.__relatedElement) {
                  for (let listener of PropertyNameHooks[prop].listeners || []) {
                    newValue = listener._onSet(prop, obj.__relatedElement, newValue);
                  }
                }
                return newValue;
              },
            }
          ),
        };
      }
      let listeners = PropertyNameHooks[prop].listeners;
      if (listeners.indexOf(listener) < 0) {
        listeners.push(listener);
      }
    }

    return class StyleListenerHook {
      setOptions(opts) {
        this.enabled = opts.enabled;
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
        for (let prop of this.properties) {
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
            let method = ((args[1] || {}).method || "get").toLowerCase();
            let url = new URL(args[0] || "", location).href.toLowerCase();
            if (this.onSend &&
                (!this.onlyMethods || this.onlyMethods.includes(method)) &&
                (!this.onlyURLs || url.match(this.onlyURLs))) {
              this.onSend("fetch", args);
            }
          },
        }
      );

      // Save the method and URL on the XHR objects when opened (for the send hook's use)
      this.openXHRHook = new PropertyHook(
        "XMLHttpRequest.prototype.open",
        {
          onCalled: (obj, args) => {
            this.__lastOpenArgs = args;
          },
        }
      );

      this.sendXHRHook = new PropertyHook(
        "XMLHttpRequest.prototype.send",
        {
          onCalled: (obj, args) => {
            let method = (this.__lastOpenArgs[0] || "get").toLowerCase();
            let url = new URL(this.__lastOpenArgs[1] || "", location).href.toLowerCase();
            if (this.onSend &&
                (!this.onlyMethods || this.onlyMethods.includes(method)) &&
                (!this.onlyURLs || url.match(this.onlyURLs))) {
              this.onSend("XHR sent", this.__lastOpenArgs);
            }
          },
        }
      );
    }

    setOptions(opts) {
      if (opts.enabled) {
        this.enable();
      } else {
        this.disable();
      }
      this.onSend = getActionFor(opts.onSend) || LogTrace;
      this.onlyMethods = getCommaSeparatedList(opts.onlyMethods);
      this.onlyURLs = opts.onlyURLs ? new RegExp(opts.onlyURLs) : undefined;
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
  };

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
      if (opts.enabled) {
        this.enable();
      }
      for (let callback of Object.values(this.watchers)) {
        this.updateWatcher(callback);
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
      this.language = undefined;
      this.languages = undefined;

      let acceptHeaderValue = (opts.langs || "").trim();
      if (acceptHeaderValue) {
        this.languages = acceptHeaderValue.split(",").map(lang => {
          return lang.split(";")[0].trim();
        });
        this.language = this.languages[0];
      }

      if (opts.enabled) {
        this.enable();
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
      this.disable();

      this.overrides = [];
      let overrides = (opts.overrides || {}).script || {};
      for (let [override, newValue] of Object.entries(overrides)) {
        this.overrides.push(new PropertyHook(override, {
          onGetter: function(obj, value) {
            return newValue;
          }
        }));
      }

      if (opts.enabled) {
        this.enable();
      }
    }

    enable() {
      for (let override of this.overrides) {
        override.enable();
      }
    }

    disable() {
      for (let override of this.overrides) {
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
      for (let [hook, action] of Object.entries(opts.properties || {})) {
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
      for (let [hook, action] of Object.entries(opts.methods || {})) {
        this.hooks.push(new PropertyHook(hook, {
          onCalled: getActionFor(action) || function(obj, args) {
            LogTrace(hook, Messages.LogCalledWithArgs, args);
          }
        }));
      }

      if (opts.enabled) {
        this.enable();
      }
    }

    enable() {
      for (let hook of this.hooks) {
        hook.enable();
      }
    }

    disable() {
      for (let hook of this.hooks) {
        hook.disable();
      }
    }
  };

  const FunctionBindLogger = (function() {
    return class FunctionBindLogger {
      constructor() {
        this.enabled = false;
        let me = this;

        Function.prototype.bind = function(oThis) {
          if (typeof this !== 'function') {
            // closest thing possible to the ECMAScript 5
            // internal IsCallable function
            throw new TypeError(Messages.InvalidFunctionBind);
          }

          var aArgs   = Array.prototype.slice.call(arguments, 1),
              fToBind = this,
              fNOP    = function() {},
              fBound  = function() {
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

          return fBound;
        };
      }

      setOptions(opts) {
        if (opts.enabled) {
          this.enabled = true;
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

  const Hooks = (function() {
    let hooks = {};

    function enableHook(name, _options) {
      let options = Object.assign({}, _options || {});

      if (!hooks[name]) {
        switch(name) {
          case "ObserveXHRandFetch":
            hooks[name] = new XHRandFetchObserver();
            break;
          case "ListenForElementCreation":
            hooks[name] = new ElementCreatedHook();
            break;
          case "ListenForEvents":
            hooks[name] = new EventListenerHook();
            break;
          case "ListenForStyleProperties":
            hooks[name] = new StyleListenerHook();
            break;
          case "UserAgentOverrides":
            hooks[name] = new SimpleOverrides();
            break;
          case "FunctionBindLogging":
            hooks[name] = new FunctionBindLogger();
            break;
          case "Geolocation":
            hooks[name] = new GeolocationHook();
            break;
          case "OverrideLanguages":
            hooks[name] = new LanguagesHook();
            break;
          default: // a group of simple overrides
            hooks[name] = new SimpleHookList();
        }
      }

      let hook = hooks[name];
      if (hook) {
        if (hook.setOptions) {
          hook.setOptions(options);
        }
      }
    }

    function disableHook(name) {
      let hook = hooks[name];
      if (hook) {
        hook.disable();
      }
    }

    return {
      enable: enableHook,
      disable: disableHook,
    }
  }());

  function setOverrides(config) {
    for (let [name, options] of Object.entries(config || {})) {
      if (options.enabled) {
        Hooks.enable(name, options);
      } else {
        Hooks.disable(name);
      }
    }
  }

  setOverrides(Config);

  // return a message port back to the outer content script, so we can securely
  // communicate with it without polluting the window's namespace.
  let channel = new MessageChannel();
  channel.port1.onmessage = event => {
    setOverrides(JSON.parse(event.data));
  };
  return channel.port2;
}(${JSON.stringify(Config)}, ${JSON.stringify(Messages)}));`);

// delegate any changes to the inner window's script using a message port
browser.runtime.onMessage.addListener(
  message => {
    port.postMessage(JSON.stringify(message));
  }
);

