/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Firefox allows us to use registerContentScripts to set up a new
// content script environment whenever the config changes, which will
// have the config before the page scripts run, allowing us to set up
// our overrides on the window environment early enough. The trick is
// how to actually do the overriding, given the config.

/* global cloneInto, Config, CreateOverriderPageScript, ElementDetector,
          ElementCreationDetector, ElementStyleListener, EventListenerManager,
          FunctionBindProxy, GeolocationOverrider, LanguageOverrider,
          Messages, MockObjects, SyncXHRPolyfix, Tinker, UserAgentOverrider,
          XHRAndFetchObserver */

function usePageScript() {
  // We have to modify the page script environment. We have the config,
  // but the only way to synchronously pass it to the page scripts (which
  // may run before any <script> tag we inject), is to use window.eval.
  //
  // Ideally we would be able to avoid window.eval, as it can be blocked
  // by CSP, requiring us to override the CSP to allow it, while making
  // sure we do the same job the CSP would have done for other evals.
  //
  // At first glance, we could simply run tinker in the content script,
  // using wrappedJSObject to perform our overrides. Unfortunately if the
  // content script goes away (addon is uninstalled/disabled), then all of
  // the window properties we overrode will suddenly cease to work, since
  // they are trying to run dead code from the now-gone content script.
  // This could be mitigated if a reliable way to detect when the content
  // script is going away existed, as we could properly disconnect things
  // before the script dies. But port.onDisconnect doesn't work, any long-
  // lived sendMessages to the background script are not catchable in the
  // content script if the addon is uninstalled, and CSS-transition hacks
  // have unreliable async behavior (and pollute the page environment).
  //
  // As such, we can only really use window.eval and try to clean ourselves
  // up asynchronously by detecting when the content script goes away, by
  // having the page script check if it's not dead every few seconds and
  // consider if the addon is still off or has since restarted/upgraded.

  const port = browser.runtime.connect({name: "ContentScript"});

  // eslint-disable-next-line no-eval
  const result = window.eval(`(function(initialConfig) {
    const Messages = ${JSON.stringify(Messages)};
    ${MockObjects}
    ${ElementCreationDetector}
    ${ElementDetector}
    ${ElementStyleListener}
    ${EventListenerManager}
    ${FunctionBindProxy}
    ${GeolocationOverrider}
    ${LanguageOverrider}
    ${SyncXHRPolyfix}
    ${UserAgentOverrider}
    ${XHRAndFetchObserver}
    ${Tinker}
    const overrider = (${CreateOverriderPageScript})(this);
    const tinker = new Tinker(overrider, this, initialConfig);
    const result = {tinkerInstanceId: tinker.instanceId};
    if (tinker.upgraded) {
      result.preexistingTabConfig = tinker.config;
    }
    return result;
  })(${JSON.stringify(Config)})`);

  const {tinkerInstanceId, preexistingTabConfig} = result;

  if (preexistingTabConfig) {
    port.postMessage({preexistingTabConfig});
  }

  const UUID = Config.UUID;

  // Since we cannot use onDisconnected to detect when the addon is
  // unloaded in Firefox, we have to rely on a racier and more fragile
  // method like this, whereby we have the content script send a
  // heartbeat signal to the page script, until it goes away.
  setInterval(function() {
    window.wrappedJSObject[UUID].keepAlive(tinkerInstanceId);
  }, 2500);

  // Proxy messages from the page script back to the background script.
  window.addEventListener("message", msg => {
    if (msg.source === window && msg.data[UUID]) {
      // Only pass along our own messages to the background script.
      port.postMessage(msg.data[UUID]);
    }
  }, true);

  // Proxy messages from the background script to the page script.
  port.onMessage.addListener(msg => {
    if (msg.tabConfig) {
      const win = window.wrappedJSObject;
      win[UUID].change(cloneInto(msg.tabConfig, win));
    }
  });
}

function useContentScript() {
  // For a hypothetical Firefox with registerScriptPropertyOverride,
  // we don't have to manipulate the page script environment ourselves or
  // worry about cleaning up after ourselves. As a result we can keep
  // the Tinker object isolated entirely in the content script, and
  // don't have to do anything more than keeping it's settings up-to-
  // date as the user changes them.

  const overrider = {
    register: (path, property) => {
      return browser.scriptOverride.register(path, property);
    },
    unregister: id => {
      return browser.scriptOverride.cancel(id);
    },
  };

  const tinker = new Tinker(overrider, window.wrappedJSObject, Config);
  tinker.enable();
}

if (browser.scriptOverride) {
  useContentScript();
} else {
  usePageScript();
}
