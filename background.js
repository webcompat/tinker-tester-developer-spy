/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, checkIfActiveOnThisTab, maybeActivateCORSBypassListener,
          setContentScript, setRequestHeaderOverrides, setURLReplacements */

const IsAndroid = navigator.userAgent.includes("Android");

const gTabConfigs = {};

const portsToPanels = (function() {
  const ports = {};
  let nextId = 0;

  browser.runtime.onConnect.addListener(port => {
    const id = ++nextId;
    ports[id] = port;
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(function() {
      delete ports[id];
    });
  });

  async function broadcast(message) {
    for (const port of Object.values(ports)) {
      port.postMessage(message);
    }
  }

  return {broadcast};
}());

// The content-script is tab-specific, and needs to be running on a tab for our
// browseraction UI to work, but it is not run immediately on any tabs in the
// manifest. As such we need to make sure that all active tabs have run the
// script on first-load, and then when they change, that the tab that has been
// changed-to is also running the script.

setContentScript({}, true);

function onActiveTabConfigUpdated(tabConfig) {
  // Update the current network request overrides.
  const requestOverridesConfig = (tabConfig && tabConfig.OverrideNetworkRequests) || {};
  const urlReplacements = [];
  if (requestOverridesConfig.enabled) {
    for (const [type, valuesForType] of Object.entries(requestOverridesConfig.values)) {
      for (const [name, value] of Object.entries(valuesForType)) {
        if (type === "redirectURL") {
          try {
            new URL(value);
          } catch (_) {
            continue;
          }
        }
        urlReplacements.push({regex: new RegExp(name), type, replacement: value});
      }
    }
  }
  setURLReplacements(urlReplacements);

  // Also update the current request header overrides.
  const requestHeaderOverrides = {alwaysSet: {}, onlyOverride: {}};
  const userAgentOverrides = tabConfig && tabConfig.UserAgentOverrides;
  if (userAgentOverrides && userAgentOverrides.enabled) {
    const overrides = (userAgentOverrides.overrides || {}).headers || {};
    for (const [name, value] of Object.entries(overrides)) {
      requestHeaderOverrides.alwaysSet[name] = value;
    }
  }
  const languageOverrides = tabConfig && tabConfig.OverrideLanguages;
  if (languageOverrides && languageOverrides.enabled) {
    requestHeaderOverrides.alwaysSet["Accept-Language"] = languageOverrides.languages;
  }
  const requestHeaderOverridesConfig = tabConfig && tabConfig.OverrideRequestHeaders;
  if (requestHeaderOverridesConfig && requestHeaderOverridesConfig.enabled) {
    for (const [type, valuesForType] of Object.entries(requestHeaderOverridesConfig.values)) {
      for (const [name, value] of Object.entries(valuesForType)) {
        requestHeaderOverrides[type][name] = value;
      }
    }
  }
  setRequestHeaderOverrides(requestHeaderOverrides);

  // Also check if we should activate the CORS bypass.
  maybeActivateCORSBypassListener(tabConfig);

  // Also regenerate the content script so that if the user reloads the page,
  // the config is retained (and is run before page scripts are run).
  // If the tabConfig is undefined, then the content script was never run for
  // the tab. We need to run it now, so tell setContentScript to do so.
  setContentScript(tabConfig, tabConfig === undefined);
}

browser.tabs.onActivated.addListener(activeInfo => {
  const tabConfig = gTabConfigs[activeInfo.tabId];

  onActiveTabConfigUpdated(tabConfig);

  checkIfActiveOnThisTab(tabConfig);

  // We also need to inform the UI that we've switched tabs, so that
  // it can re-draw itself with that tab's current active config.
  portsToPanels.broadcast("activeTabChanged");
});

function onMessage(message, sender) {
  if (message === "getActiveTabConfig") {
    // The browseraction UI wants to know what the tab's active config is.
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      // About: pages cannot be altered, so they never have an active config.
      let tabConfig = false;
      if (tabs[0] && !tabs[0].url.startsWith("about:")) {
        tabConfig = gTabConfigs[tabs[0].id] || {};
      }
      sender.postMessage({tabConfig});
    });
    return true;
  } else if (message.tabConfigChanges) {
    // The browseraction UI is informing us that the user has changed the
    // active tab's config.
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      let tabConfig;
      let haveInterestingChanges = false;

      if (tabs[0]) {
        // Fold the changes into our cached config for the tab, so that if we
        // change between tabs, we'll be able to remember its config.
        const tabId = tabs[0].id;
        if (!gTabConfigs[tabId]) {
          gTabConfigs[tabId] = {};
        }
        tabConfig = gTabConfigs[tabId];
        const changes = message.tabConfigChanges;
        for (const [hookName, options] of Object.entries(changes) || {}) {
          tabConfig[hookName] = Object.assign(tabConfig[hookName] || {}, options);

          // We don't have to do anything if there are only changes to
          // the tab's apiKey or apiPermissions (the page script will
          // have handled it already, we just have to update the config).
          if (!hookName.startsWith("api")) {
            haveInterestingChanges = true;
          }
        }

        if (haveInterestingChanges) {
          onActiveTabConfigUpdated(tabConfig);

          // Also send the changes to the tab's content script so it can act on them.
          browser.tabs.sendMessage(tabId, changes);
        }
      }

      if (haveInterestingChanges) {
        checkIfActiveOnThisTab(tabConfig);
        portsToPanels.broadcast({tabConfig});
      }
    });
    updateCurrentTabConfig(message.tabConfigChanges);
  } else if (message.apiKey) {
    const {apiKey} = message;
    updateCurrentTabConfig({apiKey}, true);
  } else if (message.apiPermissionGranted) {
    const {apiPermissionGranted} = message;
    updateCurrentTabConfig({apiPermissionGranted}, true);
  } else if (message.apiPermissionDenied) {
    const {apiPermissionDenied} = message;
    updateCurrentTabConfig({apiPermissionDenied}, true);
  }
  return undefined;
}
browser.runtime.onMessage.addListener(onMessage);
