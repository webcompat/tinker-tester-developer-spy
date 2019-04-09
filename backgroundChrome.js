/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function reloadContentScripts(config = {}) {
  const scripts = [{file: "libs/hash.js"},
                   {file: "messages.js"},
                   {file: "libs/MockObjects.js"},
                   {file: "libs/ElementCreationDetector.js"},
                   {file: "libs/ElementDetector.js"},
                   {file: "libs/ElementStyleListener.js"},
                   {file: "libs/EventListenerManager.js"},
                   {file: "libs/FunctionBindProxy.js"},
                   {file: "libs/GeolocationOverrider.js"},
                   {file: "libs/LanguageOverrider.js"},
                   {file: "libs/UserAgentOverrider.js"},
                   {file: "libs/XHRAndFetchObserver.js"},
                   {file: "libs/Tinker.js"},
                   {file: "libs/CreateOverriderPageScript.js"},
                   {file: "overridesChrome.js"}];

  chrome.tabs.query({}, async tabs => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith("chrome:")) {
        for (const scriptOptions of scripts) {
          chrome.tabs.executeScript(
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

chrome.runtime.onInstalled.addListener(details => {
  reloadContentScripts();
});
