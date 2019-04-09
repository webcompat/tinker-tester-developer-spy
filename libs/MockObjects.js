/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http<F4>://mozilla.org/MPL/2.0/. */

"use strict";

/* TODO: add the webkit-prefixed stuff on window */

class MockObjects {
  constructor(overrider) {
    this.overrider = overrider;
    this.prepareMocks();
  }

  get(name) {
    return this.mocks[name];
  }

  enableIfNoNativeSupport(name, state) {
    const mock = this.get(name);
    if (mock && !mock.haveNativeSupport) {
      this.enable(name, state);
    }
  }

  enable(name, state) {
    const mock = this.get(name);
    if (!mock) {
      return;
    }
    if (state && mock.state) {
      mock.state = state;
    }
    if (mock.enabledCount) {
      mock.enabledCount++;
      return;
    }
    mock.enabledCount = 1;
    mock.activeHooks = [];
    for (const [prop, override] of Object.entries(mock.hooks)) {
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
        mock.activeHooks.push(id);
      } catch (_) {} /* We cannot override? Oh well... */
    }
  }

  disable(name) {
    const mock = this.get(name);
    if (!mock || !mock.enabledCount || --mock.enabledCount) {
      return;
    }
    for (const id of mock.activeHooks) {
      this.overrider.disable(id);
    }
  }

  shutdown() {
    for (const mock of Object.values(this.mocks)) {
      mock.shutdown && mock.shutdown();
    }
  }

  prepareMocks() {
    this.mocks = {};
    this.mockApplicationCacheAPI();
    this.mockBatteryAPI();
    this.mockChromeAPI();
    this.mockDeviceMemoryAPI();
    this.mockGetUserMediaAPI();
    this.mockKeyboardAPI();
    this.mockLocksAPI();
    this.mockMIDIAPI();
    this.mockMediaSessionAPI();
    this.mockMozillaGetUserMediaAPI();
    this.mockMozillaInstallTriggerAPI();
    this.mockMozillaPaintCountAPI();
    this.mockMozillaWebRTCAPIs();
    this.mockNetworkInformationAPI();
    this.mockPresentationAPI();
    this.mockSidebarAPI();
    this.mockStyleMediaAPI();
    this.mockUSBAPI();
    this.mockUserActivationAPI();
    this.mockVisualViewport();
    this.mockWebSQLAPI();
    this.mockWebKitFileSystemAPI();
    this.mockWebKitGetUserMediaAPI();
    this.mockWebKitSpeechRecognitionAPI();
    this.mockWebKitWebRTCAPIs();
    this.moveOrientationAPI();
    this.movePointerEventsAPI();
    this.moveTouchEventsAPI();
  }

  getMockBuiltinFn() {
    return function() {
      return new TypeError("Illegal constructor");
    };
  }

 getMockIgnoredEventHandler() {
    return function() {
      let value;
      return {
        get: () => value,
        set: v => { value = v; },
      };
    };
  }

  mockApplicationCacheAPI() {
    class ApplicationCache extends EventTarget {
      get oncached() { return this.oncached; }
      set oncached(l) { this.oncached = l; }
      get onchecking() { return this.onchecking; }
      set onchecking(l) { this.onchecking = l; }
      get ondownloading() { return this.ondownloading; }
      set ondownloading(l) { this.ondownloading = l; }
      get onerror() { return this.onerror; }
      set onerror(l) { this.onerror = l; }
      get onnoupdate() { return this.onnoupdate; }
      set onnoupdate(l) { this.onnoupdate = l; }
      get onobsolete() { return this.onobsolete; }
      set onobsolete(l) { this.onobsolete = l; }
      get onprogress() { return this.onprogress; }
      set onprogress(l) { this.onprogress = l; }
      get onupdateready() { return this.onupdateready; }
      set onupdateready(l) { this.onupdateready = l; }
      get status() { return 0; }
    }
    this.mocks.ApplicationCache = {
      haveNativeSupport: !!window.applicationCache,
      "window.__proto__.applicationCache": new ApplicationCache(),
      "window.__proto__.ApplicationCache": ApplicationCache,
    };
  }

  mockBatteryAPI() {
    let values = {
      charging: "true",
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1,
    };
    class BatteryManager extends EventTarget {
      get [Symbol.toStringTag]() { return "BatteryManager"; }
      get charging() { return values.charging; }
      get chargingTime() { return values.chargingTime; }
      get dischargingTime() { return values.dischargingTime; }
      get level() { return values.level; }
      get onchargingchange() { return this._onchargingchange; }
      set onchargingchange(l) { this._onchargingchange = l; }
      get onchargingtimechange() { return this._onchargingtimechange; }
      set onchargingtimechange(l) { this._onchargingtimechange = l; }
      get ondischargingtimechange() { return this._ondischargingtimechange; }
      set ondischargingtimechange(l) { this._ondischargingtimechange = l; }
      get onlevelchange() { return this._onlevelchange; }
      set onlevelchange(l) { this._onlevelchange = l; }
    }
    const batteryManager = new BatteryManager();
    this.mocks.Battery = {
      haveNativeSupport: !!navigator.getBattery,
      BatteryManager,
      hooks: {
        "navigator.__proto__.getBattery": function() { return Promise.resolve(batteryManager); },
        "window.__proto__.BatteryManager": BatteryManager,
      },
      get state() { return values; },
      set state(state) { values = state; },
    };
  }

  mockChromeAPI() {
    const me = {
      values: {
        csi: {
          onloadT: 1554651360296,
          pageT: 1698956.061,
          startE: 1554651360235,
          tran: 16,
        },
        loadTimes: {
          commitLoadTime: 1554651360.283,
          connectionInfo: "http/1.1",
          finishDocumentLoadTime: 1554651360.296,
          finishLoadTime: 1554651360.301,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: 1554651360.335,
          navigationType: "Reload",
          npnNegotiatedProtocol: "http/1.1",
          requestTime: 1554651360.235,
          startLoadTime: 1554651360.235,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: true,
        },
      },
    };
    function InvalidExtId(extId) {
      throw new TypeError(`Invalid extension id: '${extId}'`);
    }
    this.mocks.Chrome = Object.assign(me, {
      haveNativeSupport: !!window.chrome,
      hooks: {
        "window.__proto__.chrome": {
          app: {
            InstallState: {
              DISABLED: "disabled",
              INSTALLED: "installed",
              NOT_INSTALLED: "not_installed",
            },
            RunningState: {
              CANNOT_RUN: "cannot_run",
              READY_TO_RUN: "ready_to_run",
              RUNNING: "running",
            },
            getDetails: () => null,
            installState: () => "not_installed",
            runningState: "cannot_run",
            isInstalled: false,
          },
          csi: () => { return Object.assign({}, me.values.csi); },
          loadTimes: () => { return Object.assign({}, me.values.loadTimes); },
          runtime: {
            OnInstalledReason: {
              CHROME_UPDATE: "chrome_update",
              INSTALL: "install",
              SHARED_MODULE_UPDATE: "shared_module_update",
              UPDATE: "update",
            },
            OnRestartRequiredReason: {
              APP_UPDATE: "app_update",
              OS_UPDATE: "os_update",
              PERIODIC: "periodic",
            },
            PlatformArch: {
              ARM: "arm",
              MIPS: "mips",
              MIPS64: "mips64",
              X86_32: "x86-32",
              X86_64: "x86-64",
            },
            PlatformNaclArch: {
              ARM: "arm",
              MIPS: "mips",
              MIPS64: "mips64",
              X86_32: "x86-32",
              X86_64: "x86-64",
            },
            PlatformOs: {
              ANDROID: "android",
              CROS: "cros",
              LINUX: "linux",
              MAC: "mac",
              OPENBSD: "openbsd",
              WIN: "win",
            },
            RequestUpdateCheckStatus: {
              NO_UPDATE: "no_update",
              THROTTLED: "throttled",
              UPDATE_AVAILABLE: "update_available",
            },
            id: undefined,
            connect: InvalidExtId,
            sendMessage: InvalidExtId,
          },
        },
      },
      get state() { return me.values; },
      set state(state) { me.values = state; },
    });
  }

  mockDeviceMemoryAPI() {
    let gigs = 2;
    this.mocks.DeviceMemory = {
      haveNativeSupport: !!navigator.deviceMemory,
      hooks: {
        "navigator.__proto__.deviceMemory": { get: () => { return gigs; } },
      },
      get state() { return gigs; },
      set state(state) { gigs = state; },
    };
  }

  mockGetUserMediaAPI() {
    this.mocks.UserMedia = this.mockPrefixedGetUserMediaAPI("getUserMedia");
  }

  mockKeyboardAPI() {
    class KeyboardLayoutMap extends Map {
      get [Symbol.toStringTag]() { return "KeyboardLayoutMap"; }
    }
    const map = new KeyboardLayoutMap();
    class Keyboard {
      get [Symbol.toStringTag]() { return "Keyboard"; }
      getLayoutMap() { return Promise.resolve(map); }
      lock() { return Promise.resolve(); }
      unlock() {}
    }
    this.mocks.Keyboard = {
      haveNativeSupport: !!navigator.keyboard,
      hooks: {
        "navigator.__proto__.keyboard": new Keyboard(),
        "window.__proto__.Keyboard": Keyboard,
        "window.__proto__.KeyboardLayoutMap": KeyboardLayoutMap,
      },
      get state() { return map; },
      set state(state) {
        map.clear();
        for (const [k, v] of Object.entries(state || {})) {
          map.set(k, v);
        }
      },
    };
  }

  mockLocksAPI() {
    const map = new Map();
    class Lock {
      constructor(name, {mode}) {
        this.name = name;
        this.mode = mode;
        map.set(name, this);
      }
      get [Symbol.toStringTag]() { return "Lock"; }
      get name() { return this.name; }
      get mode() { return this.mode; }
    }
    class LockManager {
      get [Symbol.toStringTag]() { return "LockManager"; }
      query() {
        return Promise.resolve([]);
      }
      request(name, options, callback) {
        if (map.has(name)) {
          (callback || options)(map.get(name));
        }
        const lock = new Lock(name, callback ? options : {});
        (callback || options)(lock);
      }
    }
    this.mocks.Locks = {
      haveNativeSupport: !!navigator.locks,
      hooks: {
        "navigator.__proto__.locks": new LockManager(),
        "window.__proto__.LockManager": LockManager,
        "window.__proto__.Lock": Lock,
      },
      map,
    };
  }

  mockMediaSessionAPI() {
    class MediaMetadata {
      constructor() { this._artwork = []; }
      get [Symbol.toStringTag]() { return "MediaMetadata"; }
      get album() { return this._album; }
      set album(v) { this._album = v; }
      get artist() { return this._artist; }
      set artist(v) { this._artist = v; }
      get artwork() { return this._artwork; }
      set artwork(v) { this._artwork = v; }
      get title() { return this._title; }
      set title(v) { this._title = v; }
    }
    class MediaSession {
      get [Symbol.toStringTag]() { return "MediaSession"; }
      get metadata() { return this._meta; }
      set metadata(v) { this._meta = v; }
      get playbackState() { return this._playbackState; }
      set playbackState(v) { this._playbackState = v; }
      setActionHandler(evt, callback) {}
    }
    this.mocks.MediaSession = {
      haveNativeSupport: !!navigator.mediaSession,
      hooks: {
        "navigator.__proto__.mediaSession": new MediaSession(),
        "window.__proto__.MediaSession": MediaSession,
        "window.__proto__.MediaMetadata": MediaMetadata,
      },
    };
  }

  mockMIDIAPI() {
    class MIDIPort extends EventTarget {
      get [Symbol.toStringTag]() { return "MIDIPort"; }
    }
    class MIDIConnectionEvent extends Event {
      get [Symbol.toStringTag]() { return "MIDIConnectionEvent"; }
    }
    class MIDIInput extends MIDIPort {
      get [Symbol.toStringTag]() { return "MIDIInput"; }
    }
    class MIDIInputMap extends Map {
      get [Symbol.toStringTag]() { return "MIDIInputMap"; }
    }
    class MIDIOutput extends MIDIPort {
      get [Symbol.toStringTag]() { return "MIDIOutput"; }
    }
    class MIDIOutputMap extends Map {
      get [Symbol.toStringTag]() { return "MIDIOutputMap"; }
    }
    const inputs = new MIDIInputMap();
    const outputs = new MIDIOutputMap();
    class MIDIAccess extends EventTarget {
      get [Symbol.toStringTag]() { return "MIDIAccess"; }
      get inputs() { return inputs; }
      get onstatechange() { return this._onstatechange; }
      set onstatechange(l) { this._onstatechange = l; }
      get outputs() { return outputs; }
      get sysexEnabled() { return false; }
    }
    this.mocks.MIDI = {
      haveNativeSupport: !!navigator.requestMIDIAccess,
      hooks: {
        "navigator.__proto__.requestMIDIAccess": function() {
          return Promise.resolve(new MIDIAccess());
        },
        "window.__proto__.MIDIAccess": MIDIAccess,
        "window.__proto__.MIDIConnectionEvent": MIDIConnectionEvent,
        "window.__proto__.MIDIInput": MIDIInput,
        "window.__proto__.MIDIInputMap": MIDIInputMap,
        "window.__proto__.MIDIOutput": MIDIOutput,
        "window.__proto__.MIDIOutputMap": MIDIOutputMap,
        "window.__proto__.MIDIPort": MIDIPort,
      },
    };
  }

  mockMozillaGetUserMediaAPI() {
    this.mocks.MozillaUserMedia = this.mockPrefixedGetUserMediaAPI("mozGetUserMedia");
  }

  mockMozillaInstallTriggerAPI() {
    class Exception extends Error {
      constructor() {
        super("");
        this.name = "NS_ERROR_UNEXPECTED";
        this.result = 2147549183;
      }
    }
    function InstallTriggerImpl() {}
    InstallTriggerImpl.prototype = {
      CONTENT: 4,
      LOCALE: 2,
      PACKAGE: 7,
      SKIN: 1,
      enabled: () => { return false; },
      install: () => { return new Exception(); },
      installChrome: () => { return new Exception(); },
      startSoftwareUpdate: () => { return new Exception(); },
      updateEnabled: () => { return false; },
    };
    this.mocks.MozillaInstallTrigger = {
      haveNativeSupport: !!window.mozPaintCount,
      hooks: {
        "window.__proto__.InstallTrigger": new InstallTriggerImpl(),
      },
    };
  }

  mockMozillaPaintCountAPI() {
    let ctr = 1;
    this.mocks.MozillaPaintCount = {
      haveNativeSupport: !!window.mozPaintCount,
      hooks: {
        "window.__proto__.mozPaintCount": { get: () => { return ctr++; } },
      },
    };
  }

  mockMozillaWebRTCAPIs() {
    this.mocks.MozillaWebRTC = this.mockPrefixedWebRTCAPIs("moz");
  }

  mockNetworkInformationAPI() {
    const me = {
      values: {
        downlink: 100,
        downlinkMax: Infinity,
        effectiveType: "unknown",
        onchange: undefined,
        ontypechange: undefined,
        rtt: 100,
        saveData: false,
      },
    };
    class NetworkInformation extends EventTarget {
      get [Symbol.toStringTag]() { return "NetworkInformation"; }
      get downlink() { return me.values.downlink; }
      get downlinkMax() { return me.values.downlinkMax; }
      get effectiveType() { return me.values.effectiveType; }
      get onchange() { return me.values.onchange; }
      set onchange(l) { me.values.onchange = l; }
      get ontypechange() { return me.values.ontypechange; }
      set ontypechange(l) { me.values.ontypechange = l; }
      get rtt() { return me.values.rtt; }
      get saveData() { return me.values.saveData; }
    }
    this.mocks.NetworkInformation = Object.assign(me, {
      haveNativeSupport: !!navigator.connection,
      hooks: {
        "navigator.__proto__.connection": new NetworkInformation(),
        "window.__proto__.NetworkInformation": NetworkInformation,
      },
    });
  }

  moveOrientationAPI() {
    let values = {
      orientation: 0,
    };
    this.mocks.Orientation = {
      haveNativeSupport: "onorientationchange" in window,
      hooks: {
        "window.onorientationchange": this.getMockIgnoredEventHandler(),
        "window.orientation": { get: () => { return values.orientation; } },
      },
      get state() { return values; },
      set state(state) { values = state; },
    };
  }

  movePointerEventsAPI() {
    class PointerEventPrototype extends UIEvent {
      get [Symbol.toStringTag]() { return "PointerEventPrototype"; }
      getCoalescedEvents() {}
      get height() {}
      get isPrimary() {}
      get pointerId() {}
      get pointerType() {}
      get pressure() {}
      get tangentialPressure() {}
      get tiltX() {}
      get tiltY() {}
      get twist() {}
      get width() {}
    }
    this.mocks.PointerEvents = {
      haveNativeSupport: "onpointercancel" in window,
      hooks: {
        "window.PointerEvent": PointerEventPrototype,
        "window.ongotpointercapture": this.getMockIgnoredEventHandler(),
        "window.onlostpointercapture": this.getMockIgnoredEventHandler(),
        "window.onpointercancel": this.getMockIgnoredEventHandler(),
        "window.onpointerdown": this.getMockIgnoredEventHandler(),
        "window.onpointerenter": this.getMockIgnoredEventHandler(),
        "window.onpointerleave": this.getMockIgnoredEventHandler(),
        "window.onpointermove": this.getMockIgnoredEventHandler(),
        "window.onpointerout": this.getMockIgnoredEventHandler(),
        "window.onpointerover": this.getMockIgnoredEventHandler(),
        "window.onpointerup": this.getMockIgnoredEventHandler(),
      },
    };
  }

  mockPrefixedGetUserMediaAPI(prop) {
    class MediaStreamError extends TypeError {
      get name() { return "NotAllowedError"; }
      get message() { return "The request is not allowed by the user agent or the platform in the current context."; }
    }
    const impl = navigator.mediaDevices && function(c, s, e) {
      return navigator.mediaDevices.getUserMedia(c, s, e);
    } || function(c, s, e) {
      e(new MediaStreamError());
    };
    const hooks = {};
    hooks[`navigator.__proto__.${prop}`] = impl;
    return {
      haveNativeSupport: !!navigator[prop],
      hooks,
    };
  }

  mockPrefixedWebRTCAPIs(prefix) {
    const ice = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate || class RTCIceCandidate {};
    const peer = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection || class RTCPeerConnection {};
    const session = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription || class RTCSessionDescription {};
    const hooks = {};
    hooks[`window.__proto__.${prefix}RTCICECandidate`] = function(a) { return new ice(a); };
    hooks[`window.__proto__.${prefix}RTCPeerConnection`] = function(a) { return new peer(a); };
    hooks[`window.__proto__.${prefix}RTCSessionDescription`] = function(a) { return new session(a); };
    return {
      haveNativeSupport: !!navigator[`${prefix}RTCIceCandidate`],
      hooks,
    };
  }

  mockPresentationAPI() {
    class Presentation {
      get [Symbol.toStringTag]() { return "Presentation"; }
      get defaultRequest() { return null; }
      set defaultRequest(_) {}
      get receiver() { return null; }
    }
    this.mocks.Presentation = {
      haveNativeSupport: !!navigator.presentation,
      hooks: {
        "navigator.__proto__.presentation": new Presentation(),
        "window.__proto__.Presentation": Presentation,
        "window.__proto__.PresentationAvailability": this.getMockBuiltinFn(),
        "window.__proto__.PresentationConnection": this.getMockBuiltinFn(),
        "window.__proto__.PresentationConnectiondAvailableEvent": this.getMockBuiltinFn(),
        "window.__proto__.PresentationConnectionCloseEvent": this.getMockBuiltinFn(),
        "window.__proto__.PresentationConnectionList": this.getMockBuiltinFn(),
        "window.__proto__.PresentationReceiver": this.getMockBuiltinFn(),
        "window.__proto__.PresentationRequest": this.getMockBuiltinFn(),
      },
    };
  }

  mockSidebarAPI() {
    class External {
      AddSearchProvider() {}
      IsSearchProviderInstalled() { return false; }
    }
    this.mocks.Sidebar = {
      haveNativeSupport: !!window.sidebar,
      hooks: {
        "window.__proto__.sidebar": new External(),
      },
    };
  }

  mockStyleMediaAPI() {
    let values = {
      type: "screen",
    };
    this.mocks.StyleMedia = {
      haveNativeSupport: !!window.styleMedia,
      hooks: {
        "window.__proto__.styleMedia": { get: () => { return Object.assign({}, values); } },
      },
      get state() { return values; },
      set state(state) { values = state; },
    };
  }

  moveTouchEventsAPI() {
    class TouchPrototype {
      get [Symbol.toStringTag]() { return "TouchPrototype"; }
      get clientX() {}
      get clientY() {}
      get force() {}
      get identifier() {}
      get pageX() {}
      get pageY() {}
      get radiusX() {}
      get radiusY() {}
      get rotationAngle() {}
      get screenX() {}
      get screenY() {}
      get target() {}
    }
    class TouchEventPrototype extends UIEvent {
      get [Symbol.toStringTag]() { return "TouchEventPrototype"; }
      initTouchEvent() {}
      targetTouches() { return false; }
      get changedTouches() { return []; }
      get touches() { return []; }
    }
    class TouchListPrototype extends Array {
      get [Symbol.toStringTag]() { return "TouchListPrototype"; }
    }
    this.mocks.TouchEvents = {
      haveNativeSupport: "ontouchstart" in window,
      hooks: {
        "window.Touch": TouchPrototype,
        "window.TouchEvent": TouchEventPrototype,
        "window.TouchList": TouchListPrototype,
        "window.ontouchcancel": this.getMockIgnoredEventHandler(),
        "window.ontouchend": this.getMockIgnoredEventHandler(),
        "window.ontouchmove": this.getMockIgnoredEventHandler(),
        "window.ontouchstart": this.getMockIgnoredEventHandler(),
      },
    };
  }

  mockUSBAPI() {
    const me = {
      values: {
        onconnect: undefined,
        ondisconnect: undefined,
      },
    };
    class USBConnectionEvent extends Event {
      get [Symbol.toStringTag]() { return "USBConnectionEvent"; }
    }
    class USB extends EventTarget {
      get [Symbol.toStringTag]() { return "USB"; }
      get onconnect() { return me.values.onconnect; }
      set onconnect(l) { me.values.onconnect = l; }
      get ondisconnect() { return me.values.ondisconnect; }
      set ondisconnect(l) { me.values.ondisconnect = l; }
      getDevices() {
        return Promise.resolve([]);
      }
      requestDevice() {
        return Promise.reject(new DOMException("No device selected."));
      }
    }
    this.mocks.USB = Object.assign(me, {
      haveNativeSupport: !!navigator.usb,
      hooks: {
        "navigator.__proto__.usb": new USB(),
        "window.__proto__.USB": USB,
        "window.__proto__.USBAlternateInterface": this.getMockBuiltinFn(),
        "window.__proto__.USBConfiguration": this.getMockBuiltinFn(),
        "window.__proto__.USBConnectionEvent": USBConnectionEvent,
        "window.__proto__.USBDevice": this.getMockBuiltinFn(),
        "window.__proto__.USBEndpoint": this.getMockBuiltinFn(),
        "window.__proto__.USBInTransferResult": this.getMockBuiltinFn(),
        "window.__proto__.USBInterface": this.getMockBuiltinFn(),
        "window.__proto__.USBIsochronousInTransferPacket": this.getMockBuiltinFn(),
        "window.__proto__.USBIsochronousInTransferResult": this.getMockBuiltinFn(),
        "window.__proto__.USBIsochronousOutTransferPacket": this.getMockBuiltinFn(),
        "window.__proto__.USBIsochronousOutTransferResult": this.getMockBuiltinFn(),
        "window.__proto__.USBOutTransferResult": this.getMockBuiltinFn(),
      },
    });
  }

  mockUserActivationAPI() {
    let overrides = {};
    const actual = {
      isActive: false,
      hasBeenActive: false,
    };
    class UserActivation {
      get [Symbol.toStringTag]() { return "UserActivation"; }
      get isActive() { return "isActive" in overrides ? overrides.isActive : actual.isActive; }
      get hasBeenActive() { return "hasBeenActive" in overrides ? overrides.hasBeenActive : actual.hasBeenActive; }
    }
    const focusHandler = e => { actual.isActive = true; actual.hasBeenActive = true; };
    const blurHandler = e => { actual.isActive = false; };
    window.addEventListener("focus", focusHandler, true);
    window.addEventListener("blur", blurHandler, true);
    const shutdown = () => {
      window.removeEventListener("focus", focusHandler, true);
      window.removeEventListener("blur", blurHandler, true);
    };
    this.mocks.UserActivation = {
      haveNativeSupport: !!navigator.userActivation,
      hooks: {
        "navigator.__proto__.userActivation": new UserActivation(),
        "window.__proto__.UserActivation": UserActivation,
      },
      get actual() { return Object.assign({}, actual); },
      get state() { return overrides; },
      set state(state) { overrides = state; },
      shutdown,
    };
  }

  mockVisualViewport() {
    let onresize;
    let onscroll;
    /* TODO: maybe re-dispatch scroll/resize events onto the mock-object's listeners? */
    class VisualViewport extends EventTarget {
      get [Symbol.toStringTag]() { return "VisualViewport"; }
      get height() { return window.innerHeight; }
      get width() { return window.innerWidth; }
      get offsetLeft() { return document.scrollingElement.scrollLeft; }
      get offsetTop() { return document.scrollingElement.scrollTop; }
      get scale() { return 1; }
      get pageLeft() { return 0; }
      get pageTop() { return 0; }
      get onresize() { return onresize; }
      set onresize(v) { onresize = v; }
      get onscroll() { return onscroll; }
      set onscroll(v) { onscroll = v; }
    }
    this.mocks.VisualViewport = {
      haveNativeSupport: !!window.visualViewport,
      hooks: {
        "window.__proto__.visualViewport": new VisualViewport(),
        "window.__proto__.VisualViewport": VisualViewport,
      },
      VisualViewport,
    };
  }

  mockWebKitFileSystemAPI() {
    class DeprecatedStorageQuota {
      get [Symbol.toStringTag]() { return "DeprecatedStorageQuota"; }
      queryUsageAndQuota(callback) { callback(0, 0); }
      requestQuota(bytes, callback) { if (callback) callback(0); }
    }
    class DeprecatedStorageInfo {
      get [Symbol.toStringTag]() { return "DeprecatedStorageInfo"; }
      queryUsageAndQuota(callback) { callback(0, 0); }
      requestQuota(bytes, callback) { if (callback) callback(0); }
    }
    DeprecatedStorageInfo.PERSISTENT = 1;
    DeprecatedStorageInfo.TEMPORARY = 0;
    this.mocks.WebKitFileSystem = {
      haveNativeSupport: !!window.webkitRequestFileSystem,
      hooks: {
        "navigator.__proto__.webkitPersistentStorage": new DeprecatedStorageQuota(),
        "navigator.__proto__.webkitTemporaryStorage": new DeprecatedStorageQuota(),
        "window.__proto__.PERSISTENT": 1,
        "window.__proto__.TEMPORARY": 0,
        "window.__proto__.webkitRequestFileSystem": function(type, bytes, onInit, onError) {
          onError(new DOMException("It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources."));
        },
        "window.__proto__.webkitResolveLocalFileSystemURL": function() {},
        "window.__proto__.webkitStorageInfo": new DeprecatedStorageInfo(),
      },
    };
  }

  mockWebKitGetUserMediaAPI() {
    this.mocks.WebKitUserMedia = this.mockPrefixedGetUserMediaAPI("webkitGetUserMedia");
  }

  mockWebKitWebRTCAPIs() {
    this.mocks.WebKitWebRTC = this.mockPrefixedWebRTCAPIs("webkit");
  }

  mockWebKitSpeechRecognitionAPI() {
    const SpeechGrammar = window.SpeechGrammar || class {
      get [Symbol.toStringTag]() { return "webkitSpeechGrammar"; }
      get src() { return ""; }
      get weight() { return 1; }
    };
    const SpeechGrammarList = window.SpeechGrammarList || class extends Array {
      get [Symbol.toStringTag]() { return "webkitSpeechGrammarList"; }
      addFromURI() {}
      addFromString() {}
    };
    const SpeechRecognition = window.SpeechRecognition || class {
      get [Symbol.toStringTag]() { return "webkitSpeechRecognition"; }
      abort() {}
      start() {}
      stop() {}
      get grammars() { return this.grammars; }
      set grammars(v) { this.grammars = v; }
      get lang() { return this.lang; }
      set lang(v) { this.lang = v; }
      get continuous() { return this.continuous; }
      set continuous(v) { this.continuous = v; }
      get interimResults() { return this.interimResults; }
      set interimResults(v) { this.interimResults = v; }
      get maxAlternatives() { return this.maxAlternatives; }
      set maxAlternatives(v) { this.maxAlternatives = v; }
      get serviceURI() { return this.serviceURI; }
      set serviceURI(v) { this.serviceURI = v; }
      get onaudioend() { return this.onaudioend; }
      set onaudioend(v) { this.onaudioend = v; }
      get onaudiostart() { return this.onaudiostart; }
      set onaudiostart(v) { this.onaudiostart = v; }
      get onend() { return this.onend; }
      set onend(v) { this.onend = v; }
      get onerror() { return this.onerror; }
      set onerror(v) { this.onerror = v; }
      get onnomatch() { return this.onnomatch; }
      set onnomatch(v) { this.onnomatch = v; }
      get onresult() { return this.onresult; }
      set onresult(v) { this.onresult = v; }
      get onsoundend() { return this.onsoundend; }
      set onsoundend(v) { this.onsoundend = v; }
      get onsoundstart() { return this.onsoundstart; }
      set onsoundstart(v) { this.onsoundstart = v; }
      get onspeechend() { return this.onspeechend; }
      set onspeechend(v) { this.onspeechend = v; }
      get onspeechstart() { return this.onspeechstart; }
      set onspeechstart(v) { this.onspeechstart = v; }
      get onstart() { return this.onstart; }
      set onstart(v) { this.onstart = v; }
    };
    const SpeechRecognitionError = window.SpeechRecognitionError || class extends Error {
      get [Symbol.toStringTag]() { return "webkitSpeechRecognitionError"; }
    };
    const SpeechRecognitionEvent = window.SpeechRecognitionEvent || class extends Event {
      get [Symbol.toStringTag]() { return "webkitSpeechRecognitionEvent"; }
      get emma() {}
      get interpretation() {}
      get resultIndex() {}
      get results() { return []; }
    };
    this.mocks.WebKitSpeechRecognition = {
      haveNativeSupport: !!window.webkitSpeechRecognition,
      hooks: {
        "window.webkitSpeechGrammar": SpeechGrammar,
        "window.webkitSpeechGrammarList": SpeechGrammarList,
        "window.webkitSpeechRecognition": SpeechRecognition,
        "window.webkitSpeechRecognitionError": SpeechRecognitionError,
        "window.webkitSpeechRecognitionEvent": SpeechRecognitionEvent,
      },
    };
  }

  mockWebSQLAPI() {
    class SQLError extends Error {}
    function maybeCallErrorCallback(e) {
      const cb = e && e.handleEvent || e || false;
      if (cb) {
        cb(new SQLError("unknown error"));
      }
    }
    class SQLTransaction {
      get [Symbol.toStringTag]() { return "SQLTransaction"; }
      executeSql(sql, params, c, e) { maybeCallErrorCallback(e); }
    }
    class Database {
      constructor(version) { this.version = version; }
      get [Symbol.toStringTag]() { return "Database"; }
      transaction(c) { c(new SQLTransaction()); }
      readTransaction(c) { c(new SQLTransaction()); }
      changeVersion(o, n, c, e) { maybeCallErrorCallback(e); }
    }
    this.mocks.WebSQL = {
      haveNativeSupport: !!window.openDatabase,
      hooks: {
        "window.__proto__.openDatabase": function(n, v, d, c) { c(new Database(v)); },
      },
    };
  }
}
