/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, UnsafeContentScriptEvals */

function checkIfActiveOnThisTab(tabConfig) {
  let active = false;
  for (const setting of Object.values(tabConfig || {})) {
    if (setting.enabled) {
      active = true;
      break;
    }
  }

  if (browser.browserAction.setIcon) {
    const path = active ? "icons/active.svg" : "icons/inactive.svg";
    browser.browserAction.setIcon({path});
  }

  return active;
}

const AllowEvalsToken = UnsafeContentScriptEvals.allow();

const setContentScript = (function() {
  if (!browser.contentScripts) {
    return async function() {};
  }

  let currentContentScript;

  return async function setContentScript(_config = {}, alsoRunNow = false) {
    if (currentContentScript) {
      await currentContentScript.unregister();
      currentContentScript = undefined;
    }

    const config = Object.assign(_config, {AllowEvalsToken, apiKey: AllowEvalsToken});

    const scripts = [{file: "common.js"},
                     {code: `window.Config = ${JSON.stringify(config)};`},
                     {file: "content.js"}];

    currentContentScript = await browser.contentScripts.register({
      js: scripts,
      matches: ["<all_urls>"],
      runAt: "document_start",
      allFrames: true,
    });

    if (alsoRunNow) {
      browser.tabs.query({active: true, currentWindow: true}).then(async activeTabs => {
        for (const tab of activeTabs) {
          if (!tab.url.startsWith("about:")) {
            for (const scriptOptions of scripts) {
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

const maybeActivateCORSBypassListener = (function() {
  let CORSBypassActive = false;

  const CORS_BYPASS_OVERRIDES = {
    "access-control-allow-origin": "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "CONNECT, DELETE, GET, HEAD, OPTIONS, POST, PUT",
    "content-security-policy": "upgrade-insecure-requests",
    "content-security-policy-report-only": "upgrade-insecure-requests",
    "child-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "connect-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "default-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "font-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "frame-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "img-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "manifest-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "media-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "object-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "prefetch-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "script-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "style-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
    "worker-src": "default-src * 'unsafe-inline' 'unsafe-eval'",
  };

  const CORSBypassListener = e => {
    for (const header of e.responseHeaders) {
      const name = header.name.toLowerCase();
      const replacement = CORS_BYPASS_OVERRIDES[name];
      if (replacement) {
        console.info(browser.i18n.getMessage("bgBypassingCORSHeader", [name, header.value, e.url]));
        header.value = replacement;
      }
    }
    return {responseHeaders: e.responseHeaders};
  };

  return function maybeActivateCORSBypassListener(tabConfig) {
    const shouldBeActive = tabConfig && tabConfig.CORSBypass && tabConfig.CORSBypass.enabled;
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
  let listening = false;

  function setURLReplacements(_replacements) {
    replacements = _replacements;
    if (replacements && !listening) {
      listening = true;
      browser.webRequest.onBeforeRequest.addListener(
        rewriteResponse,
        {urls: ["<all_urls>"]},
        ["blocking"]
      );
    } else if (!replacements && listening) {
      listening = false;
      browser.webRequest.onBeforeRequest.removeListener(rewriteResponse);
    }
  }

  function findReplacement(url) {
    for (const replacement of replacements) {
      const matcher = replacement.matcher;
      if (matcher.match(url)) {
        return {
          replacement: matcher.replace(url, replacement.replacement),
          type: replacement.type,
        };
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
    const currentlyRewriting = {};
    rewriteResponse = details => {
      if (currentlyRewriting[details.requestId]) {
        delete currentlyRewriting[details.requestId];
        return undefined;
      }

      const {type, redirectUrl} = findReplacement(details.url);
      if (type === "redirectURL" && redirectUrl) {
        currentlyRewriting[details.requestId] = true;
        return {redirectUrl};
      }
      return undefined;
    };
  } else {
    // Filter all incoming requests to the URLs, replacing their
    // contents with the responses we get from the replacement URLs.
    const currentlyRewriting = {};
    rewriteResponse = details => {
      if (currentlyRewriting[details.requestId]) {
        delete currentlyRewriting[details.requestId];
        return undefined;
      }

      const {type, replacement} = findReplacement(details.url);
      if (!type || replacement === undefined) {
        return undefined;
      }

      currentlyRewriting[details.requestId] = true;
      const filter = browser.webRequest.filterResponseData(details.requestId);
      if (type === "redirectURL") {
        filter.onstart = event => {
          const onerror = err => {
            const msg = browser.i18n.getMessage("bgExceptionOverridingURL", [details.url, replacement]);
            console.error(msg, err);
            filter.write(new Uint8Array(new TextEncoder("utf-8").
              encode(`${msg}\n${err.message || ""}\n${err.stack || ""}`)));
            filter.close();
          };
          fetch(replacement, {cache: "no-store"}).then(response => {
            if (!response.ok) {
              console.error(browser.i18n.getMessage("bgFailureOverridingURL", [response.status, details.url, replacement]));
              filter.close();
            } else {
              return response.arrayBuffer().then(buffer => {
                filter.write(buffer);
                filter.close();
                console.info(browser.i18n.getMessage("bgOverridingURL", [details.url, replacement]));
              }).catch(onerror);
            }
            return undefined;
          }).catch(onerror);
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
    const requestHeaders = [];
    for (const header of Object.values(alwaysSet)) {
      requestHeaders.push(header);
    }
    for (const header of e.requestHeaders) {
      const name = header.name.toLowerCase();
      if (alwaysSet[name]) {
        continue;
      } else if (name in onlyOverride) {
        requestHeaders.push(onlyOverride[name]);
      } else {
        requestHeaders.push(header);
      }
    }
    return {requestHeaders};
  }

  return function setRequestHeaderOverrides(settings = {}) {
    onlyOverride = {};
    for (const [name, value] of Object.entries(settings.onlyOverride || {})) {
      onlyOverride[name.toLowerCase()] = {name, value};
    }
    alwaysSet = {};
    for (const [name, value] of Object.entries(settings.alwaysSet || {})) {
      alwaysSet[name.toLowerCase()] = {name, value};
    }
    const shouldListen = Object.keys(onlyOverride).length || Object.keys(alwaysSet).length;
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

