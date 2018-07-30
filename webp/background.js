/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const decodeWebP = (function() {
  // We decode WebPs on a per-network-request basis, to do the decoding
  // as seamlessly and transparently as possible. This requires blocking
  // the request while we decode the WebP. Also, since OffscreenCanvas
  // is not yet able to handle the process, we must shunt the decoding
  // off to the content script at the moment.

  function canUseOffscreenCanvas() {
    try { // currently blocked on http://bugzil.la/801176
      new OffscreenCanvas(1, 1).getContext("2d");
    } catch (_) {
      return false;
    }
    return true;
  }

  if (canUseOffscreenCanvas()) {
    const BGWorker = new Worker("webp/background_worker.js");
    return function decodeWebPusingBackgroundWorker(toDecode, details) {
      const {requestId} = details;
      return new Promise(resolve => {
        const handler = evt => {
          if (evt.data.decodedWebP && event.data.requestId === requestId) {
            window.removeEventListener("message", handler);
            resolve(evt.data.decodedWebP);
          }
        };
        window.addEventListener("message", handler);
        BGWorker.postMessage({requestId, toDecode});
      });
    };
  }

  return function decodeWebPusingContentScript(toDecode, details) {
    const {tabId, frameId} = details;
    return browser.tabs.sendMessage(
      tabId,
      {decodeWebP: toDecode},
      {frameId}
    );
  };
}());

const WebPHook = (function() {
  function advertiseWebPSupport(details) {
    for (const header of details.requestHeaders) {
      if (header.name.toLowerCase() === "accept" &&
          !header.value.includes("image/webp")) {
        header.value = `image/webp,${header.value}`;
      }
    }
    return {requestHeaders: details.requestHeaders};
  }

  function replaceIfWebP(details) {
    let hasWebpExtension = false;
    try {
      const url = new URL(details.url, details.documentURL);
      if (url.pathname.toLowerCase().endsWith(".webp")) {
        hasWebpExtension = true;
      }
    } catch (_) {
      return undefined;
    }

    let doConversion = false;
    for (const header of details.responseHeaders) {
      if (header.name.toLowerCase() === "content-type" &&
          (header.value.includes("image/webp") || hasWebpExtension)) {
        doConversion = true;
        header.value = "image/png";
      }
    }

    if (doConversion) {
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const receivedChunks = [];
      filter.ondata = event => {
        receivedChunks.push(event.data);
      };
      filter.onstop = () => {
        const blob = new Blob(receivedChunks);
        const r = new FileReader();
        r.onload = event => {
          decodeWebP(new Uint8Array(event.target.result), details).then(result => {
            if (result.error) {
              filter.close();
              console.info(browser.i18n.getMessage("bgWebPDecodingError", [details.url]), result.error);
              return;
            }
            const r = new FileReader();
            r.onload = event => {
              filter.write(event.target.result);
              console.info(browser.i18n.getMessage("bgWebPDecoded", [details.url]));
            };
            r.onabort = r.onerror = err => {
              console.info(browser.i18n.getMessage("bgWebPDecodingError", [details.url]), err);
            };
            r.onloadend = () => filter.close();
            r.readAsArrayBuffer(result.decoded);
          }).catch(err => {
            filter.close();
            console.info(browser.i18n.getMessage("bgWebPDecodingError", [details.url]), err);
          });
        };
        r.onabort = r.onerror = err => {
          filter.close();
          console.info(browser.i18n.getMessage("bgWebPDecodingError", [details.url]), err);
        },
        r.readAsArrayBuffer(blob);
      };
    }

    return {responseHeaders: details.responseHeaders};
  }

  let enabled = false;

  function enable() {
    if (enabled) {
      return;
    }
    enabled = true;

    browser.webRequest.onBeforeSendHeaders.addListener(
      advertiseWebPSupport,
      {"urls": ["<all_urls>"]},
      ["blocking", "requestHeaders"]
    );
    browser.webRequest.onHeadersReceived.addListener(
      replaceIfWebP,
      {urls: ["<all_urls>"]},
      ["blocking", "responseHeaders"]
    );
  }

  function disable() {
    if (!enabled) {
      return;
    }

    enabled = false;

    browser.webRequest.onBeforeSendHeaders.removeListener(
      advertiseWebPSupport,
      {"urls": ["<all_urls>"]},
      ["blocking", "requestHeaders"]
    );
    browser.webRequest.onHeadersReceived.removeListener(
      replaceIfWebP,
      {urls: ["<all_urls>"]},
      ["blocking", "responseHeaders"]
    );
  }

  return {
    enable,
    disable,
  };
}());
