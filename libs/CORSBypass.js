/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global chrome */

const MaybeActivateCORSBypassListener = (function() {
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
    const responseHeaders = [];
    for (const header of e.responseHeaders) {
      const name = header.name.toLowerCase();
      if (name === "x-frame-options") {
        continue;
      }
      const replacement = CORS_BYPASS_OVERRIDES[name];
      if (replacement) {
        console.info(chrome.i18n.getMessage("bgBypassingCORSHeader", [name, header.value, e.url]));
        header.value = replacement;
      }
      responseHeaders.push(header);
    }
    return {responseHeaders};
  };

  return function MaybeActivateCORSBypassListener(tabConfig) {
    const shouldBeActive = tabConfig && tabConfig.CORSBypass && tabConfig.CORSBypass.enabled;
    if (CORSBypassActive && !shouldBeActive) {
      CORSBypassActive = false;
      chrome.webRequest.onHeadersReceived.removeListener(
        CORSBypassListener,
        {"urls": ["<all_urls>"]},
        ["blocking", "responseHeaders"]
      );
    } else if (!CORSBypassActive && shouldBeActive) {
      CORSBypassActive = true;
      chrome.webRequest.onHeadersReceived.addListener(
        CORSBypassListener,
        {"urls": ["<all_urls>"]},
        ["blocking", "responseHeaders"]
      );
    }
  };
}());
