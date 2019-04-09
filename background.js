/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global chrome, makeUUID, MaybeActivateCORSBypassListener,
          SetRequestHeaderOverrides, SetURLReplacements, UserAgentOverrider  */

const UUID = makeUUID();

const IsAndroid = navigator.userAgent.includes("Android");

const DefaultTabConfig = {
  UUID,
  DefaultUAString: navigator.userAgent,
};

const gTabConfigs = {};

const portsToPanels = (function() {
  const ports = {};
  let nextId = 0;

  chrome.runtime.onConnect.addListener(port => {
    const id = ++nextId;
    ports[id] = port;
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(function() {
      delete ports[id];
    });
  });

  async function broadcast(message, skip) {
    for (const port of Object.values(ports)) {
      if (port !== skip) {
        port.postMessage(message);
      }
    }
  }

  return {broadcast};
}());

// If we don't check lastError, we get console spam we don't care about.
function IgnoreErrors() {
  chrome.runtime.lastError;
}

function matchRegex(str) {
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

function matchString(str) {
  return {
    match: str2 => str === str2,
    replace: (str, rep) => rep,
  };
}

const OnActiveTabConfigUpdated = {
  listeners: new Set(),
  addListener: listener => {
    OnActiveTabConfigUpdated.listeners.add(listener);
  },
  removeListener: listener => {
    OnActiveTabConfigUpdated.listeners.remove(listener);
  },
  fire: tabConfig => {
    for (const listener of OnActiveTabConfigUpdated.listeners) {
      listener(tabConfig);
    }
  },
};

OnActiveTabConfigUpdated.addListener(tabConfig => {
  // Update the current network request overrides.
  const requestOverridesConfig = (tabConfig && tabConfig.OverrideNetworkRequests) || {};
  const urlReplacements = [];
  if (requestOverridesConfig.enabled) {
    for (const [type, valuesForType] of Object.entries(requestOverridesConfig.values)) {
      for (const [name, value] of Object.entries(valuesForType)) {
        urlReplacements.push({
          matcher: matchRegex(name) || matchString(name),
          replacement: value,
          type,
        });
      }
    }
  }
  SetURLReplacements(urlReplacements);

  // Also update the current request header overrides.
  const requestHeaderOverrides = {alwaysSet: {}, onlyOverride: {}};
  const uaConfig = tabConfig.UserAgentOverrides || {};
  if (uaConfig.enabled && (!uaConfig.flags || uaConfig.flags.spoofHTTPHeaders)) {
    const uaOverrides = UserAgentOverrider.getUAConfig(uaConfig.selected) || {};
    if (uaConfig.flags.spoofOnlyUserAgentString) {
      const value = uaOverrides.headers["User-Agent"];
      if (value) {
        requestHeaderOverrides["User-Agent"] = {type: "alwaysSet", value};
      }
    } else {
      for (const [name, value] of Object.entries(uaOverrides.headers || {})) {
        requestHeaderOverrides[name] = {type: "alwaysSet", value};
      }
    }
  }
  const languageOverrides = tabConfig && tabConfig.OverrideLanguages;
  if (languageOverrides && languageOverrides.enabled) {
    const value = languageOverrides.languages;
    requestHeaderOverrides["Accept-Language"] = {type: "alwaysSet", value};
  }
  const requestHeaderOverridesConfig = tabConfig && tabConfig.OverrideRequestHeaders;
  if (requestHeaderOverridesConfig && requestHeaderOverridesConfig.enabled) {
    for (const [type, valuesForType] of Object.entries(requestHeaderOverridesConfig.values)) {
      if (["alwaysSet", "onlyOverride"].includes(type)) {
        for (const [name, value] of Object.entries(valuesForType)) {
          requestHeaderOverrides[name] = {type, value};
        }
      }
    }
  }
  SetRequestHeaderOverrides(requestHeaderOverrides);

  // Also check if we should activate the CORS bypass.
  MaybeActivateCORSBypassListener(tabConfig);
});

function getTabConfig(tabId) {
  if (!gTabConfigs[tabId]) {
    gTabConfigs[tabId] = Object.assign({tabId}, DefaultTabConfig);
  }
  return gTabConfigs[tabId];
}

let ActiveTabId;

// Detect when the user changes tabs in the same window
chrome.tabs.onActivated.addListener(activeInfo => {
  const {tabId} = activeInfo;
  if (ActiveTabId === tabId) {
    return;
  }
  ActiveTabId = tabId;

  const tabConfig = getTabConfig(tabId);
  OnActiveTabConfigUpdated.fire(tabConfig);

  refreshPageActionIcon(tabConfig);

  // We also need to inform the UI that we've switched tabs, so that
  // it can re-draw itself with that tab's current active config.
  portsToPanels.broadcast({activeTabChanged: tabId});
});

// Detect when the user changes tabs by changing windows
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId < 0) {
    return;
  }
  chrome.tabs.query({active: true, windowId}, tabs => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      if (ActiveTabId === tabId) {
        return;
      }
      ActiveTabId = tabId;
      const tabConfig = getTabConfig(tabId);
      OnActiveTabConfigUpdated.fire(tabConfig);
    }
  });
});

// Detect when the user "changes" tabs by changing one's URL
chrome.webNavigation.onCommitted.addListener(({tabId}) => {
  // When the user refreshes the page (etc) we have to re-enable
  // the page action icon, or it might be disabled.
  const tabConfig = getTabConfig(tabId);
  refreshPageActionIcon(tabConfig);
});

function isAccessibleTab(url) {
  // about:/chrome: pages cannot be altered, so they never have an active config.
  return url && (url.startsWith("http:") || url.startsWith("https:") ||
                 url.startsWith("ws:") || url.startsWith("wss:") ||
                 url.startsWith("data:") || url.startsWith("file:"));
}

function getTabForSender(sender) {
  return new Promise(resolve => {
    const tab = sender ? (sender.sender || sender).tab : undefined;
    if (tab) {
      chrome.tabs.get(tab.id, tab => {
        resolve(tab);
      });
    } else {
      chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        resolve(tabs[0]);
      });
    }
  });
}

function onMessage(message, sender) {
  if (message === "getTabConfig") {
    getTabForSender(sender).then(tab => {
      let tabConfig = false;
      if (tab) {
        tabConfig = getTabConfig(tab.id);
      }
      tabConfig.accessible = isAccessibleTab(tab.url);
      sender.postMessage({tabConfig});
    });
    return true;
  } else if (message.preexistingTabConfig) {
    // An old instance of Tinker was still around on a window, so we
    // have recovered the user's settings (useful if they reload the
    // addon during development, for instance).
    getTabForSender(sender).then(({id}) => {
      const tabConfig = message.preexistingTabConfig;
      if (tabConfig.tabId === id) {
        gTabConfigs[id] = tabConfig;
      }
      refreshPageActionIcon(tabConfig);
      portsToPanels.broadcast({tabConfig}, sender);
    });
  } else if (message.tabConfigChanges) {
    // A page action or devtools panel is informing us that the user
    // has changed a tab's config.
    const {tabId, tabConfigChanges} = message;

    // Fold the changes into our cached config for the tab, so that if we
    // change between tabs, we'll be able to remember its config.
    const tabConfig = getTabConfig(tabId);
    for (const [hookName, options] of Object.entries(tabConfigChanges) || {}) {
      tabConfig[hookName] = Object.assign(tabConfig[hookName] || {}, options);
    }

    chrome.tabs.get(tabId, tab => {
      if (tab.active) {
        OnActiveTabConfigUpdated.fire(tabConfig);
      }
    });

    // Also send the changes to the tab's content script so it can act on them.
    chrome.tabs.sendMessage(tabId, tabConfigChanges, IgnoreErrors);

    refreshPageActionIcon(tabConfig);
    portsToPanels.broadcast({tabConfig});
  }
  return undefined;
}
chrome.runtime.onMessage.addListener(onMessage);

function checkIfActiveOnThisTab(tabConfig) {
  for (const setting of Object.values(tabConfig || {})) {
    if (setting.enabled) {
      return true;
    }
  }
  return false;
}

function refreshPageActionIcon(tabConfig) {
  const {tabId} = tabConfig;
  chrome.tabs.get(tabId, tab => {
    if (!isAccessibleTab(tab.url)) {
      return;
    }
    const active = checkIfActiveOnThisTab(tabConfig);
    const path = active ? "icons/active.svg" : "icons/inactive.svg";
    if (chrome.pageAction.setIcon) {
      chrome.pageAction.setIcon({path, tabId}, IgnoreErrors);
    }
    chrome.pageAction.show(tabId, IgnoreErrors);
  });
}

// We have to enable the page action icons as the addon loads,
// and also specify an icon so Chrome doesn't use a default one.
chrome.tabs.query({active: true}, tabs => {
  for (const tab of tabs) {
    const tabConfig = getTabConfig(tab.id);
    refreshPageActionIcon(tabConfig);
  }
});
