/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global DefaultTabConfig, isAccessibleTab, OnActiveTabConfigUpdated,
   SetContentScripts, UnsafeContentScriptEvals */

const AllowEvalsToken = UnsafeContentScriptEvals.allow();

DefaultTabConfig.AllowEvalsToken = AllowEvalsToken;

function getContentScriptsForTabConfig(config) {
  return [{code: `window.UnsafeContentScriptEvalsBlockReports = true;
                  window.Config = ${JSON.stringify(config)};`},
          {file: "messages.js"},
          {file: "libs/MockObjects.js"},
          {file: "libs/ElementCreationDetector.js"},
          {file: "libs/ElementDetector.js"},
          {file: "libs/ElementStyleListener.js"},
          {file: "libs/EventListenerManager.js"},
          {file: "libs/FunctionBindProxy.js"},
          {file: "libs/GeolocationOverrider.js"},
          {file: "libs/LanguageOverrider.js"},
          {file: "libs/SyncXHRPolyfix.js"},
          {file: "libs/UserAgentOverrider.js"},
          {file: "libs/XHRAndFetchObserver.js"},
          {file: "libs/Tinker.js"},
          {file: "libs/CreateOverriderPageScript.js"},
          {file: "overridesFirefox.js"}];
}

const ContentScripts = [];

OnActiveTabConfigUpdated.addListener(tabConfig => {
  // When the user changes the active tab, set the content scripts that
  // will be run if they reload that tab (so they have the tab's TTDS
  // configuration early, before any page scripts run).
  SetContentScripts(getContentScriptsForTabConfig(tabConfig));
});

// No content scripts are run when the addon loads, so we need to run
// default ones on each tab. This allows us to check if TTDS was running
// on any of those tabs, and if so, get and upgrade that old configuration.
// It also lets TTDS try to hook up as early as possible to the tab.
function initContentScriptForAllTabs() {
  browser.tabs.query({discarded: false}).then(async tabs => {
    for (const tab of tabs) {
      if (isAccessibleTab(tab.url)) {
        const tabConfig = Object.assign({tabId: tab.id}, DefaultTabConfig);
        const tabScripts = getContentScriptsForTabConfig(tabConfig);
        for (const scriptOptions of tabScripts) {
          await browser.tabs.executeScript(
            tab.id,
            Object.assign(scriptOptions, {
              runAt: "document_start",
              allFrames: true,
            })
          );
        }
      }
    }
  });
}
initContentScriptForAllTabs();
