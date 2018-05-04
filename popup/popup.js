/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, drillDownIntoDetails, goBackToList,
          redraw, ScriptOverrideHooks, IsAndroid */

const Messages = {
  AvailableHooks: browser.i18n.getMessage("popupAvailableHooks"),
  ApplyHook: browser.i18n.getMessage("popupApplyHook"),
  UpdateHook: browser.i18n.getMessage("popupUpdateHook"),
  DisableHook: browser.i18n.getMessage("popupDisableHook"),
  UnsetHook: browser.i18n.getMessage("popupUnsetHook"),
  Cancel: browser.i18n.getMessage("popupCancel"),
  UnavailableForAboutPages: browser.i18n.getMessage("popupUnavailableForAboutPages"),
  DoNothing: browser.i18n.getMessage("popupDoNothing"),
  LogStackTrace: browser.i18n.getMessage("popupLogStackTrace"),
  StartDebugger: browser.i18n.getMessage("popupStartDebugger"),
  Ignore: browser.i18n.getMessage("popupIgnore"),
};

let ActiveTabConfig = {};

const portToBGScript = (function() {
  let port;

  let panelType = location.hash.substr(1) || "pageAction";

  function connect() {
    port = browser.runtime.connect({name: `${panelType}Port`});
    port.onMessage.addListener(onMessageFromBGScript);
    port.onDisconnect.addListener(e => {
      port = undefined;
    });
  }

  connect();

  async function send(message) {
    if (port) {
      return port.postMessage(message);
    }
    return Promise.reject("background script port disconnected");
  }

  return {send};
}());

function applyChanges(changes) {
  if (Object.keys(changes).length) {
    portToBGScript.send(
      {tabConfigChanges: changes},
      newActiveTabConfig => {
        ActiveTabConfig = newActiveTabConfig;
        if (!IsAndroid) {
          // this.close();
        }
      }
    );
  } else if (!IsAndroid) {
    // this.close();
  }
}

function onMessageFromBGScript(message) {
console.log(location.hash, message)
  if (message === "activeTabChanged") {
    onActiveTabChanged();
  } else if (message.tabConfig !== undefined) {
    ActiveTabConfig = message.tabConfig;
    redraw(ActiveTabConfig);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  onActiveTabChanged();
  document.body.addEventListener("click", handleClick);
});

function onActiveTabChanged() {
  portToBGScript.send("getActiveTabConfig");
}

function handleClick(e) {
  let option;
  let li = e.target.closest("li");
  if (li) {
    option = li.getAttribute("data-option");
  }

  if (e.target.nodeName === "BUTTON") {
    let action = e.target.getAttribute("data-action");
    if (action === "unset") {
      let name = e.target.getAttribute("data-name");
      let relatedLI = document.querySelector(`[data-option="${name}"]`);
      let changes = {};
      changes[name] = {enabled: false};
      relatedLI.classList.remove("selected");
      removeUnsetButton(relatedLI);
      applyChanges(changes);
    } else {
      let name = document.querySelector(".details").getAttribute("data-for-list-item");
      let relatedLI = document.querySelector(`[data-option="${name}"]`);
      let changes = {};
      let info = changes[name] = {};
      if (action === "apply") {
        let uservals = document.querySelectorAll(".details .uservalue");
        info.enabled = false;
        if (uservals.length) {
          info.values = {};
          for (let userval of uservals) {
            let inputs = userval.querySelectorAll("input");
            let setting = inputs[0].value;
            let value = inputs[1].value;
            let type = (userval.querySelector("select") || {}).value;
            if (setting && value) {
              if (type !== undefined) {
                if (!info.values[type]) {
                  info.values[type] = {};
                }
                info.values[type][setting] = value;
              } else {
                info.values[setting] = value;
              }
            }
          }
          if (Object.keys(info.values).length) {
            info.enabled = true;
          }
        }
        for (let input of document.querySelectorAll(".details input[data-pref]")) {
          info.enabled = true;
          info[input.getAttribute("data-pref")] = input.value;
        }
        for (let sel of document.querySelectorAll(".details select")) {
          switch (sel.getAttribute("data-type")) {
            case "callback":
              info.enabled = true;
              info[sel.name] = sel.value;
              break;
            case "overrides":
              info.enabled = true;
              info.selected = sel.value;
              info.overrides = ScriptOverrideHooks.UserAgentOverrides.overrides[sel.value];
              break;
            case "method":
              info.enabled = true;
              if (!info.methods) { info.methods = {}; }
              info.methods[sel.name] = sel.value;
              break;
            case "property":
              info.enabled = true;
              if (!info.properties) { info.properties = {}; }
              info.properties[sel.name] = sel.value;
              break;
          }
        }
        if (info.enabled) {
          relatedLI.classList.add("selected");
          addUnsetButton(relatedLI, name);
        }
      } else {
        info.enabled = false;
        relatedLI.classList.remove("selected");
        removeUnsetButton(relatedLI);
      }
      applyChanges(changes);
      goBackToList();
    }
  } else if (option) {
    drillDownIntoDetails(option);
  }
}

function redrawList(tabConfig = {}) {
  let list = document.querySelector(".list");

  let frag = document.createDocumentFragment();

  let h = document.createElement("h1");
  h.appendChild(document.createTextNode(Messages.AvailableHooks));
  frag.appendChild(h);

  if (tabConfig === false) {
    list.innerHTML = "";
    let i = document.createElement("i");
    i.appendChild(document.createTextNode(Messages.UnavailableForAboutPages));
    frag.appendChild(i);
    list.appendChild(frag);
    return;
  }

  let ol = document.createElement("ol");
  frag.appendChild(ol);

  tabConfig = tabConfig || {};
  for (let [name, hook] of Object.entries(ScriptOverrideHooks)) {
    if (hook.type === "checkbox") {
      maybeAddCheckbox(name, ol, tabConfig);
      continue;
    }

    let li = document.createElement("li");
    li.setAttribute("data-option", name);
    ol.appendChild(li);

    let label = document.createElement("span");
    let msg = browser.i18n.getMessage(`hookLabel${name}`);
    label.appendChild(document.createTextNode(msg));
    li.appendChild(label);

    if (tabConfig[name] && tabConfig[name].enabled) {
      li.classList.add("selected");
      addUnsetButton(li, name);
    }
  }

  list.innerHTML = "";
  list.appendChild(frag);
}

function maybeAddCheckbox(hookName, ol, tabConfig) {
  let hook = ScriptOverrideHooks[hookName];
  if (!hook) {
    return;
  }

  let li = document.createElement("li");
  ol.appendChild(li);
  let cb = document.createElement("input");
  cb.id = hookName;
  cb.type = "checkbox";
  let config = tabConfig[hookName];
  if (config && config.enabled) {
    cb.checked = true;
  }
  cb.addEventListener("change", () => {
    if (!tabConfig[hookName]) tabConfig[hookName] = {};
    tabConfig[hookName].enabled = !tabConfig[hookName].enabled;

    let enabled = tabConfig[hookName].enabled;
    let changes = {};
    changes[hookName] = {enabled};
    applyChanges(changes);
  });

  li.appendChild(cb);
  let label = document.createElement("label");
  label.setAttribute("for", hookName);
  let msg = browser.i18n.getMessage(`hookLabel${hookName}`);
  label.appendChild(document.createTextNode(msg));
  li.appendChild(label);
}

function addUnsetButton(li, name) {
  if (li.querySelector("[data-action=unset]")) {
    return;
  }
  let button = document.createElement("button");
  button.setAttribute("data-action", "unset");
  button.setAttribute("data-name", name);
  button.appendChild(document.createTextNode(Messages.UnsetHook));
  li.appendChild(button);
}

function removeUnsetButton(li) {
  let button = li.querySelector("[data-action=unset]");
  if (button) {
    button.remove();
  }
}

function addSelectActionCell(name, tr, initialValue, addIgnoreOption = false) {
  let td = document.createElement("td");
  tr.appendChild(td);
  let sel = document.createElement("select");
  sel.name = name;
  td.appendChild(sel);

  let opt = document.createElement("option");
  opt.setAttribute("value", "nothing");
  if (initialValue === "nothing") {
    opt.setAttribute("selected", true);
  }
  opt.appendChild(document.createTextNode(Messages.DoNothing));
  sel.appendChild(opt);

  opt = document.createElement("option");
  opt.setAttribute("value", "log stack trace");
  if (initialValue === "log stack trace") {
    opt.setAttribute("selected", true);
  }
  opt.appendChild(document.createTextNode(Messages.LogStackTrace));
  sel.appendChild(opt);

  opt = document.createElement("option");
  opt.setAttribute("value", "start debugger");
  if (initialValue === "start debugger") {
    opt.setAttribute("selected", true);
  }
  opt.appendChild(document.createTextNode(Messages.StartDebugger));
  sel.appendChild(opt);

  if (addIgnoreOption) {
    opt = document.createElement("option");
    opt.setAttribute("value", "ignore");
    if (initialValue === "ignore") {
      opt.setAttribute("selected", true);
    }
    opt.appendChild(document.createTextNode(Messages.Ignore));
    sel.appendChild(opt);
  }

  return sel;
}

function syncUserValueSelectorType(userval, definition) {
  if (definition.types) {
    let inp = userval.querySelectorAll("input")[1];
    inp.type = definition.types[userval.querySelector("select").value].type;
  }
}

function addUserValueSelector(table, definition, uvType, uvName, uvValue) {
  let tr = document.createElement("tr");
  tr.classList.add("uservalue");
  table.appendChild(tr);
  tr.addEventListener("change", e => {
    let userval = e.target.closest(".uservalue");
    if (!userval) {
     return;
    }
    if (e.target.nodeName === "SELECT") {
      syncUserValueSelectorType(userval, definition);
    } else {
      let isLastUserval = userval.matches(":last-child");
      let emptyInputCount = userval.querySelectorAll("input:placeholder-shown").length;
      if (isLastUserval && !emptyInputCount) {
        setTimeout(() => {
          addUserValueSelector(table, definition);
        }, 100);
      } else if (!isLastUserval && emptyInputCount == 2) {
        userval.remove();
      }
    }
  });

  let td = document.createElement("td");
  tr.appendChild(td);
  let inp = document.createElement("input");
  inp.placeholder = definition.setting || "setting";
  inp.type = "text";
  inp.value = uvName || "";
  td.appendChild(inp);

  td = document.createElement("td");
  tr.appendChild(td);
  inp = document.createElement("input");
  inp.placeholder = definition.value || "value";
  inp.type = "text";
  inp.value = uvValue || "";
  td.appendChild(inp);

  if (definition.types) {
    td = document.createElement("td");
    tr.appendChild(td);
    let sel = document.createElement("select");
    sel.setAttribute("data-type", "userValueType");
    td.appendChild(sel);
    for (let [type, {label}] of Object.entries(definition.types)) {
      let opt = document.createElement("option");
      opt.setAttribute("value", type);
      if (uvType === type) {
        opt.setAttribute("selected", true);
      }
      opt.appendChild(document.createTextNode(label));
      sel.appendChild(opt);
    }
  }

  syncUserValueSelectorType(tr, definition);

  return tr;
}

function redrawDetails(option) {
  let hook = ScriptOverrideHooks[option];

  let optConfig = ActiveTabConfig[option] || {};
  let isActive = !!optConfig.enabled;

  let details = document.querySelector(".details");
  details.setAttribute("data-for-list-item", option);

  let frag = document.createDocumentFragment();

  let label = document.createElement("p");
  let msg = browser.i18n.getMessage(`hookLabel${option}`);
  label.appendChild(document.createTextNode(msg));
  frag.appendChild(label);

  let uservaldefs = hook.userValues;
  if (uservaldefs) {
    let table = document.createElement("table");
    frag.appendChild(table);
    let uservals = optConfig.values || {};
    if (Object.keys(uservals).length) {
      for (let [type, valuesForType] of Object.entries(uservals)) {
        for (let [name, value] of Object.entries(valuesForType)) {
          addUserValueSelector(table, uservaldefs, type, name, value);
        }
      }
    }
    addUserValueSelector(table, uservaldefs);
  }

  let opts = hook.options || {};
  for (let name of Object.keys(opts)) {
    let inp = document.createElement("input");
    inp.setAttribute("data-pref", name);
    inp.placeholder = opts[name];
    inp.type = "text";
    inp.value = optConfig[name] || "";
    frag.appendChild(inp);
  }

  let overrides = Object.keys(hook.overrides || {});
  if (overrides.length) {
    let initialValue = optConfig.selected;
    let sel = document.createElement("select");
    sel.setAttribute("data-type", "overrides");
    frag.appendChild(sel);
    for (let name of overrides) {
      let opt = document.createElement("option");
      opt.setAttribute("value", name);
      if (initialValue === name) {
        opt.setAttribute("selected", true);
      }
      let msg = browser.i18n.getMessage(name);
      opt.appendChild(document.createTextNode(msg));
      sel.appendChild(opt);
    }
  }

  let cbs = Object.entries(hook.callbacks || {});
  if (cbs.length) {
    let table = document.createElement("table");
    frag.appendChild(table);
    for (let [name, label] of cbs) {
      let config = optConfig[name];

      let tr = document.createElement("tr");
      table.appendChild(tr);

      let td = document.createElement("td");
      tr.appendChild(td);
      td.appendChild(document.createTextNode(label));

      let sel = addSelectActionCell(name, tr, config);
      sel.setAttribute("data-type", "callback");
    }
  }

  let props = hook.properties || [];
  let methods = hook.methods || [];
  if (props.length || methods.length) {
    let table = document.createElement("table");
    frag.appendChild(table);
    for (let name of methods) {
      let tr = document.createElement("tr");
      table.appendChild(tr);

      let td = document.createElement("td");
      tr.appendChild(td);
      td.appendChild(document.createTextNode(name + "()"));

      let config = (optConfig.methods || {})[name];
      let sel = addSelectActionCell(name, tr, config, true);
      sel.setAttribute("data-type", "method");
    }
    for (let name of props) {
      let tr = document.createElement("tr");
      table.appendChild(tr);

      let td = document.createElement("td");
      tr.appendChild(td);
      td.appendChild(document.createTextNode(name));

      let config = (optConfig.properties || {})[name];
      let sel = addSelectActionCell(name, tr, config);
      sel.setAttribute("data-type", "property");
    }
  }

  let button = document.createElement("button");
  button.setAttribute("data-action", "apply");
  button.appendChild(document.createTextNode(isActive ? Messages.UpdateHook
                                                      : Messages.ApplyHook));
  frag.appendChild(button);

  button = document.createElement("button");
  button.setAttribute("data-action", "disable");
  button.appendChild(document.createTextNode(isActive ? Messages.DisableHook
                                                      : Messages.Cancel));
  frag.appendChild(button);

  if (hook.note) {
    let q = document.createElement("blockquote");
    q.appendChild(document.createTextNode(hook.note));
    frag.appendChild(q);
  }

  details.innerHTML = "";
  details.appendChild(frag);
}
