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
  Hide: browser.i18n.getMessage("popupHide"),
  Ignore: browser.i18n.getMessage("popupIgnore"),
};

let ActiveTabConfig = {};

const portToBGScript = (function() {
  let port;

  const panelType = location.hash.substr(1) || "pageAction";

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
  const li = e.target.closest("li");
  if (li) {
    option = li.getAttribute("data-option");
  }

  if (e.target.nodeName === "BUTTON") {
    const action = e.target.getAttribute("data-action");
    if (action === "unset") {
      const name = e.target.getAttribute("data-name");
      const relatedLI = document.querySelector(`[data-option="${name}"]`);
      const changes = {};
      changes[name] = {enabled: false};
      relatedLI.classList.remove("selected");
      removeUnsetButton(relatedLI);
      applyChanges(changes);
    } else {
      const name = document.querySelector(".details").getAttribute("data-for-list-item");
      const relatedLI = document.querySelector(`[data-option="${name}"]`);
      const changes = {};
      const info = changes[name] = {};
      if (action === "apply") {
        const uservals = document.querySelectorAll(".details .uservalue");
        info.enabled = false;
        if (uservals.length) {
          info.values = {};
          for (const userval of uservals) {
            const inputs = userval.querySelectorAll("input");
            const setting = inputs[0].value;
            const value = inputs[1].value;
            const type = (userval.querySelector("select") || {}).value;
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
        for (const input of document.querySelectorAll(".details input[data-pref]")) {
          info.enabled = true;
          info[input.getAttribute("data-pref")] = input.value;
        }
        for (const sel of document.querySelectorAll(".details select")) {
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
        for (const cb of document.querySelectorAll(".details input[type='checkbox']")) {
          if (!info.flags) { info.flags = {}; }
          info.flags[cb.name] = cb.checked;
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
  const list = document.querySelector(".list");

  const frag = document.createDocumentFragment();

  const h = document.createElement("h1");
  h.appendChild(document.createTextNode(Messages.AvailableHooks));
  frag.appendChild(h);

  if (tabConfig === false) {
    list.innerHTML = "";
    const i = document.createElement("i");
    i.appendChild(document.createTextNode(Messages.UnavailableForAboutPages));
    frag.appendChild(i);
    list.appendChild(frag);
    return;
  }

  const ol = document.createElement("ol");
  frag.appendChild(ol);

  tabConfig = tabConfig || {};
  for (const [name, hook] of Object.entries(ScriptOverrideHooks)) {
    if (hook.type === "checkbox") {
      maybeAddCheckbox(name, ol, tabConfig);
      continue;
    }

    const li = document.createElement("li");
    li.setAttribute("data-option", name);
    ol.appendChild(li);

    const label = document.createElement("span");
    const msg = browser.i18n.getMessage(`hookLabel${name}`);
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
  const hook = ScriptOverrideHooks[hookName];
  if (!hook) {
    return;
  }

  const li = document.createElement("li");
  ol.appendChild(li);
  const cb = document.createElement("input");
  cb.id = hookName;
  cb.type = "checkbox";
  const config = tabConfig[hookName];
  if (config && config.enabled) {
    cb.checked = true;
  }
  cb.addEventListener("change", () => {
    if (!tabConfig[hookName]) tabConfig[hookName] = {};
    tabConfig[hookName].enabled = !tabConfig[hookName].enabled;

    const enabled = tabConfig[hookName].enabled;
    const changes = {};
    changes[hookName] = {enabled};
    applyChanges(changes);
  });

  li.appendChild(cb);
  const label = document.createElement("label");
  label.setAttribute("for", hookName);
  const msg = browser.i18n.getMessage(`hookLabel${hookName}`);
  label.appendChild(document.createTextNode(msg));
  li.appendChild(label);
}

function addUnsetButton(li, name) {
  if (li.querySelector("[data-action=unset]")) {
    return;
  }
  const button = document.createElement("button");
  button.setAttribute("data-action", "unset");
  button.setAttribute("data-name", name);
  button.appendChild(document.createTextNode(Messages.UnsetHook));
  li.appendChild(button);
}

function removeUnsetButton(li) {
  const button = li.querySelector("[data-action=unset]");
  if (button) {
    button.remove();
  }
}

function addSelectActionCell(name, tr, initialValue, addIgnoreOption = false,
                             addHideOption = false) {
  const td = document.createElement("td");
  tr.appendChild(td);
  const sel = document.createElement("select");
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

  if (addHideOption) {
    opt = document.createElement("option");
    opt.setAttribute("value", "hide");
    if (initialValue === "hide") {
      opt.setAttribute("selected", true);
    }
    opt.appendChild(document.createTextNode(Messages.Hide));
    sel.appendChild(opt);
  }

  return sel;
}

function syncUserValueSelectorType(userval, definition) {
  if (definition.types) {
    const inp = userval.querySelectorAll("input")[1];
    inp.type = definition.types[userval.querySelector("select").value].type;
  }
}

function addUserValueSelector(table, definition, uvType, uvName, uvValue) {
  const tr = document.createElement("tr");
  tr.classList.add("uservalue");
  table.appendChild(tr);
  tr.addEventListener("change", e => {
    const userval = e.target.closest(".uservalue");
    if (!userval) {
     return;
    }
    if (e.target.nodeName === "SELECT") {
      syncUserValueSelectorType(userval, definition);
    } else {
      const isLastUserval = userval.matches(":last-child");
      const emptyInputCount = userval.querySelectorAll("input:placeholder-shown").length;
      if (isLastUserval && !emptyInputCount) {
        setTimeout(() => {
          addUserValueSelector(table, definition);
        }, 100);
      } else if (!isLastUserval && emptyInputCount === 2) {
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
    const sel = document.createElement("select");
    sel.setAttribute("data-type", "userValueType");
    td.appendChild(sel);
    for (const [type, {label}] of Object.entries(definition.types)) {
      const opt = document.createElement("option");
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
  const hook = ScriptOverrideHooks[option];

  const optConfig = ActiveTabConfig[option] || {};
  const isActive = !!optConfig.enabled;

  const details = document.querySelector(".details");
  details.setAttribute("data-for-list-item", option);

  const frag = document.createDocumentFragment();

  const label = document.createElement("p");
  const msg = browser.i18n.getMessage(`hookLabel${option}`);
  label.appendChild(document.createTextNode(msg));
  frag.appendChild(label);

  const uservaldefs = hook.userValues;
  if (uservaldefs) {
    const table = document.createElement("table");
    frag.appendChild(table);
    const uservals = optConfig.values || {};
    if (Object.keys(uservals).length) {
      for (const [type, valuesForType] of Object.entries(uservals)) {
        for (const [name, value] of Object.entries(valuesForType)) {
          addUserValueSelector(table, uservaldefs, type, name, value);
        }
      }
    }
    addUserValueSelector(table, uservaldefs);
  }

  const opts = hook.options || {};
  for (const name of Object.keys(opts)) {
    const inp = document.createElement("input");
    inp.setAttribute("data-pref", name);
    inp.placeholder = opts[name];
    inp.type = "text";
    inp.value = optConfig[name] || "";
    frag.appendChild(inp);
  }

  const overrides = Object.keys(hook.overrides || {});
  if (overrides.length) {
    const initialValue = optConfig.selected;
    const sel = document.createElement("select");
    sel.setAttribute("data-type", "overrides");
    frag.appendChild(sel);
    for (const name of overrides) {
      const opt = document.createElement("option");
      opt.setAttribute("value", name);
      if (initialValue === name) {
        opt.setAttribute("selected", true);
      }
      const msg = browser.i18n.getMessage(name);
      opt.appendChild(document.createTextNode(msg));
      sel.appendChild(opt);
    }
  }

  const cbs = Object.entries(hook.callbacks || {});
  if (cbs.length) {
    const table = document.createElement("table");
    frag.appendChild(table);
    for (const [name, opts] of cbs) {
      const config = optConfig[name];
      const label = opts.label || opts;
      const addIgnoreOption = opts.allowIgnore || false;
      const addHideOption = opts.allowHide || false;

      const tr = document.createElement("tr");
      table.appendChild(tr);

      const td = document.createElement("td");
      tr.appendChild(td);
      td.appendChild(document.createTextNode(label));

      const sel = addSelectActionCell(name, tr, config, addIgnoreOption, addHideOption);
      sel.setAttribute("data-type", "callback");
    }
  }

  const props = hook.properties || [];
  const methods = hook.methods || [];
  if (props.length || methods.length) {
    const table = document.createElement("table");
    frag.appendChild(table);
    for (const name of methods) {
      const tr = document.createElement("tr");
      table.appendChild(tr);

      const td = document.createElement("td");
      tr.appendChild(td);
      td.appendChild(document.createTextNode(name + "()"));

      const config = (optConfig.methods || {})[name];
      const sel = addSelectActionCell(name, tr, config, true, true);
      sel.setAttribute("data-type", "method");
    }
    for (const name of props) {
      const tr = document.createElement("tr");
      table.appendChild(tr);

      const td = document.createElement("td");
      tr.appendChild(td);
      td.appendChild(document.createTextNode(name));

      const config = (optConfig.properties || {})[name];
      const sel = addSelectActionCell(name, tr, config, false, true);
      sel.setAttribute("data-type", "property");
    }
  }

  if (hook.flags) {
    addFlags(hook.flags, frag, optConfig);
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
    const q = document.createElement("blockquote");
    q.appendChild(document.createTextNode(hook.note));
    frag.appendChild(q);
  }

  details.innerHTML = "";
  details.appendChild(frag);
}

function addFlags(flags, frag, optConfig) {
  for (const [name, msg] of Object.entries(flags)) {
    const div = document.createElement("div");
    frag.appendChild(div);
    const cb = document.createElement("input");
    cb.id  = name;
    cb.name = name;
    cb.type = "checkbox";
    if (optConfig.flags && optConfig.flags[name]) {
      cb.checked = true;
    }
    div.appendChild(cb);
    const label = document.createElement("label");
    label.setAttribute("for", name);
    label.appendChild(document.createTextNode(msg));
    div.appendChild(label);
  }
}
