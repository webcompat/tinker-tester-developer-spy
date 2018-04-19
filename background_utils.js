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
        console.log(browser.i18n.getMessage("bgBypassingCORSHeader", [name, header.value, e.url]));
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

const setURLReplacements = (function() {
  let replacements;
  let rewriteResponse;

  function setURLReplacements(_replacements) {
    browser.webRequest.onBeforeRequest.removeListener(rewriteResponse);
    replacements = _replacements;
    if (replacements) {
      browser.webRequest.onBeforeRequest.addListener(
        rewriteResponse,
        {urls: ["<all_urls>"]},
        ["blocking"]
      );
    }
  }

  function findReplacement(url) {
    for (let replacement of replacements) {
      if (url.match(replacement.regex)) {
        return replacement;
      }
    }
    return {};
  }

  // If the browser doesn't support replacing the response body of
  // webRequests, then simply redirect the requests. This will not
  // work properly for a lot of stuff, as any files the script
  // replaces will have to copied over as well, so they can be
  // referenced on demand (which is not easy to manage).
  if (!browser || !browser.webRequest.filterResponseData) {
    let currentlyRewriting = {};
    rewriteResponse = details => {
      if (currentlyRewriting[details.id]) {
        delete currentlyRewriting[details.id];
        return undefined;
      }

      let {type, replacement} = findReplacement(details.url);
      if (type === "redirectURL" && replacement) {
        currentlyRewriting[details.id] = true;
        return {redirectUrl: replacement};
      }
      return undefined;
    };
  } else {
    // Filter all incoming requests to the URLs, replacing their
    // contents with the responses we get from the replacement URLs.
    let currentlyRewriting = {};
    rewriteResponse = details => {
      if (currentlyRewriting[details.id]) {
        delete currentlyRewriting[details.id];
        return undefined;
      }

      let {type, replacement} = findReplacement(details.url);
      if (!type || replacement === undefined) {
        return undefined;
      }

      currentlyRewriting[details.id] = true;
      let filter = browser.webRequest.filterResponseData(details.requestId);
      if (type === "redirectURL") {
        filter.onstart = event => {
          let xhr = new XMLHttpRequest();
          xhr.open("GET", `${replacement}#${Date.now()}`);
          xhr.responseType = "arraybuffer";
          xhr.onerror = err => {
            let msg = browser.i18n.getMessage("bgExceptionOverridingURL", [details.url, replacement]);
            console.error(msg, err);
            filter.write(new Uint8Array(new TextEncoder("utf-8").
              encode(`${msg}\n${err.message || ""}\n${err.stack || ""}`)));
            filter.close();
          };
          xhr.onload = () => {
            if (!xhr.status || xhr.status >= 400) {
              console.error(browser.i18n.getMessage("bgFailureOverridingURL", [xhr.status, details.url, replacement]));
            } else {
              filter.write(xhr.response);
              console.info(browser.i18n.getMessage("bgOverridingURL", [details.url, replacement]));
            }
            filter.close();
          };
          xhr.send();
        };
      } else if (type === "rawText") {
        filter.onstart = event => {
          filter.write(new Uint8Array(new TextEncoder("utf-8").
            encode(replacement)));
          filter.close();
        };
      }
      return undefined;
    };
  }

  return setURLReplacements;
}());

const setRequestHeaderOverrides = (function() {
  let onlyOverride;
  let alwaysSet;
  let listening = false;

  function listener(e) {
    let requestHeaders = [];
    for (let [name, value] of Object.entries(alwaysSet)) {
      requestHeaders.push({name, value});
    }
    for (let header of e.requestHeaders) {
      let name = header.name.toLowerCase();
      if (alwaysSet[name]) {
        continue;
      } else if (name in onlyOverride) {
        requestHeaders.push({name, value: onlyOverride[name]});
      } else {
        requestHeaders.push(header);
      }
    }
    return {requestHeaders};
  }

  return function setRequestHeaderOverrides(settings) {
    onlyOverride = settings.onlyOverride || {};
    alwaysSet = settings.alwaysSet || {};
    let shouldListen = Object.keys(onlyOverride).length || Object.keys(alwaysSet).length;
    if (listening && !shouldListen) {
      listening = false;
      browser.webRequest.onBeforeSendHeaders.removeListener(listener);
    } else if (!listening && shouldListen) {
      listening = true;
      browser.webRequest.onBeforeSendHeaders.addListener(listener,
        {"urls": ["<all_urls>"]},
        ["blocking", "requestHeaders"]
      );
    }
  };
}());

