/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class UserAgentOverrider {
  constructor(overrider, mockObjects, defaultUAString) {
    this.overrider = overrider;
    this.mockObjects = mockObjects;
    this.activeOverrides = [];
    this.activeUA = undefined;
    this.defaultUAString = defaultUAString;
  }

  spoofWindowAs(ua, spoofOnlyUserAgentString = false) {
    if (this.activeOverrides && this.activeOverrides.length) {
      for (const id of this.activeOverrides) {
        this.overrider.unregister(id);
      }
      const config = UserAgentOverrider.getUAConfig(this.activeUA);
      for (const [name, enabled] of Object.entries(config.mocks || {})) {
        if (enabled) {
          this.mockObjects.disable(name);
        }
      }
    }

    this.activeOverrides = [];
    this.activeUA = undefined;

    const config = UserAgentOverrider.getUAConfig(ua);
    if (!ua || !config) {
      if (spoofOnlyUserAgentString) {
        /* If we spoof the User-Agent HTTP header, navigator.userAgent will
           also be spoofed. We can undo that here. */
        this.doOverride("navigator.__proto__.userAgent", this.defaultUAString);
      }
      return;
    }

    if (config.mocks && !spoofOnlyUserAgentString) {
      for (const [name, enabled] of Object.entries(config.mocks)) {
        if (enabled) {
          const state = config.mockState && config.mockState[name] || undefined;
          this.mockObjects.enableIfNoNativeSupport(name, state);
        }
      }
    }
    if (spoofOnlyUserAgentString) {
      const override = config.overrides["navigator.__proto__.userAgent"];
      if (override) {
        this.doOverride("navigator.__proto__.userAgent", override);
      }
    } else {
      for (const [prop, override] of Object.entries(config.overrides || {})) {
        this.doOverride(prop, override);
      }
    }

    this.activeUA = ua;
  }

  doOverride(prop, override) {
    let config = {};
    if (override === undefined) {
      config = undefined;
    } else if (override && (override.get || override.set)) {
      config = override;
    } else {
      config.get = (thisObj, origGetter, args) => {
        return override;
      };
    }

    try {
      const id = this.overrider.register(prop, config);
      this.overrider.enable(id);
      this.activeOverrides.push(id);
    } catch (_) {} /* We cannot override? Oh well... */
  }

  static getUAList() {
    return Object.keys(UserAgentOverrider.getUAConfig());
  }

  static getUAConfig(ua) {
    if (!UserAgentOverrider.Config) {
      const IgnoredOnEventHandler = function() {
        let value;
        return {
          get: () => value,
          set: v => { value = v; },
        };
      };

      const FlashPlugin = navigator.plugins["Shockwave Flash"];
      const CommonMimeTypes = [];
      const CommonPlugins = [];
      if (FlashPlugin) {
        CommonPlugins.push(FlashPlugin);
        CommonPlugins["Shockwave Flash"] = FlashPlugin;
        const Splash = "application/futuresplash";
        const Flash = "application/x-shockwave-flash";
        const SplashMT = navigator.mimeTypes[Splash];
        const FlashMT = navigator.mimeTypes[Flash];
        CommonMimeTypes[Splash] = SplashMT;
        CommonMimeTypes[Flash] = FlashMT;
        CommonMimeTypes.push(SplashMT);
        CommonMimeTypes.push(FlashMT);
      }

      const HideTouchSupportOverrides = {
        "window.Touch": undefined,
        "window.TouchEvent": undefined,
        "window.TouchList": undefined,
        "window.ontouchcancel": undefined,
        "window.ontouchend": undefined,
        "window.ontouchmove": undefined,
        "window.ontouchstart": undefined,
      };

      const HidePointerSupportOverrides = {
        "window.PointerEvent": undefined,
        "window.ongotpointercapture": undefined,
        "window.onlostpointercapture": undefined,
        "window.onpointercancel": undefined,
        "window.onpointerdown": undefined,
        "window.onpointerenter": undefined,
        "window.onpointerleave": undefined,
        "window.onpointermove": undefined,
        "window.onpointerout": undefined,
        "window.onpointerover": undefined,
        "window.onpointerup": undefined,
      };

      const HideOrientationSupportOverrides = {
        "window.onorientationchange": undefined,
        "window.orientation": undefined,
      };

      const HideChromeOnlyOverrides = {
        "navigator.__proto__.getBattery": undefined,
        "window.__proto__.BatteryManager": undefined,
        "navigator.__proto__.deviceMemory": undefined,
        "navigator.__proto__.requestMIDIAccess": undefined,
        "navigator.__proto__.mediaSession": undefined,
        "navigator.__proto__.locks": undefined,
        "navigator.__proto__.keyboard": undefined,
        "window.__proto__.Keyboard": undefined,
        "window.__proto__.KeyboardLayoutMap": undefined,
        "window.__proto__.LockManager": undefined,
        "window.__proto__.Lock": undefined,
        "window.__proto__.MediaSession": undefined,
        "window.__proto__.MediaMetadata": undefined,
        "window.__proto__.MIDIAccess": undefined,
        "window.__proto__.MIDIConnectionEvent": undefined,
        "window.__proto__.MIDIInput": undefined,
        "window.__proto__.MIDIInputMap": undefined,
        "window.__proto__.MIDIOutput": undefined,
        "window.__proto__.MIDIOutputMap": undefined,
        "window.__proto__.MIDIPort": undefined,
        "navigator.__proto__.connection": undefined,
        "window.__proto__.NetworkInformation": undefined,
        "navigator.__proto__.presentation": undefined,
        "window.__proto__.Presentation": undefined,
        "window.__proto__.PresentationAvailability": undefined,
        "window.__proto__.PresentationConnection": undefined,
        "window.__proto__.PresentationConnectiondAvailableEvent": undefined,
        "window.__proto__.PresentationConnectionCloseEvent": undefined,
        "window.__proto__.PresentationConnectionList": undefined,
        "window.__proto__.PresentationReceiver": undefined,
        "window.__proto__.PresentationRequest": undefined,
        "navigator.__proto__.usb": undefined,
        "window.__proto__.USB": undefined,
        "window.__proto__.USBAlternateInterface": undefined,
        "window.__proto__.USBConfiguration": undefined,
        "window.__proto__.USBConnectionEvent": undefined,
        "window.__proto__.USBDevice": undefined,
        "window.__proto__.USBEndpoint": undefined,
        "window.__proto__.USBInTransferResult": undefined,
        "window.__proto__.USBInterface": undefined,
        "window.__proto__.USBIsochronousInTransferPacket": undefined,
        "window.__proto__.USBIsochronousInTransferResult": undefined,
        "window.__proto__.USBIsochronousOutTransferPacket": undefined,
        "window.__proto__.USBIsochronousOutTransferResult": undefined,
        "window.__proto__.USBOutTransferResult": undefined,
        "navigator.__proto__.userActivation": undefined,
        "window.__proto__.UserActivation": undefined,
        "navigator.__proto__.getUserMedia": undefined,
        "navigator.__proto__.webkitGetUserMedia": undefined,
        "navigator.__proto__.webkitPersistentStorage": undefined,
        "navigator.__proto__.webkitTemporaryStorage": undefined,
        "window.__proto__.PERSISTENT": undefined,
        "window.__proto__.TEMPORARY": undefined,
        "window.__proto__.chrome": undefined,
        "window.__proto__.clientInformation": undefined,
        "window.__proto__.defaultStatus": undefined,
        "window.__proto__.defaultstatus": undefined,
        "window.__proto__.onappinstalled": undefined,
        "window.__proto__.onbeforeinstallprompt": undefined,
        "window.__proto__.oncancel": undefined,
        "window.__proto__.ondeviceorientationabsolute": undefined,
        "window.__proto__.onmousewheel": undefined,
        "window.__proto__.onrejectionhandled": undefined,
        "window.__proto__.onsearch": undefined,
        "window.__proto__.onselectionchange": undefined,
        "window.__proto__.onunhandledrejection": undefined,
        "window.__proto__.openDatabase": undefined,
        "window.__proto__.styleMedia": undefined,
        "window.__proto__.visualViewport": undefined,
        "window.__proto__.webkitRequestFileSystem": undefined,
        "window.__proto__.webkitResolveLocalFileSystemURL": undefined,
        "window.__proto__.webkitStorageInfo": undefined,
      };

      const HideChromeAndWebKitCommonOverrides = {
        "window.__proto__.oncuechange": undefined,
        "window.__proto__.onlanguagechange": undefined,
        "window.__proto__.queueMicrotask": undefined,
        "window.WebKitAnimationEvent": undefined,
        "window.WebKitTransitionEvent": undefined,
        "window.WebKitMutationObserver": undefined,
        "window.webkitRequestAnimationFrame": undefined,
        "window.webkitURL": undefined,
      };

      const HideFirefoxOnlyOverrides = {
        "navigator.__proto__.mozGetUserMedia": undefined,
        "navigator.__proto__.oscpu": undefined,
        "navigator.__proto__.taintEnabled": undefined,
        "navigator.__proto__.webdriver": undefined,
        "window.SpeechSynthesisVoice": undefined,
        "window.__proto__.InstallTrigger": undefined,
        "window.__proto__.dump": undefined,
        "window.__proto__.getDefaultComputedStyle": undefined,
        "window.__proto__.fullScreen": undefined,
        "window.__proto__.mozInnerScreenX": undefined,
        "window.__proto__.mozInnerScreenY": undefined,
        "window.__proto__.onabsolutedeviceorientation": undefined,
        "window.__proto__.onanimationcancel": undefined,
        "window.__proto__.ondeviceproximity": undefined,
        "window.__proto__.ondragexit": undefined,
        "window.__proto__.onloadend": undefined,
        "window.__proto__.onmozfullscreenchange": undefined,
        "window.__proto__.onmozfullscreenerror": undefined,
        "window.__proto__.onshow": undefined,
        "window.__proto__.ontransitioncancel": undefined,
        "window.__proto__.ontransitionrun": undefined,
        "window.__proto__.ontransitionstart": undefined,
        "window.__proto__.onuserproximity": undefined,
        "window.__proto__.scrollByLines": undefined,
        "window.__proto__.scrollByPages": undefined,
        "window.__proto__.scrollMaxX": undefined,
        "window.__proto__.scrollMaxY": undefined,
        "window.__proto__.setResizable": undefined,
        "window.__proto__.sidebar": undefined,
        "window.__proto__.sizeToContent": undefined,
        "window.__proto__.updateCommands": undefined,
      };

      const ChromeAndWebKitCommonOverrides = {
        "window.__proto__.oncuechange": IgnoredOnEventHandler(),
        "window.__proto__.onlanguagechange": IgnoredOnEventHandler(),
        "window.__proto__.onrejectionhandled": IgnoredOnEventHandler(),
        "window.__proto__.queueMicrotask": function(c) { Promise.resolve().then(c); },
        "window.__proto__.onunhandledrejection": IgnoredOnEventHandler(),
        "window.webkitCancelAnimationFrame": window.webkitCancelAnimationFrame || window.cancelAnimationFrame,
        "window.WebKitMutationObserver": window.WebKitMutationObserver || window.MutationObserver,
        "window.webkitRequestAnimationFrame": window.webkitRequestAnimationFrame || window.requestAnimationFrame,
        "window.webkitURL": window.webkitURL || window.URL,
      };

      const ChromeCommonOverrides = Object.assign({
        "navigator.__proto__.buildID": undefined,
        "navigator.__proto__.doNotTrack": null,
        "navigator.__proto__.mimeTypes": CommonMimeTypes,
        "navigator.__proto__.plugins": CommonPlugins,
        "navigator.__proto__.productSub": "20030107",
        "navigator.__proto__.vendor": "Google Inc.",
        "navigator.__proto__.unregisterProtocolHandler": function() {},
        "window.__proto__.clientInformation": navigator,
        "window.__proto__.defaultStatus": "",
        "window.__proto__.defaultstatus": "",
        "window.__proto__.onappinstalled": IgnoredOnEventHandler(),
        "window.__proto__.onbeforeinstallprompt": IgnoredOnEventHandler(),
        "window.__proto__.oncancel": IgnoredOnEventHandler(),
        "window.__proto__.ondevicelight": IgnoredOnEventHandler(),
        "window.__proto__.ondeviceorientationabsolute": IgnoredOnEventHandler(),
        "window.__proto__.onmousewheel": IgnoredOnEventHandler(),
        "window.__proto__.onsearch": IgnoredOnEventHandler(),
        "window.__proto__.onselectionchange": IgnoredOnEventHandler(),
        "window.webkitMediaStream": window.MediaStream,
      }, ChromeAndWebKitCommonOverrides, HideFirefoxOnlyOverrides);

      const ChromeDesktopCommonOverrides = Object.assign({},
        ChromeCommonOverrides, HideTouchSupportOverrides, HideOrientationSupportOverrides);

      const ChromeMobileCommonOverrides = Object.assign({},
        ChromeCommonOverrides, HidePointerSupportOverrides);

      const ChromeCommonMocks = {
        Battery: true,
        Chrome: true,
        DeviceMemory: true,
        Keyboard: true,
        Locks: true,
        MIDI: true,
        MediaSession: true,
        NetworkInformation: true,
        Presentation: true,
        StyleMedia: true,
        USB: true,
        UserActivation: true,
        UserMedia: true,
        VisualViewport: true,
        WebKitFileSystem: true,
        WebKitSpeechRecognition: true,
        WebKitUserMedia: true,
        WebKitWebRTC: true,
        WebSQL: true,
      };

      const ChromeDesktopCommonMocks = Object.assign({}, ChromeCommonMocks, {
        PointerEvents: true,
      });

      const ChromeMobileCommonMocks = Object.assign({}, ChromeCommonMocks, {
        NetworkInformation: true,
        Orientation: true,
        TouchEvents: true,
      });

      const ChromeDesktopCommonMockState = {
        Battery: {
          charging: "true",
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1,
        },
        Keyboard: {
          "Backquote": "`", "Backslash": "\\", "BracketLeft": "[", "BracketRight": "]", "Comma": ",", "Digit0": "0", "Digit1": "1",
          "Digit2": "2", "Digit3": "3", "Digit4": "4", "Digit5": "5", "Digit6": "6", "Digit7": "7", "Digit8": "8", "Digit9": "9",
          "Equal": "=", "IntlBackslash": "<", "KeyA": "a", "KeyB": "b", "KeyC": "c", "KeyD": "d", "KeyE": "e", "KeyF": "f",
          "KeyG": "g", "KeyH": "h", "KeyI": "i", "KeyJ": "j", "KeyK": "k", "KeyL": "l", "KeyM": "m", "KeyN": "n", "KeyO": "o",
          "KeyP": "p", "KeyQ": "q", "KeyR": "r", "KeyS": "s", "KeyT": "t", "KeyU": "u", "KeyV": "v", "KeyW": "w", "KeyX": "x",
          "KeyY": "y", "KeyZ": "z", "Minus": "-", "Period": ".", "Quote": "'", "Semicolon": ";", "Slash": "/",
        },
        NetworkInformation: {
          downlink: 8.2,
          effectiveType: "4g",
          rtt: 50,
          saveData: false,
        },
      };

      const FirefoxCommonOverrides = Object.assign({
        "navigator.__proto__.buildID": "20181001000000",
        "navigator.__proto__.doNotTrack": "unspecified",
        "navigator.__proto__.mimeTypes": CommonMimeTypes,
        "navigator.__proto__.plugins": CommonPlugins,
        "navigator.__proto__.productSub": "20100101",
        "navigator.__proto__.taintEnabled": function() { return false; },
        "navigator.__proto__.unregisterProtocolHandler": undefined,
        "navigator.__proto__.vendor": "",
        "navigator.__proto__.webdriver": false,
        "window.__proto__.BatteryManager": window.BatteryManager || this.mockObjects.get("Battery").BatteryManager,
        "window.__proto__.VisualViewport": window.VisualViewport || this.mockObjects.get("VisualViewport").VisualViewport,
        "window.__proto__.dump": function() {},
        "window.__proto__.getDefaultComputedStyle": function() { return window.getComputedStyle.call(this, arguments); },
        "window.__proto__.fullScreen": function() { return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || false; },
        "window.__proto__.mozInnerScreenX": 0,
        "window.__proto__.mozInnerScreenY": 0,
        "window.__proto__.onabsolutedeviceorientation": IgnoredOnEventHandler(),
        "window.__proto__.onanimationcancel": IgnoredOnEventHandler(),
        "window.__proto__.ondevicelight": IgnoredOnEventHandler(),
        "window.__proto__.ondevicemotion": IgnoredOnEventHandler(),
        "window.__proto__.ondeviceorientation": IgnoredOnEventHandler(),
        "window.__proto__.ondeviceproximity": IgnoredOnEventHandler(),
        "window.__proto__.ondragexit": IgnoredOnEventHandler(),
        "window.__proto__.onloadend": IgnoredOnEventHandler(),
        "window.__proto__.onmozfullscreenchange": IgnoredOnEventHandler(),
        "window.__proto__.onmozfullscreenerror": IgnoredOnEventHandler(),
        "window.__proto__.onshow": IgnoredOnEventHandler(),
        "window.__proto__.ontransitioncancel": IgnoredOnEventHandler(),
        "window.__proto__.ontransitionrun": IgnoredOnEventHandler(),
        "window.__proto__.ontransitionstart": IgnoredOnEventHandler(),
        "window.__proto__.onuserproximity": IgnoredOnEventHandler(),
        "window.__proto__.scrollByLines": function(lines) { const h = lines * 13; scrollBy(h, h); },
        "window.__proto__.scrollByPages": function(pages) { scrollBy(pages * window.innerWidth, pages * window.innerHeight); },
        "window.__proto__.scrollMaxX": function() { return document.scrollingElement.scrollWidth - window.innerWidth; },
        "window.__proto__.scrollMaxY": function() { return document.scrollingElement.scrollHeight - window.innerHeight; },
        "window.__proto__.setResizable": function() {},
        "window.__proto__.sizeToContent": function() {},
        "window.__proto__.updateCommands": function() {},
      }, HideChromeAndWebKitCommonOverrides, HideChromeOnlyOverrides);

      const FirefoxDesktopCommonOverrides = Object.assign({},
        FirefoxCommonOverrides, HideTouchSupportOverrides, HideOrientationSupportOverrides);

      const FirefoxMobileCommonOverrides = Object.assign({},
        FirefoxCommonOverrides, HidePointerSupportOverrides);

      const FirefoxCommonMocks = {
        MozillaInstallTrigger: true,
        MozillaPaintCount: true,
        MozillaUserMedia: true,
        MozillaWebRTC: true,
        Sidebar: true,
      };

      const FirefoxDesktopCommonMocks = Object.assign({}, FirefoxCommonMocks, {
        PointerEvents: true,
      });

      const FirefoxMobileCommonMocks = Object.assign({}, FirefoxCommonMocks, {
        NetworkInformation: true,
        Orientation: true,
        TouchEvents: true,
      });

      UserAgentOverrider.Config = {
        uaChromeAndroidPhone: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
            "User-Agent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G935W8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.90 Mobile Safari/537.36",
          },
          overrides: Object.assign({}, ChromeMobileCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (Linux; Android 8.0.0; SM-G935W8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.90 Mobile Safari/537.36",
            "navigator.__proto__.platform": "Linux armv8l",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G935W8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.90 Mobile Safari/537.36",
          }),
          mocks: ChromeMobileCommonMocks,
          mockState: {
            Battery: {
              charging: true,
              chargingTime: 0,
              dischargingTime: Infinity,
              level: 1,
            },
            NetworkInformation: {
              downlink: 1.75,
              downlinkMax: Infinity,
              effectiveType: "4g",
              rtt: 50,
              saveData: false,
              type: "wifi",
            },
          },
        },
        uaChromeAndroidTablet: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
            "User-Agent": "Mozilla/5.0 (Linux; Android 7.1.2; KFKAWI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.90 Safari/537.36",
          },
          overrides: Object.assign({}, ChromeMobileCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (Linux; Android 7.1.2; KFKAWI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.90 Safari/537.36",
            "navigator.__proto__.platform": "Linux armv8l",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Linux; Android 7.1.2; KFKAWI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.90 Safari/537.36",
          }),
          mocks: ChromeMobileCommonMocks,
          mockState: {
            Battery: {
              charging: "true",
              chargingTime: Infinity,
              dischargingTime: Infinity,
              level: 1,
            },
            NetworkInformation: {
              downlink: 4,
              downlinkMax: Infinity,
              effectiveType: "4g",
              rtt: 50,
              saveData: false,
              type: "wifi",
            },
          },
        },
        uaChromeLinux: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36",
          },
          overrides: Object.assign({}, ChromeDesktopCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36",
            "navigator.__proto__.platform": "Linux x86_64",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36",
          }),
          mocks: ChromeDesktopCommonMocks,
          mockState: ChromeDesktopCommonMockState,
        },
        uaChromeOSX: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36",
          },
          overrides: Object.assign({}, ChromeDesktopCommonOverrides, {
            "navigator.__proto__.appVersion": "",
            "navigator.__proto__.platform": "MacIntel",
            "navigator.__proto__.userAgent": "",
          }),
          mocks: ChromeDesktopCommonMocks,
          mockState: ChromeDesktopCommonMockState,
        },
        uaChromeWindows: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36",
          },
          overrides: Object.assign({}, ChromeDesktopCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36",
            "navigator.__proto__.platform": "Win32",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36",
          }),
          mocks: ChromeDesktopCommonMocks,
          mockState: ChromeDesktopCommonMockState,
        },
        uaEdge: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; ServiceUI 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763",
          },
          overrides: Object.assign({}, HideChromeOnlyOverrides, HideFirefoxOnlyOverrides, {
            "navigator.__proto__.activeVRDisplays": function() { return []; },
            "navigator.__proto__.appVersion": "5.0 (Windows NT 10.0; Win64; ServiceUI 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; ServiceUI 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763",
            "navigator.__proto__.msManipulationViewsEnabled": false,
            "navigator.__proto__.doNotTrack": null,
            "navigator.__proto__.gamepadInputEmulation": "keyboard",
            "navigator.__proto__.storage": undefined,
            "navigator.__proto__.platform": "Win32",
            "navigator.__proto__.productSub": "20030107",
            "navigator.__proto__.vendor": "",
            "navigator.__proto__.webdriver": false,
            "window.MSBlobBuilder": class {
              constructor() { this.parts = []; }
              append(p) { this.parts.push(p); }
              getBlob(type) { return new Blob(this.parts, type); }
            },
            "window.MSDCCEvent": class extends Event {},
            "window.MSDSHEvent": class extends Event {},
            "window.MSGesture": class {
              addPointer() {}
              stop() {}
              get target() {}
            },
            "window.MSGestureEvent": class extends UIEvent {
              initGestureEvent() {}
              get gestureObject() {}
              get translationX() { return 0; }
              get translationY() { return 0; }
              get velocityAngular() { return 0; }
              get velocityExpansion() { return 0; }
              get velocityX() { return 0; }
              get velocityY() { return 0; }
              static get MSGESTURE_FLAG_NONE() { return 0; }
              static get MSGESTURE_FLAG_BEGIN() { return 1; }
              static get MSGESTURE_FLAG_END() { return 2; }
              static get MSGESTURE_FLAG_CANCEL() { return 4; }
              static get MSGESTURE_FLAG_INTERTIA() { return 8; }
            },
            "window.MSGraphicsTrust": class {
              get constrictionActive() {}
              get status() {}
            },
            "window.MSWindowsComponentDetachedEvent": class extends UIEvent {},
            "window.MSWindowsComponentElement": class {},
            "window.MSInkCanvasContext": class {
              get msInkPresenter() {}
            },
            "window.MSManipulationEvent": class extends UIEvent {
              static get MS_MANIPULATION_STATE_STOPPED() { return 0; }
              static get MS_MANIPULATION_STATE_ACTIVE() { return 1; }
              static get MS_MANIPULATION_STATE_INTERTIA() { return 2; }
              static get MS_MANIPULATION_STATE_PRESELECT() { return 3; }
              static get MS_MANIPULATION_STATE_SELECTING() { return 4; }
              static get MS_MANIPULATION_STATE_DRAGGING() { return 5; }
              static get MS_MANIPULATION_STATE_CANCELLED() { return 6; }
              static get MS_MANIPULATION_STATE_COMMITTED() { return 7; }
            },
            "window.MSMediaKeyError": window.MediaKeyError || class extends Error {},
            "window.MSMediaKeyMessageEvent": class extends UIEvent {},
            "window.MSMediaKeyNeededEvent": class extends UIEvent {},
            "window.MSMediaKeys": window.MediaKeys || class {},
            "window.MSMediaKeySession": window.MediaKeySession || class {},
            "window.MSQualityEvent": class extends Event {},
            "window.MSRangeCollection": class extends Array {},
            "window.MSRTCConfConfig": class extends EventTarget {
              get onmsvideoreceivers() { return this.vrs; }
              set onmsvideoreceivers(l) { this.vrs = l; }
            },
            "window.MSSiteModeEvent": class extends UIEvent {
              get actionURL() {}
              get buttonID() {}
            },
            "window.MSStream": window.Stream,
            "window.MSStreamReader": window.StreamReader,
            "window.MSVideoReceiversEvent": class extends Event {},
            "window.__proto__.browser": { get: () => { throw new Error("Unspecified Error"); } },
            "window.__proto__.cancelIdleCallback": undefined,
            "window.__proto__.chrome": { app: { getDetails: () => {} } },
            "window.__proto__.clearImmediate": function(id) { return clearTimeout(id); },
            "window.__proto__.clientInformation": navigator,
            "window.__proto__.customElements": undefined,
            "window.__proto__.defaultStatus": "",
            "window.__proto__.find": undefined,
            "window.__proto__.getMatchedCSSRules": function() { return []; },
            "window.__proto__.msWriteProfilerMark": function() {},
            "window.__proto__.offscreenBuffering": true,
            "window.__proto__.onanimationcancel": undefined,
            "window.__proto__.onclose": undefined,
            "window.__proto__.oncompassneedscalibration": IgnoredOnEventHandler(),
            "window.__proto__.oncuechange": IgnoredOnEventHandler(),
            "window.__proto__.ondevicelight": IgnoredOnEventHandler(),
            "window.__proto__.ondevicemotion": IgnoredOnEventHandler(),
            "window.__proto__.ondeviceorientation": IgnoredOnEventHandler(),
            "window.__proto__.ondeviceproximity": undefined,
            "window.__proto__.onlanguagechange": undefined,
            "window.__proto__.onloadend": undefined,
            "window.__proto__.onmousewheel": IgnoredOnEventHandler(),
            "window.__proto__.onmsgesturechange": IgnoredOnEventHandler(),
            "window.__proto__.onmsgesturedoubletap": IgnoredOnEventHandler(),
            "window.__proto__.onmsgestureend": IgnoredOnEventHandler(),
            "window.__proto__.onmsgesturehold": IgnoredOnEventHandler(),
            "window.__proto__.onmsgesturestart": IgnoredOnEventHandler(),
            "window.__proto__.onmsgesturetap": IgnoredOnEventHandler(),
            "window.__proto__.onmsineratiastart": IgnoredOnEventHandler(),
            "window.__proto__.onselectionchange": IgnoredOnEventHandler(),
            "window.__proto__.ontransitioncancel": undefined,
            "window.__proto__.ontransitionrun": undefined,
            "window.__proto__.onvrdisplayactivate": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplayblur": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplayconnect": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplaydeactivate": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplaydisconnect": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplayfocus": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplaypointerrestricted": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplaypointerunrestricted": IgnoredOnEventHandler(),
            "window.__proto__.onvrdisplaypresentchange": IgnoredOnEventHandler(),
            "window.__proto__.requestIdleCallback": undefined,
            "window.__proto__.setImmediate": function(fn) { return setTimeout(fn, 0); },
            "window.webkitCancelAnimationFrame": window.cancelAnimationFrame,
            "window.webkitConvertPointFromNodeToPage": function() {},
            "window.webkitConvertPointFromPageToNode": function() {},
            "window.webkitRequestAnimationFrame": window.requestAnimationFrame,
          }),
          mocks: {
            ApplicationCache: true,
            PointerEvents: true,
            StyleMedia: true,
          },
        },
        uaFirefoxAndroidTablet: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Android 8.0.0; Tablet; rv:66.0) Gecko/66.0 Firefox/66.0",
          },
          overrides: Object.assign({}, FirefoxMobileCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (X11)",
            "navigator.__proto__.mimeTypes": [],
            "navigator.__proto__.plugins": [],
            "navigator.__proto__.oscpu": "Linux armv8l",
            "navigator.__proto__.platform": "Linux armv8l",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Android 8.0.0; Tablet; rv:66.0) Gecko/66.0 Firefox/66.0",
          }),
          mocks: FirefoxMobileCommonMocks,
        },
        uaFirefoxAndroidPhone: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Android 8.0.0; Mobile; rv:66.0) Gecko/66.0 Firefox/66.0",
          },
          overrides: Object.assign({}, FirefoxMobileCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (X11)",
            "navigator.__proto__.mimeTypes": [],
            "navigator.__proto__.plugins": [],
            "navigator.__proto__.oscpu": "Linux armv8l",
            "navigator.__proto__.platform": "Linux armv8l",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Android 8.0.0; Mobile; rv:66.0) Gecko/66.0 Firefox/66.0",
          }),
          mocks: FirefoxMobileCommonMocks,
        },
        uaFirefoxLinux: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:66.0) Gecko/20100101 Firefox/66.0",
          },
          overrides: Object.assign({}, FirefoxDesktopCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (X11)",
            "navigator.__proto__.oscpu": "Linux x86_64",
            "navigator.__proto__.platform": "Linux x86_64",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (X11; Linux x86_64; rv:66.0) Gecko/20100101 Firefox/66.0",
          }),
          mocks: FirefoxDesktopCommonMocks,
        },
        uaFirefoxOSX: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:66.0) Gecko/20100101 Firefox/66.0",
          },
          overrides: Object.assign({}, FirefoxDesktopCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (Macintosh)",
            "navigator.__proto__.oscpu": "Intel Mac OS X 10.14",
            "navigator.__proto__.platform": "MacIntel",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:66.0) Gecko/20100101 Firefox/66.0",
          }),
          mocks: FirefoxDesktopCommonMocks,
        },
        uaFirefoxWindows: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0",
          },
          overrides: Object.assign({}, FirefoxDesktopCommonOverrides, {
            "navigator.__proto__.appVersion": "5.0 (Windows)",
            "navigator.__proto__.oscpu": "Windows NT 10.0; Win64; x64",
            "navigator.__proto__.platform": "Win32",
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0",
          }),
          mocks: FirefoxDesktopCommonMocks,
        },
        uaSafariOSX: {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Safari/605.1.15",
          },
          overrides: Object.assign({}, HideChromeOnlyOverrides, HideFirefoxOnlyOverrides,
                                       HidePointerSupportOverrides, HideTouchSupportOverrides,
                                       HideOrientationSupportOverrides, {
            "navigator.__proto__.appVersion": "5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Safari/605.1.15",
            "navigator.__proto__.buildID": undefined,
            "navigator.__proto__.clipboard": undefined,
            "navigator.__proto__.credentials": undefined,
            "navigator.__proto__.doNotTrack": undefined,
            "navigator.__proto__.getStorageUpdates": function() {},
            "navigator.__proto__.hardwareConcurrency": undefined,
            "navigator.__proto__.maxTouchPoints": undefined,
            "navigator.__proto__.mediaCapabilities": undefined,
            "navigator.__proto__.oscpu": undefined,
            "navigator.__proto__.permissions": undefined,
            "navigator.__proto__.platform": "MacIntel",
            "navigator.__proto__.productSub": "20030107",
            "navigator.__proto__.serviceWorker": undefined,
            "navigator.__proto__.share": function() { return Promise.reject(new TypeError("Type Error")); },
            "navigator.__proto__.storage": undefined,
            "navigator.__proto__.userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Safari/605.1.15",
            "navigator.__proto__.vendor": "Apple Computer, Inc.",
            "navigator.__proto__.webdriver": false,
            "window.ApplyPayError": class extends Error {},
            "window.ApplyPaySession": class extends EventTarget {
              static get STATUS_SUCCESS() { return 0; }
              static get STATUS_FAILURE() { return 1; }
              static get STATUS_INVALID_BILLING_POSTAL_ADDRESS() { return 2; }
              static get STATUS_INVALID_SHIPPING_CONTACT() { return 4; }
              static get STATUS_INVALID_SHIPPING_POSTAL_ADDRESS() { return 3; }
              static get STATUS_PIN_INCORRECT() { return 6; }
              static get STATUS_PIN_LOCKOUT() { return 7; }
              static get STATUS_PIN_REQUIRED() { return 5; }
              static supportsVersion() { return false; }
              static canMakePayments() { return false; }
              static canMakePaymentsWithActiveCard() { return false; }
              abort() {}
              begin() {}
              completeMerchantValidation() {}
              completePayment() {}
              completePaymentMethodSelection() {}
              completeShippingContactSelection() {}
              completeShippingMethodSelection() {}
              openPaymentSetup() {}
              get oncancel() { return this.oncancel; }
              set oncancel(v) { this.oncancel = v; }
              get onpaymentauthorized() { return this.onpaymentauthorized; }
              set onpaymentauthorized(v) { this.onpaymentauthorized = v; }
              get onpaymentmethodselected() { return this.onpaymentmethodselected; }
              set onpaymentmethodselected(v) { this.onpaymentmethodselected = v; }
              get onshippingcontactselected() { return this.onshippingcontactselected; }
              set onshippingcontactselected(v) { this.onshippingcontactselected = v; }
              get onshippingmethodselected() { return this.onshippingmethodselected; }
              set onshippingmethodselected(v) { this.onshippingmethodselected = v; }
              get onvalidatemerchant() { return this.onvalidatemerchant; }
              set onvalidatemerchant(v) { this.onvalidatemerchant = v; }
            },
            "window.WebGL2RenderingContext": undefined,
            "window.WebGLVertexArrayObject": undefined,
            "window.WebKitAnimationEvent": window.AnimationEvent,
            "window.WebKitMediaKeyError": class extends Error {},
            "window.WebKitMediaKeyMessageEvent": class extends Event {},
            "window.WebKitMediaKeyNeededEvent": class extends Event {},
            "window.WebKitMediaKeys": class {
              get keySystem() {}
              createSession() {}
              static isTypeSupported() { return false; }
            },
            "window.WebKitMediaKeySession": class extends EventTarget {
              get error() {}
              get keySystem() {}
              get onwebkitkeyadded() { return this.onwebkitkeyadded; }
              set onwebkitkeyadded(v) { this.onwebkitkeyadded = v; }
              get onwebkitkeyerror() { return this.onwebkitkeyerror; }
              set onwebkitkeyerror(v) { this.onwebkitkeyerror = v; }
              get onwebkitkeymessage() { return this.onwebkitkeymessage; }
              set onwebkitkeymessage(v) { this.onwebkitkeymessage = v; }
              close() {}
              update() {}
            },
            "window.SpeechSynthesis": undefined,
            "window.SpeechSynthesisErrorEvent": undefined,
            "window.SpeechSynthesisVoice": undefined,
            "window.WebKitNamespace": class {},
            "window.WebKitPlaybackTargetAvailabilityEvent": class extends Event {},
            "window.WebKitPoint": window.DOMPoint,
            "window.WebKitTransitionEvent": window.TransitionEvent,
            "window.webkitAudioContext": window.AudioContext,
            "window.webkitAudioPannerNode": window.AudioPannerNode,
            "window.webkitCancelRequestAnimationFrame": window.cancelAnimationFrame,
            "window.webkitConvertPointFromNodeToPage": function() {},
            "window.webkitConvertPointFromPageToNode": function() {},
            "window.webkitIndexedDB": window.indexedDB,
            "window.webkitOfflineAudioContext": window.OfflineAudioContext,
            "window.__proto__.cancelIdleCallback": undefined,
            "window.__proto__.clientInformation": navigator,
            "window.__proto__.createImageBitmap": undefined,
            "window.__proto__.defaultStatus": "",
            "window.__proto__.defaultstatus": "",
            "window.__proto__.external": undefined,
            "window.__proto__.getMatchedCSSRules": function() { return []; },
            "window.__proto__.offscreenBuffering": true,
            "window.__proto__.onafterprint": undefined,
            "window.__proto__.onauxclick": undefined,
            "window.__proto__.onbeforeprint": undefined,
            "window.__proto__.onclose": undefined,
            "window.__proto__.ongotpointercapture": undefined,
            "window.__proto__.onlostpointercapture": undefined,
            "window.__proto__.onmessageerror": undefined,
            "window.__proto__.onselectstart": undefined,
            "window.__proto__.onwebkitanimationend": undefined,
            "window.__proto__.onwebkitanimationiteration": undefined,
            "window.__proto__.onwebkitanimationstart": undefined,
            "window.__proto__.onwebkittransitionend": undefined,
            "window.__proto__.onwheel": undefined,
            "window.__proto__.requestIdleCallback": undefined,
            "window.__proto__.showModalDialog": function() {},
          }, ChromeAndWebKitCommonOverrides),
          mocks: {
            ApplicationCache: true,
            StyleMedia: true,
            WebSQL: true,
          },
        },
      };
    }
    if (ua === undefined) {
      return UserAgentOverrider.Config;
    }
    return UserAgentOverrider.Config[ua];
  }
}
