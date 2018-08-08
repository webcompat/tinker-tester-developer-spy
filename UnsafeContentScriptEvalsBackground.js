/* this source code form is subject to the terms of the mozilla public
 * license, v. 2.0. if a copy of the mpl was not distributed with this
 * file, you can obtain one at http://mozilla.org/mpl/2.0/. */

"use strict";

/* global browser */

const ContentScriptURL = new URL(document.currentScript.src).
                           pathname.replace("Background", "Content");

const SecureAllowEvalsToken = crypto.getRandomValues(new Uint32Array(4)).join("");

const UnsafeContentScriptEvals = (function() {
  "use strict";

  const ScriptSrcAllowsEval = new RegExp("script-src[^;]*'unsafe-eval'", "i");
  const DefaultSrcAllowsEval = new RegExp("default-src[^;]*'unsafe-eval'", "i");
  const DefaultSrcGetRE = new RegExp("default-src([^;]*)", "i");

  const ActiveConfigContentScripts = {};

  async function unregisterConfigContentScript(url) {
    const cs = ActiveConfigContentScripts[url];
    if (cs) {
      try {
        await cs.unregister();
      } catch (e) {}
      delete ActiveConfigContentScripts[url];
    }
  }

  function messageHandler(msg, sender, sendResponse) {
    const url = msg.unregisterFor;
    if (url) {
      unregisterConfigContentScript(url);
    }
  }

  async function headerHandler(details) {
    const {url} = details;

    let CSP;
    for (const header of details.responseHeaders) {
      const name = header.name.toLowerCase();
      if (name === "content-security-policy") {
        let effectiveDirective;
        const originalValue = header.value;
        if (header.value.includes("script-src ")) {
          if (!header.value.match(ScriptSrcAllowsEval)) {
            effectiveDirective = "script-src";
            header.value = header.value.
              replace("script-src", "script-src 'unsafe-eval'");
          }
        } else if (header.value.includes("default-src") &&
                   !header.value.match(DefaultSrcAllowsEval)) {
          effectiveDirective = "default-src";
          const defaultSrcs = header.value.match(DefaultSrcGetRE)[1];
          header.value = header.value.replace("default-src",
            `script-src 'unsafe-eval' ${defaultSrcs}; default-src`);
        }
        if (effectiveDirective) {
          CSP = {
            violatedDirective: effectiveDirective,
            effectiveDirective,
            disposition: "enforce",
            originalPolicy: originalValue,
            documentURI: url,
          };
        }
      }
    }

    if (CSP) {
      // Ideally, we would just do a browser.tabs.executeScript here for just
      // the frame running at document_start, but that doesn't work (it runs
      // far too late). However, using contentScripts.register does run early
      // enough, so we use that instead (and make sure it only runs for the
      // webRequest's URL, and is deactivated as soon as the content script
      // uses window.eval to setup the page script).
      await unregisterConfigContentScript(url);
      const code = `BlockUnsafeEvals(${JSON.stringify(url)},
                                     ${JSON.stringify(CSP)},
                                     ${JSON.stringify(SecureAllowEvalsToken)})`;
      ActiveConfigContentScripts[url] = await browser.contentScripts.register({
        allFrames: true,
        matches: [url],
        js: [{file: ContentScriptURL}, {code}],
        runAt: "document_start",
      });
    }

    return {responseHeaders: details.responseHeaders};
  }

  let Filters;

  function allow(filters = {urls: ["<all_urls>"]}) {
    if (Filters) {
      useCSPDefaults();
    }

    filters.types = ["main_frame", "sub_frame"];
    Filters = filters;

    browser.runtime.onMessage.addListener(messageHandler);

    browser.webRequest.onHeadersReceived.addListener(
      headerHandler,
      Filters,
      ["blocking", "responseHeaders"]
    );

    return SecureAllowEvalsToken;
  }

  function useCSPDefaults() {
    if (Filters) {
      browser.runtime.onMessage.removeListener(messageHandler);

      browser.webRequest.onHeadersReceived.removeListener(
        headerHandler,
        Filters,
        ["blocking", "responseHeaders"]
      );

      Filters = undefined;
    }
  }

  return {
    allow,
    useCSPDefaults,
  };
}());
