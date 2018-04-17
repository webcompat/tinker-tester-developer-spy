/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser */

var ScriptOverrideHooks = {
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
        redirectURL: {label: "Redirect URL", type: "url"},
        rawText: {label: "Raw Text", type: "text"},
      },
    },
    note: browser.i18n.getMessage("noteOverrideNetworkRequests"),
  },
  "ListenForElementCreation": {
    options: {names: browser.i18n.getMessage("optionElementNames")},
    callbacks: {onCreated: browser.i18n.getMessage("callbackOnCreated")},
  },
  "ListenForEvents": {
    options: {types: browser.i18n.getMessage("optionEventTypes"),
              selector: browser.i18n.getMessage("optionOnlyIfTargetMatches")},
    callbacks: {onAdded: browser.i18n.getMessage("callbackOnListenerAdded"),
                onRemoved: browser.i18n.getMessage("callbackOnListenerRemoved"),
                onEvent: browser.i18n.getMessage("callbackOnEventFired")},
    properties: [
      "window.event",
      "Event.prototype.srcElement",
    ],
    methods: [
      "EventTarget.prototype.dispatchEvent",
      "InputEvent.prototype.preventDefault",
      "KeyboardEvent.prototype.preventDefault",
      "MouseEvent.prototype.preventDefault",
      "WheelEvent.prototype.preventDefault",
    ],
  },
  "ListenForStyleProperties": {
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
        "navigator.appVersion": "5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Mobile Safari/537.36",
        "navigator.userAgent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Mobile Safari/537.36",
        "navigator.platform": "Linux armv7l",
        "navigator.mimeTypes": [],
        "navigator.plugins": [],
      },
      "uaChromeLinux": {
        "navigator.appVersion": "5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Safari/537.36",
        "navigator.userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Safari/537.36",
        "navigator.vendor": "Google Inc.",
      },
      "uaFirefoxAndroidTablet": {
        "navigator.userAgent": "Mozilla/5.0 (Android 7.0; Tablet; rv:57.0) Gecko/57.0 Firefox/57.0",
      },
      "uaFirefoxAndroidPhone": {
        "navigator.userAgent": "Mozilla/5.0 (Android 7.0; Mobile; rv:57.0) Gecko/57.0 Firefox/57.0",
      },
      "uaSafariOSX": {
        "navigator.userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8",
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
  "InputsLinks": {
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
  "TimeoutsRAF": {
    methods: [
      "window.setTimeout",
      "window.setInterval",
      "window.requestAnimationFrame",
      "window.setImmediate",
    ]
  },
  "ShadowDOM": {
    methods: [
      "Element.prototype.createShadowRoot",
      "Element.prototype.attachShadow",
      "Element.prototype.detachShadow",
    ]
  },
  "FunctionBindLogging": {
    type: "checkbox",
  },
  "CORSBypass": {
    type: "checkbox",
  },
};

