/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser */

window.UnsafeContentScriptEvalsBlockReports = true;

window.ScriptOverrideHooks = {
  "ObserveXHRandFetch": {
    options: {onlyMethods: browser.i18n.getMessage("optionOnlyHTTPMethods"),
              onlyURLs: browser.i18n.getMessage("optionOnlyURLs")},
    callbacks: {onSend: browser.i18n.getMessage("callbackOnSend")},
    flags: {syncXHRPolyfix: browser.i18n.getMessage("flagSyncXHRPolyfix")},
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
    callbacks: {
      onAdded: {
        allowIgnore: true,
        label: browser.i18n.getMessage("callbackOnListenerAdded"),
      },
      onRemoved: {
        allowIgnore: true,
        label: browser.i18n.getMessage("callbackOnListenerRemoved"),
      },
      onEvent: {
        allowIgnore: true,
        label: browser.i18n.getMessage("callbackOnEventFired"),
      },
    },
  },
  "EventFeatures": {
    properties: [
      "window.event",
      "Event.prototype.srcElement",
      "Event.prototype.cancelBubble",
      "Event.prototype.deepPath",
      "Event.prototype.returnValue",
      "Document.prototype.activeElement",
    ],
    methods: [
      "HTMLElement.prototype.blur",
      "HTMLElement.prototype.focus",
      "EventTarget.prototype.dispatchEvent",
      "Event.prototype.composedPath",
      "Event.prototype.preventDefault",
      "Event.prototype.stopPropagation",
      "Event.prototype.stopImmediatePropagation",
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
      "uaChromeAndroidPhone": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G935W8 Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
        },
        "script": {
          "navigator.appVersion": "5.0 (Linux; Android 8.0.0; SM-G935W8 Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G935W8 Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.buildID": undefined,
          "navigator.doNotTrack": null,
          "navigator.oscpu": undefined,
          "navigator.platform": "Linux armv8l",
          "navigator.mimeTypes": [],
          "navigator.plugins": [],
          "navigator.productSub": "20030107",
          "navigator.vendor": "Google Inc.",
        },
        "polyfills": [
          "WebP",
        ]
      },
      "uaChromeAndroidTablet": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Linux; Android 8.0.0; Nexus 10 Build/JWR66Y) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
        },
        "script": {
          "navigator.appVersion": "5.0 (Linux; Android 8.0.0; Nexus 10 Build/JWR66Y) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (Linux; Android 8.0.0; Nexus 10 Build/JWR66Y) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.buildID": undefined,
          "navigator.doNotTrack": null,
          "navigator.oscpu": undefined,
          "navigator.platform": "Linux armv8l",
          "navigator.mimeTypes": [],
          "navigator.plugins": [],
          "navigator.productSub": "20030107",
          "navigator.vendor": "Google Inc.",
        },
        "polyfills": [
          "WebP",
        ]
      },
      "uaChromeLinux": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
        },
        "script": {
          "navigator.appVersion": "5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.buildID": undefined,
          "navigator.doNotTrack": null,
          "navigator.oscpu": undefined,
          "navigator.platform": "Linux x86_64",
          "navigator.productSub": "20030107",
          "navigator.vendor": "Google Inc.",
        },
        "polyfills": [
          "WebP",
        ]
      },
      "uaChromeOSX": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
        },
        "script": {
          "navigator.appVersion": "5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.buildID": undefined,
          "navigator.doNotTrack": null,
          "navigator.oscpu": undefined,
          "navigator.platform": "MacIntel",
          "navigator.productSub": "20030107",
          "navigator.vendor": "Google Inc.",
        },
        "polyfills": [
          "WebP",
        ]
      },
      "uaChromeWindows": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
        },
        "script": {
          "navigator.appVersion": "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          "navigator.buildID": undefined,
          "navigator.doNotTrack": null,
          "navigator.oscpu": undefined,
          "navigator.platform": "Win32",
          "navigator.productSub": "20030107",
          "navigator.vendor": "Google Inc.",
        },
        "polyfills": [
          "WebP",
        ]
      },
      "uaEdge": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134",
        },
        "script": {
          "navigator.appVersion": "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134",
          "navigator.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134",
          "navigator.msManipulationViewsEnabled": false,
          "navigator.buildID": undefined,
          "navigator.credentials": undefined,
          "navigator.doNotTrack": null,
          "navigator.storage": undefined,
          "navigator.oscpu": undefined,
          "navigator.platform": "Win32",
          "navigator.productSub": "20030107",
          "navigator.vendor": "",
        },
      },
      "uaFirefoxAndroidTablet": {
        "headers": {
          "User-Agent": "Mozilla/5.0 (Android 8.0.0; Tablet; rv:61.0) Gecko/61.0 Firefox/61.0",
        },
        "script": {
          "navigator.appVersion": "5.0 (Android 8.0.0)",
          "navigator.userAgent": "Mozilla/5.0 (Android 8.0.0; Tablet; rv:61.0) Gecko/61.0 Firefox/61.0",
          "navigator.buildID": "20180621125625",
          "navigator.oscpu": "Linux armv8l",
          "navigator.mimeTypes": [],
          "navigator.plugins": [],
          "navigator.platform": "Linux armv8l",
        },
      },
      "uaFirefoxAndroidPhone": {
        "headers": {
          "User-Agent": "Mozilla/5.0 (Android 8.0.0; Mobile; rv:61.0) Gecko/61.0 Firefox/61.0",
        },
        "script": {
          "navigator.appVersion": "5.0 (Android 8.0.0)",
          "navigator.userAgent": "Mozilla/5.0 (Android 8.0.0; Mobile; rv:61.0) Gecko/61.0 Firefox/61.0",
          "navigator.buildID": "20180621125625",
          "navigator.oscpu": "Linux armv8l",
          "navigator.mimeTypes": [],
          "navigator.plugins": [],
          "navigator.platform": "Linux armv8l",
        },
      },
      "uaSafariOSX": {
        "headers": {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15",
        },
        "script": {
          "navigator.appVersion": "5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15",
          "navigator.userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15",
          "navigator.buildID": undefined,
          "navigator.credentials": undefined,
          "navigator.doNotTrack": null,
          "navigator.hardwareConcurrency": undefined,
          "navigator.maxTouchPoints": undefined,
          "navigator.serviceWorker": undefined,
          "navigator.storage": undefined,
          "navigator.oscpu": undefined,
          "navigator.platform": "MacIntel",
          "navigator.productSub": "20030107",
          "navigator.vendor": "Apple Computer, Inc.",
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
  "History": {
    properties: [
      "history.length",
      "history.state",
      "history.scrollRestoration",
    ],
    methods: [
      "history.back",
      "history.forward",
      "history.go",
      "history.pushState",
      "history.replaceState",
    ]
  },
  "InputsAndLinks": {
    properties: [
      "HTMLInputElement.prototype.checked",
      "HTMLAnchorElement.prototype.href",
    ],
    methods: [
      "HTMLElement.prototype.click",
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
  "WebP": {
    type: "checkbox",
  },
  "DisableDebugger": {
    type: "checkbox",
  },
  "FunctionBind": {
    type: "checkbox",
  },
  "CORSBypass": {
    type: "checkbox",
  },
};

function matchRegex(str) {
  const isRE = str.match(/^\/(.*)\/([gimuy]*)$/);
  if (isRE) {
    try {
      const RE = new RegExp(isRE[1], isRE[2]);
      return {
        match: str => str.match(RE),
        replace: (str, rep) => str.replace(RE, rep),
      };
    } catch (_) { }
  }
  return undefined;
}

function getCommaSeparatedList(str) {
  const vals = str || "";
  if (vals) {
    return vals.split(",").map(v => v.trim());
  }
  return [];
}

function matchCommaSeparatedList(str) {
  const vals = getCommaSeparatedList(str);
  return {
    match: str => vals.includes(str),
    replace: (str, rep) => rep,
  };
}

function matchString(str) {
  return {
    match: str2 => str === str2,
    replace: (str, rep) => rep,
  };
}
