/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class FunctionBindProxy {
  constructor(settings) {
    this.enabled = false;
    const me = this;

    Function.prototype.bind = function(oThis) {
      if (typeof this !== "function") {
        /* Closest thing possible to the ES5 internal IsCallable function */
        if (settings.onInvalidBindAttempted() === false) {
          return undefined;
        }
      }

      const aArgs   = Array.prototype.slice.call(arguments, 1);
      const fToBind = this;
      const fNOP    = function() {};
      const fBound  = function() {
        if (me.enabled && settings.onBoundFunctionCalled(fToBind.toString()) === false) {
          return undefined;
        }
        return fToBind.apply(this instanceof fNOP
               ? this
               : oThis,
               aArgs.concat(Array.prototype.slice.call(arguments)));
      };

      if (this.prototype) {
        /* Function.prototype doesn't have a prototype property */
        fNOP.prototype = this.prototype;
      }
      fBound.prototype = new fNOP();

      fBound._boundFunction = fToBind;
      fBound._boundArguments = aArgs;

      return fBound;
    };
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }
}
