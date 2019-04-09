/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class SyncXHRPolyfix {
  static get XHREvents() {
    return ["abort", "error", "load", "loadend", "loadstart",
            "progress", "readystatechange", "timeout"];
  }

  constructor(overrider) {
    this.overrider = overrider;
    this.openSyncXHRs = new WeakMap();
    this.stateSpoofs = new WeakMap();
    this.currentlyBlockingOnSyncXHRs = 0;
    this.mustUnblockEventsNow = false;
    this.currentlyBlockedEvents = [];
    this.unblockingEvents = false;

    this.openHook = this.overrider.register(
      "XMLHttpRequest.prototype.open", {
        call: (xhr, origXHROpen, args) => {
          if (args.length > 2 && !args[2]) {
            this.openSyncXHRs.set(xhr);
          }
          return this.overrider.doCall(xhr, origXHROpen, args);
        }
      }
    );
    this.sendHook = this.overrider.register(
      "XMLHttpRequest.prototype.send", {
        call: (xhr, origXHRSend, args) => {
          if (this.openSyncXHRs.has(xhr)) {
            this.unblockEventsIfNecessary();
            this.currentlyBlockingOnSyncXHRs++;
            this.currentlyBlockedEvents = [];
            let caughtException;
            try {
              this.overrider.doCall(xhr, origXHRSend, args);
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
            this.overrider.doCall(xhr, origXHRSend, args);
          }
        }
      }
    );
    this.addListenerHook = this.overrider.register(
      "XMLHttpRequest.addEventListener", {
        call: (xhr, origXHRAEL, args) => {
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
      }
    );
    this.removeListenerHook = this.overrider.register(
      "XMLHttpRequest.removeEventListener", {
        call: (xhr, origXHRREL, args) => {
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
      }
    );
    this.readyStateHook = this.overrider.register(
      "XMLHttpRequest.prototype.readyState", {
        get: (xhr, origGetter, args) => {
          if (this.stateSpoofs.has(xhr)) {
            const spoof = this.stateSpoofs.get(xhr).readyState;
            if (spoof !== undefined) {
              return spoof;
            }
          }
          return this.overrider.doCall(xhr, origGetter, args);
        }
      }
    );
    this.responseTextHook = this.overrider.register(
      "XMLHttpRequest.prototype.responseText", {
        get: (xhr, origGetter, args) => {
          const liveText = this.overrider.doCall(xhr, origGetter, args);
          if (this.stateSpoofs.has(xhr)) {
            const length = this.stateSpoofs.get(xhr).responseText;
            if (length !== undefined && length !== liveText.length) {
              return liveText.substr(0, length);
            }
          }
          return liveText;
        }
      }
    );
    this.postMessageHook = this.overrider.register(
      "window.postMessage", {
        call: (win, origFn, args) => {
          const overrider = this.overrider;
          Promise.resolve().then(() => {
            if (this.currentlyBlockingOnSyncXHRs) {
              this.currentlyBlockedEvents.push(function postMessage() {
                overrider.doCall(win, origFn, args);
              });
            } else {
              overrider.doCall(win, origFn, args);
            }
          });
        }
      }
    );
    for (const eventName of SyncXHRPolyfix.XHREvents) {
      const prop = `on${eventName}`;
      let currentHandler;
      this[`${prop}Hook`] = this.overrider.register(
        `XMLHttpRequest.prototype.${prop}`, {
          get: (xhr, origGetter, args) => {
            return currentHandler;
          },
          set: (xhr, origSetter, args) => {
            currentHandler = args[0];
            this.overrider.doCall(xhr, origSetter,
              [this.wrapHandler(currentHandler, eventName)]);
          }
        }
      );
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
    this.overrider.enable(this.openHook);
    this.overrider.enable(this.sendHook);
    this.overrider.enable(this.readyStateHook);
    this.overrider.enable(this.addListenerHook);
    this.overrider.enable(this.removeListenerHook);
    this.overrider.enable(this.responseTextHook);
    this.overrider.enable(this.postMessageHook);
    for (const eventName of SyncXHRPolyfix.XHREvents) {
      this.overrider.enable(this[`on${eventName}Hook`]);
    }
  }

  disable() {
    this.unblockEventsIfNecessary();
    this.overrider.disable(this.openHook);
    this.overrider.disable(this.sendHook);
    this.overrider.disable(this.addListenerHook);
    this.overrider.disable(this.removeListenerHook);
    this.overrider.disable(this.readyStateHook);
    this.overrider.disable(this.responseTextHook);
    this.overrider.disable(this.postMessageHook);
    for (const eventName of SyncXHRPolyfix.XHREvents) {
      this.overrider.disable(this[`on${eventName}Hook`]);
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
