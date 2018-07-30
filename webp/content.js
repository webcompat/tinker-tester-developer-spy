/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

(function() {
  const decodeWebP = (function() {
    let loadedPromise;

    function loadModule() {
      if (loadedPromise) {
        return loadedPromise;
      }

      const sourcePath = browser.runtime.getURL("webp/");
      loadedPromise = fetch(`${sourcePath}webp_wasm.js`).
        then(r => r.text()).
        then(js => {
          return eval(`
            (function() {
              return new Promise(resolve => {
                var Module = {
                  sourcePath: "${sourcePath}",
                  printErr: () => {},
                  postRun: () => resolve(Module),
                };
                ${js};
              });
            }())
          `);
        }).then(module => {
          return {
            module,
            decoder: module.cwrap("WebpToSDL", "number", ["array", "number"]),
          };
        });
      return loadedPromise;
    }

    return function(webpAB) {
      return loadModule().then(({module, decoder}) => {
        return new Promise(resolve => {
          module.canvas = document.createElement("canvas");
          decoder(webpAB, webpAB.length);
          module.canvas.toBlob(blob => {
            resolve(blob);
          }, "image/png");
        });
      });
    };
  }());

  browser.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (!message.decodeWebP) {
        return undefined;
      }
      decodeWebP(message.decodeWebP).then(decoded => {
        sendResponse({decoded});
      }).catch(error => {
        sendResponse({error});
      });
      return true;
    }
  );
}());
