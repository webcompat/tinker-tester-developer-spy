/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser */

const SetContentScripts = (function() {
  let currentContentScript;
  let currentlySetting = Promise.resolve();

  return async function(scripts) {
    await currentlySetting;

    if (currentContentScript) {
      await currentContentScript.unregister();
      currentContentScript = undefined;
    }

    currentlySetting = new Promise(async resolve => {
      currentContentScript = await browser.contentScripts.register({
        js: scripts,
        matches: ["<all_urls>"],
        runAt: "document_start",
        allFrames: true,
      });
      resolve();
    });
    await currentlySetting;
  };
}());
