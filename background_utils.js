/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser */

function checkIfActiveOnThisTab(tabConfig) {
  if (browser.browserAction.setIcon) {
    let active = false;
    for (let setting of Object.values(tabConfig || {})) {
      if (setting.enabled) {
        active = true;
        break;
      }
    }
    let path = active ? "icons/active.svg" : "icons/inactive.svg";
    browser.browserAction.setIcon({path});
  }
}

const setContentScript = (function() {
  if (!browser.contentScripts) {
    return async function() {};
  }

  let currentContentScript;

  return async function setContentScript(config = {}, alsoRunNow = false) {
    if (currentContentScript) {
      await currentContentScript.unregister();
      currentContentScript = undefined;
    }

    let scripts = [{file: "common.js"},
                   {code: `var Config = ${JSON.stringify(config)};`},
                   {file: "content.js"}];

    currentContentScript = await browser.contentScripts.register({
      js: scripts,
      matches: ["<all_urls>"],
      runAt: "document_start",
      allFrames: true,
    });

    if (alsoRunNow) {
      browser.tabs.query({active: true}).then(async activeTabs => {
        for (let tab of activeTabs) {
          if (!tab.url.startsWith("about:")) {
            for (let scriptOptions of scripts) {
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
  };
}());

let maybeActivateCORSBypassListener = (function() {
  let CORSBypassActive = false;

  const CORS_BYPASS_OVERRIDES = {
    "access-control-allow-origin": "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "CONNECT, DELETE, GET, HEAD, OPTIONS, POST, PUT",
    "content-security-policy": "upgrade-insecure-requests",
    "content-security-policy-report-only": "upgrade-insecure-requests",
  };

  const CORSBypassListener = e => {
    for (let header of e.responseHeaders) {
      let name = header.name.toLowerCase();
      let replacement = CORS_BYPASS_OVERRIDES[name];
      if (replacement) {
        console.log(`Bypassing ${name}=${header.value} for ${e.url}`);
        header.value = replacement;
      }
    }
    return {responseHeaders: e.responseHeaders};
  };

  return function maybeActivateCORSBypassListener(tabConfig) {
    let shouldBeActive = tabConfig && tabConfig.CORSBypass && tabConfig.CORSBypass.enabled;
    if (CORSBypassActive && !shouldBeActive) {
      CORSBypassActive = false;
      browser.webRequest.onHeadersReceived.removeListener(
        CORSBypassListener,
        {"urls": ["<all_urls>"]},
        ["blocking", "responseHeaders"]
      );
    } else if (!CORSBypassActive && shouldBeActive) {
      CORSBypassActive = true;
      browser.webRequest.onHeadersReceived.addListener(
        CORSBypassListener,
        {"urls": ["<all_urls>"]},
        ["blocking", "responseHeaders"]
      );
    }
  };
}());

