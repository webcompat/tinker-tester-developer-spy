/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser, redrawList, redrawDetails */

const IsAndroid = navigator.userAgent.includes("Android");

function redraw(data) {
  redrawList(data);

  const forListItem = document.querySelector(".details").getAttribute("data-for-list-item");
  if (forListItem) {
    redrawDetails(forListItem);
  }
}

function drillDownIntoDetails(config) {
  redrawDetails(config);

  const container = document.querySelector("section");
  const oldScrollTop = document.scrollingElement.scrollTop;
  container.setAttribute("data-oldScrollTop", oldScrollTop);

  slideViewRight();
}

function goBackToList() {
  slideViewBackLeft().then(() => {
    document.querySelector(".details").removeAttribute("data-for-list-item");
    restoreScrollTop();
  });
}

function slideViewRight() {
  const list = document.querySelector(".list");
  const details = document.querySelector(".details");

  details.style.position = "relative";
  details.style.left = list.clientWidth + "px";

  list.style.pointerEvents = "none";
  list.style.position = "absolute";
  list.style.maxHeight = details.scrollHeight + "px";
  list.style.overflow = "hidden";

  const container = document.querySelector("section");
  container.addEventListener("transitionend", () => {
    list.style.display = "none";
  }, {once: true});

  const shift = details.getBoundingClientRect().left - 2;
  container.style.transform = "translateX(-" + shift + "px)";
}

function slideViewBackLeft() {
  const list = document.querySelector(".list");
  const details = document.querySelector(".details");

  details.style.position = "";
  details.style.left = "";

  list.style.pointerEvents = "";
  list.style.position = "";
  list.style.maxHeight = "";
  list.style.overflow = "";
  list.style.display = "";

  const container = document.querySelector("section");
  return new Promise(resolve => {
    container.addEventListener("transitionend", () => {
      details.innerHTML = "";
      resolve();
    }, {once: true});
    container.style.transform = "";
  });
}

function restoreScrollTop() {
  const container = document.querySelector("section");
  const oldScrollTop = container.getAttribute("data-oldScrollTop");
  container.removeAttribute("data-oldScrollTop");
  document.scrollingElement.scrollTop = oldScrollTop;
}

