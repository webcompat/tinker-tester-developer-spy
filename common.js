/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser */

window.ScriptOverrideHooks = {
  "ObserveXHRandFetch": {
    options: {onlyMethods: browser.i18n.getMessage("optionOnlyHTTPMethods"),
              onlyURLs: browser.i18n.getMessage("optionOnlyURLs")},
    callbacks: {onSend: browser.i18n.getMessage("callbackOnSend")},
  },
  "OverrideNetworkRequests": {
    userValues: {
      setting: browser.i18n.getMessage("optionURLRegex"),
      value: browser.i18n.getMessage("optionURLRedirect"),
      types: {
        redirectURL: {label: browser.i18n.getMessage("typeOverrideNetworkRequestRedirectURL")},
        rawText: {label: browser.i18n.getMessage("typeOverrideNetworkRequestRawText")},
      },
    },
    note: browser.i18n.getMessage("noteOverrideNetworkRequests"),
  },
  "OverrideRequestHeaders": {
    userValues: {
      setting: browser.i18n.getMessage("optionHeaderName"),
      value: browser.i18n.getMessage("optionHeaderValue"),
      types: {
        alwaysSet: {label: browser.i18n.getMessage("typeOverrideRequestHeaderAlwaysSet")},
        onlyOverride: {label: browser.i18n.getMessage("typeOverrideRequestHeaderOnlyOverride")},
      },
    },
  },
  "OverrideLanguages": {
    options: {languages: browser.i18n.getMessage("optionLanguages")},
  },
  "ElementCreation": {
    options: {names: browser.i18n.getMessage("optionElementNames")},
    callbacks: {onCreated: browser.i18n.getMessage("callbackOnCreated")},
  },
  "ElementDetection": {
    options: {selector: browser.i18n.getMessage("optionElementSelector")},
    callbacks: {onDetected: browser.i18n.getMessage("callbackOnDetected"),
                onLost: browser.i18n.getMessage("callbackOnLost")},
  },
  "EventListener": {
    options: {types: browser.i18n.getMessage("optionEventTypes"),
              selector: browser.i18n.getMessage("optionOnlyIfTargetMatches")},
    callbacks: {onAdded: browser.i18n.getMessage("callbackOnListenerAdded"),
                onRemoved: browser.i18n.getMessage("callbackOnListenerRemoved"),
                onEvent: browser.i18n.getMessage("callbackOnEventFired")},
  },
  "EventFeatures": {
    properties: [
      "window.event",
      "Event.prototype.srcElement",
      "Document.prototype.activeElement",
    ],
    methods: [
      "HTMLElement.prototype.focus",
      "HTMLElement.prototype.blur",
      "EventTarget.prototype.dispatchEvent",
      "InputEvent.prototype.preventDefault",
      "KeyboardEvent.prototype.preventDefault",
      "MouseEvent.prototype.preventDefault",
      "WheelEvent.prototype.preventDefault",
    ],
  },
  "StyleProperties": {
    options: {properties: browser.i18n.getMessage("optionStylePropertiesToMonitor"),
              selector: browser.i18n.getMessage("optionOnlyIfElementMatches"),
              onlyValues: browser.i18n.getMessage("optionOnlyIfValueMatches")},
    callbacks: {onGet: browser.i18n.getMessage("callbackOnGet"),
                onSet: browser.i18n.getMessage("callbackOnSet")},
  },
  "DetectUAChecks": {
    properties: [
      "navigator.userAgent",
      "navigator.appVersion",
      "navigator.vendor",
      "navigator.platform",
      "navigator.oscpu",
      "navigator.buildID",
      "navigator.language",
      "navigator.languages",
      "window.components",
    ]
  },
  "UserAgentOverrides": {
    overrides: {
      "uaChromeAndroidTablet": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Mobile Safari/537.36",
        },
        "script": {
          "navigator.appVersion": "5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Mobile Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Mobile Safari/537.36",
          "navigator.oscpu": null,
          "navigator.platform": "Linux armv7l",
          "navigator.mimeTypes": [],
          "navigator.plugins": [],
          "navigator.productSub": "20030107",
          "navigator.vendor": "Google Inc.",
        },
      },
      "uaChromeLinux": {
        "script": {
          "navigator.appVersion": "5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Safari/537.36",
          "navigator.vendor": "Google Inc.",
        },
      },
      "uaFirefoxAndroidTablet": {
        "script": {
          "navigator.userAgent": "Mozilla/5.0 (Android 7.0; Tablet; rv:57.0) Gecko/57.0 Firefox/57.0",
        },
      },
      "uaFirefoxAndroidPhone": {
        "script": {
          "navigator.userAgent": "Mozilla/5.0 (Android 7.0; Mobile; rv:57.0) Gecko/57.0 Firefox/57.0",
        },
      },
      "uaSafariOSX": {
        "script": {
          "navigator.userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8",
        },
      },
    },
  },
  "Scrolling": {
    properties: [
      "WheelEvent.prototype.deltaY",
      "WheelEvent.prototype.deltaX",
      "window.pageXOffset",
      "window.pageYOffset",
      "document.documentElement.scrollLeft",
      "document.documentElement.scrollTop",
      "document.body.scrollLeft",
      "document.body.scrollTop",
      "Document.prototype.scrollingElement",
      "Element.prototype.scrollLeft",
      "Element.prototype.scrollLeftMin",
      "Element.prototype.scrollLeftMax",
      "Element.prototype.scrollTop",
      "Element.prototype.scrollTopMin",
      "Element.prototype.scrollTopMax",
      "Element.prototype.scrollWidth",
      "Element.prototype.scrollHeight",
    ],
    methods: [
      "window.scroll",
      "window.scrollBy",
      "window.scrollTo",
      "Element.prototype.scrollIntoView",
      "Element.prototype.scroll",
      "Element.prototype.scrollTo",
      "Element.prototype.scrollBy",
      "Element.prototype.scrollByNoFlush",
    ]
  },
  "DocumentWrite": {
    methods: [
      "document.write",
      "document.writeln",
    ]
  },
  "InputsAndLinks": {
    properties: [
      "HTMLInputElement.prototype.checked",
      "HTMLAnchorElement.prototype.href",
    ],
    methods: [
      "HTMLAnchorElement.prototype.click",
    ]
  },
  "MediaElements": {
    methods: [
      "HTMLVideoElement.prototype.pause",
      "HTMLVideoElement.prototype.play",
      "HTMLAudioElement.prototype.pause",
      "HTMLAudioElement.prototype.play",
      "window.Audio",
    ],
    properties: [
      "HTMLAudioElement.prototype.src",
      "HTMLVideoElement.prototype.src",
    ]
  },
  "Scheduling": {
    methods: [
      "window.setTimeout",
      "window.setInterval",
      "window.requestAnimationFrame",
      "window.setImmediate",
      "window.clearTimeout",
      "window.clearInterval",
      "window.clearImmediate",
    ]
  },
  "ShadowDOM": {
    methods: [
      "Element.prototype.createShadowRoot",
      "Element.prototype.attachShadow",
      "Element.prototype.detachShadow",
    ]
  },
  "Geolocation": {
    options: {
      latitude: browser.i18n.getMessage("optionGeolocationLatitude"),
      longitude: browser.i18n.getMessage("optionGeolocationLongitude"),
      accuracy: browser.i18n.getMessage("optionGeolocationAccuracy"),
      altitude: browser.i18n.getMessage("optionGeolocationAltitude"),
      altitudeAccuracy: browser.i18n.getMessage("optionGeolocationAltitudeAccuracy"),
      heading: browser.i18n.getMessage("optionGeolocationHeading"),
      speed: browser.i18n.getMessage("optionGeolocationSpeed"),
    },
  },
  "FunctionBind": {
    type: "checkbox",
  },
  "CORSBypass": {
    type: "checkbox",
  },
};

