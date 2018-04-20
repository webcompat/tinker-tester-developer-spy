/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, checkIfActiveOnThisTab, maybeActivateCORSBypassListener,
          setContentScript, setRequestHeaderOverrides, setURLReplacements */

const IsAndroid = navigator.userAgent.includes("Android");

let gIsBrowserActionPopupOpen = false;
let gTabConfigs = {};

// The content-script is tab-specific, and needs to be running on a tab for our
// browseraction UI to work, but it is not run immediately on any tabs in the
// manifest. As such we need to make sure that all active tabs have run the
// script on first-load, and then when they change, that the tab that has been
// changed-to is also running the script.

setContentScript({}, true);

function onActiveTabConfigUpdated(tabConfig) {
  // Update the current network request overrides.
  let requestOverridesConfig = tabConfig && tabConfig.OverrideNetworkRequests;
  if (requestOverridesConfig) {
    let replacements = [];
    if (requestOverridesConfig.enabled) {
      for (let [type, valuesForType] of Object.entries(requestOverridesConfig.values)) {
        for (let [name, value] of Object.entries(valuesForType)) {
          if (type === "redirectURL") {
            try {
              new URL(value);
            } catch (_) {
              continue;
            }
          }
          replacements.push({regex: new RegExp(name), type, replacement: value});
        }
      }
    }
    setURLReplacements(replacements);
  }

  // Also update the current request header overrides.
  let requestHeaderOverrides = {alwaysSet: {}, onlyOverride: {}};
  let userAgentOverrides = tabConfig && tabConfig.UserAgentOverrides;
  if (userAgentOverrides && userAgentOverrides.enabled) {
    let overrides = (userAgentOverrides.overrides || {}).headers || {};
    for (let [name, value] of Object.entries(overrides)) {
      requestHeaderOverrides.alwaysSet[name] = value;
    }
  }
  let languageOverrides = tabConfig && tabConfig.OverrideLanguages;
  if (languageOverrides && languageOverrides.enabled) {
    requestHeaderOverrides.alwaysSet["Accept-Language"] = languageOverrides.languages;
  }
  let requestHeaderOverridesConfig = tabConfig && tabConfig.OverrideRequestHeaders;
  if (requestHeaderOverridesConfig && requestHeaderOverridesConfig.enabled) {
    for (let [type, valuesForType] of Object.entries(requestHeaderOverridesConfig.values)) {
      for (let [name, value] of Object.entries(valuesForType)) {
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
  let tabConfig = gTabConfigs[activeInfo.tabId];

  onActiveTabConfigUpdated(tabConfig);

  checkIfActiveOnThisTab(tabConfig);

  // We also need to inform the UI that we've switched tabs, so that
  // it can re-draw itself with that tab's current active config.
  if (gIsBrowserActionPopupOpen) {
    browser.runtime.sendMessage("activeTabChanged");
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === "popupOpened") {
    gIsBrowserActionPopupOpen = true;
  } else if (message === "popupClosed") {
    gIsBrowserActionPopupOpen = false;
  } else if (message === "getActiveTabConfig") {
    // The browseraction UI wants to know what the tab's active config is.
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      // About: pages cannot be altered, so they never have an active config.
      if (tabs[0] && tabs[0].url.startsWith("about:")) {
        sendResponse(false);
      } else {
        sendResponse(tabs[0] && gTabConfigs[tabs[0].id] || {});
      }
    });
    return true;
  } else if (message.tabConfigChanges) {
    // The browseraction UI is informing us that the user has changed the
    // active tab's config.
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      let tabConfig;

      if (tabs[0]) {
        // Fold the changes into our cached config for the tab, so that if we
        // change between tabs, we'll be able to remember its config.
        let tabId = tabs[0].id;
        if (!gTabConfigs[tabId]) {
          gTabConfigs[tabId] = {};
        }
        tabConfig = gTabConfigs[tabId];
        let changes = message.tabConfigChanges;
        for (let [hookName, options] of Object.entries(changes) || {}) {
          tabConfig[hookName] = Object.assign(tabConfig[hookName] || {}, options);
        }

        onActiveTabConfigUpdated(tabConfig);

        // Also send the changes to the tab's content script so it can act on them.
        browser.tabs.sendMessage(tabId, changes);
      }

      checkIfActiveOnThisTab(tabConfig);
      sendResponse(tabConfig);

      if (message.closePopup && IsAndroid) {
        browser.tabs.remove(sender.tab.id);
      }
    });
    return true;
  }
  return undefined;
});

