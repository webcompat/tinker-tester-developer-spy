/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class GeolocationOverrider {
  constructor(overrider) {
    this.setTimeout = window.setTimeout;
    this.dateNow = Date.now;
    this.watchers = {};
    this.nextWatcherId = 1;
    this.overrider = overrider;
    this.override = this.overrider.register(
      "navigator.geolocation", {
        get: (navGeo, origGetter, args) => {
          if (this.geolocation) {
            return {
              getCurrentPosition: success => {
                success(this._getCoords());
              },
              clearWatch: id => {
                delete this.watchers[id];
              },
              watchPosition: success => {
                this.watchers[this.nextWatcherId] = success;
                this._updateWatcher(success);
                return this.nextWatcherId++;
              },
            };
          }
          return this.overrider.doCall(navGeo, origGetter, args);
        }
      }
    );
  }

  _getCoords() {
    return Object.assign(this.geolocation, {timestamp: this.dateNow.call()});
  }

  _updateWatcher(callback) {
    this.setTimeout.call(window, () => callback(this._getCoords()), 1);
  }

  setOptions(opts) {
    if (opts.accuracy || opts.altitude || opts.altitudeAccuracy ||
        opts.heading || opts.latitude || opts.longitude || opts.speed) {
      this.geolocation = {
        coords: {
          accuracy: parseFloat(opts.accuracy) || 1000,
          altitude: parseFloat(opts.altitude) || 0,
          altitudeAccuracy: parseFloat(opts.altitudeAccuracy) || 0,
          heading: parseFloat(opts.heading) || NaN,
          latitude: parseFloat(opts.latitude) || 0,
          longitude: parseFloat(opts.longitude) || 0,
          speed: parseFloat(opts.speed) || NaN,
        }
      };
      for (const callback of Object.values(this.watchers)) {
        this._updateWatcher(callback);
      }
    }
  }

  enable() {
    this.overrider.enable(this.override);
  }

  disable() {
    this.overrider.disable(this.override);
  }
}
