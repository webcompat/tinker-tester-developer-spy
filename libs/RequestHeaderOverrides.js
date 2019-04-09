/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global chrome */

const SetRequestHeaderOverrides = (function() {
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

  return function SetRequestHeaderOverrides(settings = {}) {
    onlyOverride = {};
    alwaysSet = {};
    for (const [name, {type, value}] of Object.entries(settings || {})) {
      if (type === "alwaysSet") {
        alwaysSet[name.toLowerCase()] = {name, value};
      } else if (type === "onlyOverride") {
        onlyOverride[name.toLowerCase()] = {name, value};
      }
    }
    const shouldListen = Object.keys(onlyOverride).length || Object.keys(alwaysSet).length;
    if (listening && !shouldListen) {
      listening = false;
      chrome.webRequest.onBeforeSendHeaders.removeListener(listener);
    } else if (!listening && shouldListen) {
      listening = true;
      chrome.webRequest.onBeforeSendHeaders.addListener(listener,
        {"urls": ["<all_urls>"]},
        ["blocking", "requestHeaders"]
      );
    }
  };
}());
