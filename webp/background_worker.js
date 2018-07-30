/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.Module = {
  doNotCaptureKeyboard: true,
  canvas: new OffscreenCanvas(2000, 2000),
};

self.importScripts("webp_wasm.js");
const decoder = Module.cwrap("WebpToSDL", "number", ["array", "number"]);

onmessage = evt => {
  const {requestId, toDecode} = evt.data;
  const decodedWebP = decoder(toDecode, toDecode.length);
  postMessage({requestId, decodedWebP});
};
