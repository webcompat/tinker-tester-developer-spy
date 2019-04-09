/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This script is guaranteed to run before any page-scripts do, but there is no
// way for the background script to pass it the configuration the user wants to
// use to set up the page-script environment, before page scripts might run.
//
// That's because the only way to influence the page script is by injecting
// <script> element, and there is no guarantee it will run before any of the
// page's other <script> elements (and indeed, inline scripts will run earlier).
//
// To work around this, we use a MutationObserver to "passivize" the base HTML
// document as it loads, by changing each <script>'s type to a non-running one,
// and similarly changing all onload-type attributes to a neutral one. Then,
// once we get the DOMContentLoaded signal, and our information from the back-
// ground script, we can use document.open() and document.write() the original
// HTML for a do-over of the document load.

// This works in Chrome because the window environment is NOT reset along with
// the document, and so the "new" version of the document will load seeing our
// pre-altered window environment. That is, it will see the expected readyStates,
// DOMContentLoadeds, and so on without us having to expect extra effort.
//
// This of course causes the final page-load to slow down and display a blank
// page while the initial HTML is being collected, but without a better method
// for seeding the initial content script with tab-specific values, we're stuck.

/* global CreateOverriderPageScript, ElementDetector, ElementCreationDetector,
          ElementStyleListener, EventListenerManager, FunctionBindProxy,
          GeolocationOverrider, LanguageOverrider, makeUUID, Messages,
          MockObjects, Tinker, UserAgentOverrider, XHRAndFetchObserver */

navigator.serviceWorker.getRegistrations().then(registrations => {
  for (const reg of registrations) {
    reg.unregister();
  }
});
const UUID = makeUUID();

const port = chrome.runtime.connect({name: "ContentScript"});

function promiseGetConfig() {
  return new Promise(resolve => {
    const listener = message => {
      if (message.tabConfig) {
        port.onMessage.removeListener(listener);
        resolve(message.tabConfig);
      }
    };
    port.onMessage.addListener(listener);
    port.postMessage("getTabConfig");
  });
}

const promiseDocumentPassivelyLoaded = new Promise((resolve, reject) => {
  // If the document is already loaded, we can't do much here, so just reject.
  if (document.readyState !== "loading") {
    reject();
    return;
  }

  const PassivizingSlugRE1 = new RegExp(` type="${UUID}fake"`, "g");
  const PassivizingSlugRE2 = new RegExp(`${UUID}type`, "g");
  const PassivizingSlugRE3 = new RegExp(`onload${UUID}`, "g");
  const PassivizingSlugRE4 = new RegExp(`nonce${UUID}`, "g");
  const PassivizingSlugRE5 = new RegExp(`${UUID}preload`, "g");

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const {addedNodes = [], type} = mutation;
      if (type === "childList" && addedNodes) {
        for (const node of addedNodes) {
          if (node.nodeName === "SCRIPT") {
            if (node.type) {
              node.type = `${UUID}type${node.type}`;
            } else {
              node.type = `${UUID}fake`;
            }
          }
          if (node.nodeName === "LINK" && node.rel === "preload") {
            node.rel = `${UUID}${node.rel}`;
          }
          if (node.nonce) {
            node.setAttribute(`nonce${UUID}`, node.nonce);
            node.removeAttribute("nonce");
          }
          const loadAttr = node.getAttribute && node.getAttribute("onload");
          if (loadAttr) {
            node.setAttribute(`onload${UUID}`, loadAttr);
            node.removeAttribute("onload");
          }
        }
      }
    }
  });
  observer.observe(document, {
    childList: true,
    subtree: true
  });
  // Ensure that onload events are cancelled
  const opts = {
    once: true,
    capture: true,
  };
  window.addEventListener("load", event => {
    event.stopImmediatePropagation();
  }, opts);
  document.addEventListener("DOMContentLoaded", event => {
    event.stopImmediatePropagation();
    observer.disconnect();
    resolve(document.documentElement.outerHTML
                    .replace(PassivizingSlugRE1, "")
                    .replace(PassivizingSlugRE2, "")
                    .replace(PassivizingSlugRE3, "onload")
                    .replace(PassivizingSlugRE4, "nonce")
                    .replace(PassivizingSlugRE5, "preload"));
  }, opts);
});

function sendChangesToTinkerInstance(UUID, changes) {
  if (this[UUID] && this[UUID].change) {
    this[UUID].change(changes);
  }
}

function shutdownTinkerInstance(UUID) {
  if (this[UUID] && this[UUID].shutdown) {
    this[UUID].shutdown();
  }
}

function sendMessageToTinker(msgFn, msg) {
  // TODO: make it so the page (and our own hooks) don't detect this script tag.
  const script = document.createElement("script");
  script.innerText = `(${msgFn})(${JSON.stringify(UUID)}, ${JSON.stringify(msg)})`;
  document.documentElement.appendChild(script);
  document.documentElement.removeChild(script);
}

port.onDisconnect.addListener(() => {
  // If the addon is uninstalled/updated/reloaded, then Chrome will
  // disconnect the port from its background script. We should clean
  // our Tinker instance now, so a new instance can be safely started
  // with updated code if/when the addon restarts.
  sendMessageToTinker(shutdownTinkerInstance);
});

function promiseInjectTinker(initialConfig) {
  // We inject using a <script> tag, and wait for Tinker to tell us it
  // has loaded with a window event telling us its instanceId.
  return new Promise(resolve => {
    const onTinkerReady = event => {
      const {tinkerInstanceId, preexistingTabConfig} = event.data;
      if (event.source === window && tinkerInstanceId) {
        window.removeEventListener("message", onTinkerReady, true);
        window.addEventListener("message", msg => {
          if (msg.source === window && msg.data[UUID]) {
            // Only pass along our own messages to the background script.
            port.postMessage(msg.data[UUID]);
          }
        }, true);
        if (preexistingTabConfig) {
          port.postMessage({preexistingTabConfig});
        }
        resolve();
      }
    };
    window.addEventListener("message", onTinkerReady, true);

    // Create the <script> tag, which set up a Tinker object on the window
    // at the expected place and then signal that it's done.
    const script = document.createElement("script");
    script.innerText = `(function(initialConfig) {
      const Messages = ${JSON.stringify(Messages)};
      ${MockObjects}
      ${ElementCreationDetector}
      ${ElementDetector}
      ${ElementStyleListener}
      ${EventListenerManager}
      ${FunctionBindProxy}
      ${GeolocationOverrider}
      ${LanguageOverrider}
      ${UserAgentOverrider}
      ${XHRAndFetchObserver}
      ${Tinker}
      const overrider = (${CreateOverriderPageScript})(this);
      const tinker = new Tinker(overrider, this, initialConfig);
      const result = {tinkerInstanceId: tinker.instanceId};
      if (tinker.upgraded) {
        result.preexistingTabConfig = tinker.config;
      }
      window.postMessage(result, "*");
    })(${JSON.stringify(initialConfig)})`;
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);

    // Proxy messages from the page script back to the background script.
    window.addEventListener("message", msg => {
      if (msg.source === window && msg.data[UUID]) {
        // Only pass along our own messages to the background script.
        port.postMessage(msg.data[UUID]);
      }
    }, true);

    // Proxy messages from the background script to the page script.
    port.onMessage.addListener(msg => {
      if (msg.tabConfig) {
        sendMessageToTinker(sendChangesToTinkerInstance, msg.tabConfig);
      }
    });
  });
}

const configPromise = promiseGetConfig();
promiseDocumentPassivelyLoaded.then(async outerHTML => {
  // If the document was loading, we will have passivized the load.
  // We need to start Tinker up and re-write the document in from
  // scratch so it loads after Tinker does.
  document.documentElement.innerHTML = "";
  await promiseInjectTinker(await configPromise);
  document.open("text/html", "replace");
  document.write(outerHTML); // eslint-disable-line no-unsanitized/method
  document.close();
  // We need to "update" the <style> tags, or Chrome may not apply them.
  document.documentElement.querySelectorAll("style").forEach(style => {
    const text = style.innerText;
    if (text) {
      style.innerText = `${text} `;
    }
  });
}, async () => {
  // If the document was already loaded, we just have to inject
  // Tinker (it will check if there was an old instance already
  // present with the same UUID).
  promiseInjectTinker(await configPromise);
});
