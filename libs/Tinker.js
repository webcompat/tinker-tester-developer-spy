/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/*
  Tinker is a manager for our collection of hacks, which uses the overrider.
  It's accessible either through the addon's UIs, or through a variable on the
  page script based on the addon's UI (which we hide from the page as much as
  possible, so it would have to guess our UUID to access it).

  The reason for this variable was originally because it's impractical to manage
  the addon on mobile devices for advanced hacks, except through the remote
  devtools console. And unfortunately, there is currently no API which permits
  making a variable that's only visible to the devtools (like say console.tinker).

  However, having such a variable also simplifies many other aspects of the code,
  including the portability between browsers (since messages passed back from
  the page script to the content script are visible to anyone, which could give
  away sensitive information like our UUID if used haphazardly).
*/

/* global ElementCreationDetector, ElementDetector, EventListenerManager,
          ElementStyleListener, FunctionBindProxy, GeolocationOverrider,
          LanguageOverrider, Messages, MockObjects, SyncXHRPolyfix,
          UserAgentOverrider, XHRAndFetchObserver */

class Tinker {
  constructor(overrider, targetWindow, config) {
    this.instanceId = Date.now();
    this.overrider = overrider;
    this.config = config;
    this.origConsole = targetWindow.console;
    this.tracing = false;
    this.simpleHooks = {};

    const {UUID} = this.config;
    if (!UUID) {
      console.error("No UUID");
      throw "No UUID";
    }

    let previousInstance = targetWindow[UUID];
    let previousELM;
    if (previousInstance) {
      if (previousInstance.shutdown) {
        previousInstance.shutdown();
        previousInstance = targetWindow[UUID];
      }
      this.config = previousInstance.config;
      this.upgraded = true;
      previousELM = previousInstance.eventListenerManager;
      if (previousInstance.origConsole) {
        this.origConsole = previousInstance.origConsole;
      }
      this.origConsole.info(Messages.APIUpgrading);
    }

    this.mockObjects = new MockObjects(this.overrider);

    if (typeof SyncXHRPolyfix !== "undefined") {
      this.syncXHRPolyfix = new SyncXHRPolyfix(this.overrider);
    }

    this.eventListenerManager = new EventListenerManager(
      this.overrider,
      (msgType, args = []) => {
        let msg = `${Messages[`WarnEventListener${msgType}`]}`;
        for (let i = 0; i < args.length; ++i) {
          msg = msg.replace(new RegExp(`%${i}%`, "g"), args[i]);
        }
        this.origConsole.warn(msg);
      },
      previousELM);
    this.eventListenerManager.enable();

    this.elementCreationDetector = new ElementCreationDetector(this.overrider);
    this.elementDetector = new ElementDetector();
    this.elementStyleListener = new ElementStyleListener(this.overrider);
    this.geolocationOverrider = new GeolocationOverrider(this.overrider);
    this.languageOverrider = new LanguageOverrider(this.overrider);
    this.XHRAndFetchObserver = new XHRAndFetchObserver(this.overrider);
    this.userAgentOverrider = new UserAgentOverrider(this.overrider,
                                this.mockObjects, config.DefaultUAString);

    this.functionBindProxy = new FunctionBindProxy({
      onInvalidBindAttempted: () => {
        throw new TypeError(Messages.LogInvalidFunctionBind);
      },
      onBoundFunctionCalled: fnString => {
        this.trace(Messages.LogBoundFunctionCalled, fnString);
      },
    });

    /* Set a property on the page script window that we can
       communicate with, so the user can access us in the console */
    this.injection = this.overrider.register(
      UUID,
      {
        get: () => {
          return {
            change: configChanges => { this.onConfigChanges(configChanges); },
            keepAlive: instanceId => { this.keepAlive(instanceId); },
            shutdown: () => { this.shutdown(); },
          };
        },
        enumerable: false,
      }
    );

    /* But be sure to hide that property from the page scripts as much
       as we can (short of them just guessing the UUID) */
    this.injectionHider = this.overrider.register(
      "Object.getOwnPropertyDescriptors",
      {
        call: (thisObj, origGOPDFn, args) => {
          const retval = origGOPDFn.apply(thisObj, args);
          delete retval[UUID];
          return retval;
        },
      }
    );
    this.injectionHider2 = this.overrider.register(
      "Object.getOwnPropertyNames",
      {
        call: (thisObj, origGOPNFn, args) => {
          return origGOPNFn.apply(thisObj, args).
                            filter(name => name !== UUID);
        },
      }
    );
    this.injectionHider3 = this.overrider.register(
      "window.hasOwnProperty",
      {
        call: (thisObj, origHOPFn, args) => {
          if (args[1] === UUID) {
            return false;
          }
          return origHOPFn.call(thisObj, args);
        },
      }
    );

    this.overrider.enable(this.injection);
    this.overrider.enable(this.injectionHider);
    this.overrider.enable(this.injectionHider2);
    this.overrider.enable(this.injectionHider3);

    this.filterTinkerMessagesFromWindow();

    this.onConfigChanged();

    if (targetWindow.top === targetWindow) {
      this.origConsole.info(Messages.APIAnnounceKey.replace("KEY", UUID));
    }
  }

  onConfigChanged() {
    this.syncEventListenersWithConfig();
    this.syncElementCreationDetectorWithConfig();
    this.syncElementDetectorWithConfig();
    this.syncElementStyleListenerWithConfig();
    this.syncSyncXHRPolyfixWithConfig();
    this.syncXHRAndFetchObserverWithConfig();
    this.syncGeolocationOverriderWithConfig();
    this.syncLanguageOverriderWithConfig();
    this.syncFunctionBindProxyWithConfig();
    this.syncSimpleOverridesWithConfig();
    this.syncUserAgentOverriderWithConfig();
  }

  getActiveSimpleOverridesFromLegacyConfig() {
    const overrides = {};
    for (const config of Object.values(this.config)) {
      const {enabled, methods, properties} = config || {};
      if (!enabled) {
        continue;
      }
      for (const [hook, action] of Object.entries(methods || {})) {
        if (action !== "nothing") {
          overrides[hook] = {enabled: true, onCall: action};
        }
      }
      for (const [hook, action] of Object.entries(properties || {})) {
        if (action !== "nothing") {
          overrides[hook] = {enabled: true, onGet: action, onSet: action};
        }
      }
    }
    return overrides;
  }

  syncSimpleOverridesWithConfig() {
    for (const id of this.simpleOverrides || []) {
      this.overrider.disable(id);
    }
    this.simpleOverrides = [];
    const settings = Object.assign({}, this.config.SimpleOverrides || {},
                                   this.getActiveSimpleOverridesFromLegacyConfig());
    for (const [hook, {onGet, onSet, onCall, enabled}] of Object.entries(settings)) {
      if (!enabled) {
        continue;
      }
      if (onGet === "hide" || onSet === "hide" || onCall === "hide") {
        this.simpleOverrides.push(this.overrider.register(hook));
      } else {
        let get;
        let set;
        let call;
        switch (onGet) {
          case "ignore":
            get = (thisObj, origGetter, args) => {
              return this.overrider.doCall(thisObj, origGetter, args);
            };
            break;
          case "ignore and log":
            get = (thisObj, origGetter, args) => {
              return this.overrider.doCall(thisObj, origGetter, args);
            };
            break;
          case "log stack trace":
            get = (thisObj, fn, args) => {
              this.trace(hook, Messages.LogGetterAccessed, args);
              return this.overrider.doCall(thisObj, fn, args);
            };
            break;
          default:
            get = this.getActionFor(onGet);
        }
        switch (onSet) {
          case "ignore":
            set = (thisObj, origSetter, args) => {
            };
            break;
          case "ignore and log":
            set = (thisObj, origSetter, args) => {
              this.trace(hook, Messages.LogIgnoringSetterCall, args);
            };
            break;
          case "log stack trace":
            set = (thisObj, fn, args) => {
              this.trace(hook, Messages.LogSetterCalled, args);
              return this.overrider.doCall(thisObj, fn, args);
            };
            break;
          default:
            set = this.getActionFor(onGet);
        }
        switch (onCall) {
          case "ignore":
            call = (thisObj, fn, args) => {
            };
            break;
          case "ignore and log":
            call = (thisObj, fn, args) => {
              this.trace(hook, Messages.LogIgnoringCallWithArgs, args, thisObj);
            };
            break;
          case "log stack trace":
            call = (thisObj, fn, args) => {
              this.trace(hook, Messages.LogCalledWithArgs, args, thisObj);
              return this.overrider.doCall(thisObj, fn, args);
            };
            break;
          default:
            call = this.getActionFor(onCall);
        }
        this.simpleOverrides.push(this.overrider.register(hook, {get, set, call}));
      }
    }
    for (const id of this.simpleOverrides) {
      this.overrider.enable(id);
    }
  }

  onConfigChanges(changes) {
    let hadChanges = false;
    for (const [name, newConfig] of Object.entries(changes)) {
      this.config[name] = newConfig;
      hadChanges = true;
    }
    if (hadChanges) {
      this.onConfigChanged();
    }
  }

  log() {
    this.origConsole.log.apply(this.origConsole, arguments);
  }

  trace() {
    if (this.tracing) {
      return;
    }
    this.tracing = true;
    this.origConsole.log.apply(this.origConsole, arguments);
    this.origConsole.trace();
    this.tracing = false;
  }

  matchRegex(str) {
    const isRE = str.match(/^\/(.*)\/([gimuy]*)$/);
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
  }

  getCommaSeparatedList(str) {
    const vals = str || "";
    if (vals) {
      return vals.split(",").map(v => v.trim());
    }
    return [];
  }

  matchCommaSeparatedList(str) {
    const vals = this.getCommaSeparatedList(str);
    return {
      match: str => vals.includes(str),
      replace: (str, rep) => rep,
    };
  }

  matchString(str) {
    return {
      match: str2 => str === str2,
      replace: (str, rep) => rep,
    };
  }

  getActionFor(code) {
    if (code === "start debugger") {
      return (obj, origHandler, args) => {
        debugger; /* eslint-disable-line no-debugger */
        return this.overrider.doCall(obj, origHandler, args);
      };
    } else if (code === "log stack trace") {
      return (obj, origFn, args) => {
        this.trace(obj, origFn, args);
        return this.overrider.doCall(obj, origFn, args);
      };
    } else if (code === "ignore") {
      return (obj, origFn, args) => {
      };
    } else if (code === "ignore and log") {
      return (obj, origFn, args) => {
        this.trace(Messages.LogIgnoringCall, obj, origFn, args);
      };
    } else if (code === "nothing") {
      return undefined;
    }
    return new Function("obj", "origHandler", "args",
                        `${code}//${this.config.AllowEvalsToken}`);
  }

  unwatchElementCreationDetectorRules() {
    for (const rule of this.elementCreationDetectorRules || []) {
      this.elementCreationDetector.unwatch(rule);
    }
  }

  unwatchElementDetectorRules() {
    for (const rule of this.eventManagerRules || []) {
      this.elementDetector.unwatch(rule);
    }
  }

  unwatchElementStyleListenerRules() {
    for (const rule of this.elementStyleListenerRules || []) {
      this.elementStyleListener.unwatch(rule);
    }
  }

  unwatchEventManagerOverrides() {
    for (const override of this.eventManagerOverrides || []) {
      this.eventListenerManager.unwatch(override);
    }
  }

  unwatchXHRAndFetchObserverRules() {
    for (const rule of this.XHRAndFetchObserverRules || []) {
      this.XHRAndFetchObserverRules.unwatch(rule);
    }
  }

  syncXHRAndFetchObserverWithConfig() {
    this.unwatchXHRAndFetchObserverRules();
    const settings = this.config.ObserveXHRandFetch;
    if (!settings || !settings.enabled) {
      return;
    }
    const rules = this.XHRAndFetchObserverRules = [];
    const {
      onlyMethods = undefined,
      onlyURLs = undefined,
      onOpen = "nothing",
      onSend = "nothing",
    } = settings;
    const rule = {};
    if (onlyMethods) {
      rule.onlyMethods = this.matchRegex(onlyMethods) || this.matchCommaSeparatedList(onlyMethods);
    }
    if (onlyURLs) {
      rule.onlyURLs = this.matchRegex(onlyURLs) || this.matchString(onlyURLs);
    }
    switch (onOpen) {
      case "ignore": {
        rule.onOpen = (request, args) => {
          return false;
        };
        break;
      }
      case "ignore and log": {
        rule.onOpen = (request, args) => {
          this.trace(Messages.LogIgnoringRequestOpen, request, args);
          return false;
        };
        break;
      }
      case "log stack trace": {
        rule.onOpen = (request, args) => {
          this.trace(Messages.LogRequestOpen, request, args);
        };
        break;
      }
      default: {
        rule.onOpen = this.getActionFor(onOpen);
      }
    }
    switch (onSend) {
      case "ignore": {
        rule.onSend = (request, args) => {
          return false;
        };
        break;
      }
      case "ignore and log": {
        rule.onSend = (request, args) => {
          this.trace(Messages.LogIgnoringRequestSend, request, args);
          return false;
        };
        break;
      }
      case "log stack trace": {
        rule.onSend = (request, args) => {
          this.trace(Messages.LogRequestSend, request, args);
        };
        break;
      }
      default: {
        rule.onSend = this.getActionFor(onSend);
      }
    }
    rules.push(rule);
    this.XHRAndFetchObserver.watch(rule);
    this.XHRAndFetchObserver.enable();
  }

  syncFunctionBindProxyWithConfig() {
    let enabled = false;
    try {
      enabled = this.config.FunctionBind.enabled;
    } catch (_) { }
    if (enabled) {
      this.functionBindProxy.enable();
    } else {
      this.functionBindProxy.disable();
    }
  }

  syncGeolocationOverriderWithConfig() {
    let enabled = false;
    const options = this.config.Geolocation;
    if (options) {
      this.geolocationOverrider.setOptions(options);
    }
    try {
      enabled = options.enabled;
    } catch (_) { }
    if (enabled) {
      this.geolocationOverrider.enable();
    } else {
      this.geolocationOverrider.disable();
    }
  }

  syncLanguageOverriderWithConfig() {
    let enabled = false;
    const options = this.config.OverrideLanguages;
    if (options) {
      this.languageOverrider.setOptions(options);
    }
    try {
      enabled = options.enabled;
    } catch (_) { }
    if (enabled) {
      this.languageOverrider.enable();
    } else {
      this.languageOverrider.disable();
    }
  }

  syncSyncXHRPolyfixWithConfig() {
    if (!this.syncXHRPolyfix) {
      return;
    }
    let enabled = false;
    try {
      enabled = this.config.ObserveXHRandFetch.enabled &&
                this.config.ObserveXHRandFetch.flags.syncXHRPolyfix;
    } catch (_) { }
    if (enabled) {
      this.syncXHRPolyfix.enable();
    } else {
      this.syncXHRPolyfix.disable();
    }
  }

  syncElementStyleListenerWithConfig() {
    this.unwatchElementStyleListenerRules();
    const settings = this.config.StyleProperties;
    if (!settings || !settings.enabled) {
      this.elementStyleListener.disable();
      return;
    }
    this.elementStyleListener.enable();
    const rules = this.elementStyleListenerRules = [];
    const {
      properties = undefined,
      selector = undefined,
      onlyValues = undefined,
      onGet = "nothing",
      onSet = "nothing",
    } = settings;
    const rule = {};
    if (properties) {
      rule.properties = this.getCommaSeparatedList(properties);
    }
    if (selector) {
      rule.selector = selector;
    }
    if (onlyValues) {
      rule.onlyValues = (this.matchRegex(onlyValues) || this.matchCommaSeparatedList(onlyValues) || {}).match;
    }
    switch (onGet) {
      case "log stack trace": {
        rule.onGet = (prop, elem, value) => {
          this.trace(elem, `.style.${prop}`, Messages.LogGetterAccessed, value);
        };
        break;
      }
      default: {
        const action = this.getActionFor(onGet);
        if (action) {
          rule.onGet = (prop, elem, value) => {
            return action(elem, prop, value);
          };
        }
      }
    }
    switch (onSet) {
      case "log stack trace": {
        rule.onSet = (prop, elem, value) => {
          this.trace(elem, `.style.${prop}`, Messages.LogSetterCalled, value);
        };
        break;
      }
      default: {
        const action = this.getActionFor(onSet);
        if (action) {
          rule.onSet = (prop, elem, value) => {
            return action(elem, prop, value);
          };
        }
      }
    }
    rules.push(rule);
    this.elementStyleListener.watch(rule);
  }

  syncElementCreationDetectorWithConfig() {
    this.unwatchElementCreationDetectorRules();
    const settings = this.config.ElementCreation;
    if (!settings || !settings.enabled) {
      this.elementCreationDetector.disable();
      return;
    }
    this.elementCreationDetector.enable();
    const rules = this.elementCreationDetectorRules = [];
    const {
      names = undefined,
      onCreated = "nothing",
    } = settings;
    const rule = {};
    if (names) {
      rule.names = this.getCommaSeparatedList(names);
    }
    switch (onCreated) {
      case "log stack trace": {
        rule.onCreated = (name, destElem) => {
          this.trace(Messages.LogElementCreated, name, destElem);
        };
        break;
      }
      default: {
        const action = this.getActionFor(onCreated);
        if (action) {
          rule.onCreated = elem => {
            return action(elem);
          };
        }
      }
    }
    rules.push(rule);
    this.elementCreationDetector.watch(rule);
  }

  syncElementDetectorWithConfig() {
    this.unwatchElementDetectorRules();
    const settings = this.config.ElementDetection;
    if (!settings || !settings.enabled) {
      this.elementDetector.disable();
      return;
    }
    this.elementDetector.enable();
    const rules = this.elementDetectorRules = [];
    const {
      selector = undefined,
      onDetected = "nothing",
      onLost = "nothing",
    } = settings;
    const rule = {};
    if (selector) {
      rule.selector = selector;
    }
    switch (onDetected) {
      case "log stack trace": {
        rule.onDetected = (elem, changed, oldValue) => {
          this.trace(Messages.LogElementDetected, elem, changed, oldValue);
        };
        break;
      }
      default: {
        const action = this.getActionFor(onDetected);
        if (action) {
          rule.onDetected = elem => {
            return action(elem);
          };
        }
      }
    }
    switch (onLost) {
      case "log stack trace": {
        rule.onLost = (elem, changed, oldValue) => {
          this.trace(Messages.LogElementLost, elem, changed, oldValue);
        };
        break;
      }
      default: {
        rule.onLost = this.getActionFor(onLost);
      }
    }
    rules.push(rule);
    this.elementDetector.watch(rule);
  }

  syncEventListenersWithConfig() {
    this.unwatchEventManagerOverrides();
    const settings = this.config.EventListener;
    if (!settings || !settings.enabled) {
      return;
    }
    const overrides = this.eventManagerOverrides = [];
    const {
      types = undefined,
      matches = undefined,
      onAdded = "nothing",
      onRemoved = "nothing",
      onEvent = "nothing",
    } = settings;
    const override = {};
    if (matches) {
      override.matches = matches;
    }
    if (types) {
      override.types = (this.matchRegex(types) || this.matchCommaSeparatedList(types) || {}).match;
    }
    switch (onAdded) {
      case "ignore": {
        override.onAdded = (elem, type, handler, opts) => {
          return false;
        };
        break;
      }
      case "ignore and log": {
        override.onAdded = (elem, type, handler, opts) => {
          this.trace(type, Messages.LogIgnoringListenerAddedOn, elem, handler, opts);
          return false;
        };
        break;
      }
      case "log stack trace": {
        override.onAdded = (elem, type, handler, opts) => {
          this.trace(type, Messages.LogListenerAddedOn, elem, handler, opts);
        };
        break;
      }
      default: {
        const action = this.getActionFor(onAdded);
        if (action) {
          override.onAdded = (elem, type, handler, opts) => {
            return action(elem, handler, opts);
          };
        }
      }
    }
    switch (onRemoved) {
      case "ignore": {
        override.onRemoved = (elem, type, handler, opts) => {
          return false;
        };
        break;
      }
      case "ignore and log": {
        override.onRemoved = (elem, type, handler, opts) => {
          this.trace(type, Messages.LogIgnoringListenerRemovedFrom, elem, handler, opts);
          return false;
        };
        break;
      }
      case "log stack trace": {
        override.onRemoved = (elem, type, handler, opts) => {
          this.trace(type, Messages.LogListenerRemovedFrom, elem, handler, opts);
        };
        break;
      }
      default: {
        const action = this.getActionFor(onRemoved);
        if (action) {
          override.onRemoved = (elem, type, handler, opts) => {
            return action(elem, handler, opts);
          };
        }
      }
    }
    switch (onEvent) {
      case "ignore":
        override.onEvent = (thisObj, handler, event) => {
          return false;
        };
        break;
      case "ignore and log":
        override.onEvent = (thisObj, handler, event) => {
          this.trace(event.type, Messages.LogIgnoringEvent, event.target, event, handler);
          return false;
        };
        break;
      case "log stack trace":
        override.onEvent = (thisObj, handler, event) => {
          this.trace(event.type, Messages.LogEventFiredOn, event.target, event, handler);
        };
        break;
      default:
        override.onEvent = this.getActionFor(onEvent);
    }
    overrides.push(override);
    this.eventListenerManager.watch(override);
  }

  syncUserAgentOverriderWithConfig() {
    const config = this.config.UserAgentOverrides || {};
    const shouldSpoof = config.enabled && (!config.flags || config.flags.spoofScriptingEnvironment);
    const targetUA = shouldSpoof ? config.selected : undefined;
    /* If spoofing only headers, ensure navigator.userAgent will be the UA's default */
    const spoofOnlyUAString = (!targetUA && (!config.flags || !config.flags.spoofScriptingEnvironment)) ||
                              (config.flags && config.flags.spoofOnlyUserAgentString);
    this.userAgentOverrider.spoofWindowAs(targetUA, spoofOnlyUAString);
  }

  shutdown() {
    /* Do nothing if we were already shut down */
    if (!this.instanceId) {
      return;
    }
    this.instanceId = 0;

    /* Note: leave our injectionHiders active */

    const {injection, windowOnMessageOverride,
           filterOurMessagesOverride} = this;

    if (injection) {
      const {config, eventListenerManager, origConsole} = this;
      this.overrider.unregister(injection);
      this.overrider.enable(this.overrider.register(
        this.config.UUID,
        {
          get: () => {
            return {
              config,
              origConsole,
              eventListenerManager,
            };
          },
          enumerable: false,
        }
      ));
    }

    if (windowOnMessageOverride) {
      this.overrider.unregister(windowOnMessageOverride);
      this.windowOnMessageOverride = undefined;
      if (this.wrappedOnMessageHandler) {
        window.onmessage = this.wrappedOnMessageHandler;
        this.wrappedOnMessageHandler = undefined;
      }
    }

    if (filterOurMessagesOverride) {
      this.eventListenerManager.unwatch(filterOurMessagesOverride);
      this.filterOurMessagesOverride = undefined;
    }

    for (const hook of [
      this.functionBindProxy,
      this.elementCreationDetector,
      this.elementDetector,
      this.elementStyleListener,
      this.eventListenerManager,
    ]) {
      if (hook) {
        hook.disable();
      }
    }

    this.mockObjects.shutdown();
  }

  filterTinkerMessagesFromWindow(event, handler) {
    this.filterOurMessagesOverride = {
      types: "message",
      matches: window,
      onEvent: (elem, originalHandler, event) => {
        if (event.data[this.config.UUID]) {
          return false; /* stop the event right here */
        }
        return undefined;
      },
    };
    this.eventListenerManager.watch(this.filterOurMessagesOverride);

    this.wrappedOnMessageHandler = undefined;
    this.windowOnMessageOverride = this.overrider.register(
      "window.onmessage",
      {
        get: () => {
          return this.wrappedOnMessageHandler;
        },
        set: (thisObj, origSetter, args) => {
          if (this.wrappedOnMessageHandler) {
            window.removeEventListener("message", this.wrappedOnMessageHandler);
          }
          this.wrappedOnMessageHandler = args[0];
          window.addEventListener("message", this.wrappedOnMessageHandler);
        },
      },
    );
    this.overrider.enable(this.windowOnMessageOverride);
  }

  keepAlive(tinkerInstanceId) {
    if (this.instanceId !== tinkerInstanceId) {
      return;
    }
    if (this.lastHeartBeat) {
      clearTimeout(this.lastHeartBeat);
    }
    this.lastHeartBeat = setTimeout(() => {
      this.shutdown();
    }, 5000);
  }

  sendMessageToAddon(msg) {
    if (!this.injection) {
      return;
    }

    const obj = {};
    obj[this.config.UUID] = msg;
    window.postMessage(obj, "*");
  }
}
