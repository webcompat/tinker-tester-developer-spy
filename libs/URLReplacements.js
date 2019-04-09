/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, chrome */

const SetURLReplacements = (function() {
  let replacements;
  let rewriteResponse;
  let listening = false;

  function SetURLReplacements(_replacements) {
    replacements = _replacements;
    if (replacements && !listening) {
      listening = true;
      chrome.webRequest.onBeforeRequest.addListener(
        rewriteResponse,
        {urls: ["<all_urls>"]},
        ["blocking"]
      );
    } else if (!replacements && listening) {
      listening = false;
      chrome.webRequest.onBeforeRequest.removeListener(rewriteResponse);
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
  if (typeof browser === "undefined" ||
      typeof browser.webRequest.filterResponseData === "undefined") {
    const currentlyRewriting = {};
    rewriteResponse = details => {
      if (currentlyRewriting[details.requestId]) {
        delete currentlyRewriting[details.requestId];
        return undefined;
      }

      const {type, replacement} = findReplacement(details.url);
      if (type === "redirectURL" && replacement) {
        currentlyRewriting[details.requestId] = true;
        return {redirectUrl: replacement};
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
            const msg = chrome.i18n.getMessage("bgExceptionOverridingURL", [details.url, replacement]);
            console.error(msg, err);
            filter.write(new Uint8Array(new TextEncoder("utf-8").
              encode(`${msg}\n${err.message || ""}\n${err.stack || ""}`)));
            filter.close();
          };
          fetch(replacement, {cache: "no-store"}).then(response => {
            if (!response.ok) {
              console.error(chrome.i18n.getMessage("bgFailureOverridingURL", [response.status, details.url, replacement]));
              filter.close();
            } else {
              return response.arrayBuffer().then(buffer => {
                filter.write(buffer);
                filter.close();
                console.info(chrome.i18n.getMessage("bgOverridingURL", [details.url, replacement]));
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

  return SetURLReplacements;
}());
