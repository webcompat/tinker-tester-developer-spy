/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global browser */

function BlockUnsafeEvals(url, CSP, reportOnlyCSP, AllowEvalsToken, sendCSPReports = true) {
  function pageScript(CSP, reportOnlyCSP, AllowEvalsToken) {
    const ErrorSource = "call to eval() or related function blocked by CSP";
    const ErrorMessage = `Content Security Policy: The page’s settings blocked the loading of a resource at self (“$DIRECTIVE$”). Source: ${ErrorSource}.`;
    const ExceptionMessage = "call to $NAME$() blocked by CSP";
    const EventSampleProperty = "call to eval() or related function blocked by CSP";

    function sendCSPReport(reportURI, report) {
      if (window.UnsafeContentScriptEvalsBlockReports ) {
        console.warn("Not sending CSP report", report);
        return;
      }
      const headers = {
        type: "application/csp-report",
      };
      const blob = new Blob([JSON.stringify(report)], headers);
      try {
        navigator.sendBeacon(reportURI, blob);
      } catch (e) {}
    }

    const AllowEvalsTokenWithComment = `//${AllowEvalsToken}`;

    function shouldAllowAnyway(str) {
      return AllowEvalsTokenWithComment === str.substring(str.length - AllowEvalsTokenWithComment.length);
    }

    const referrer = document.referrer;

    function handleCSPForEval(CSP, reportURI, reportOnly) {
      const init = Object.assign(CSP, {
        bubbles: true,
        composed: true,
        blockedURI: "self",
        sample: EventSampleProperty,
        type: "unsafe-eval",
      });

      if (!reportOnly) {
        const evt = new SecurityPolicyViolationEvent("securitypolicyviolation", init);
        document.dispatchEvent(evt);
      }

      console.error(ErrorMessage.replace("$DIRECTIVE$", CSP.violatedDirective));

      // Prepare an exception with the correct stack trace info (stripping the
      // first line, which is us).
      const ex = new Error(ExceptionMessage.replace("$NAME$", name));
      ex.stack = ex.stack.replace(/.*?[\\n$]/m, "");
      const info = ex.stack.split("\\n")[0].match(/@(.*):(\\d.*):(\\d.*)$/);
      ex.fileName = info ? info[1] : undefined;
      ex.lineNumber = info ? parseInt(info[2]) : undefined;
      ex.columnNumber = info ? parseInt(info[3]) : undefined;

      if (reportURI) {
        sendCSPReport(reportURI, {
          "blocked-uri": CSP.blockedURI,
          "document-uri": CSP.documentURI,
          "source-file": ex.fileName,
          "line-number": ex.lineNumber,
          "script-sample": ErrorSource,
          "referrer": referrer,
          "violated-directive": CSP.violatedDirective,
          "original-policy": CSP.originalPolicy,
        });
      }

      if (CSP.disposition === "enforce") {
        throw ex;
      }
    }

    function getReportURI(CSP) {
      return CSP ? (CSP.originalPolicy.match(/report-uri ([^;]*)/i) || [])[1] : undefined;
    }

    // TODO: should we really prefer the report URI for report-only, or regular?
    const reportURI = getReportURI(reportOnlyCSP) || getReportURI(CSP);

    for (const name of ["eval", "execScript", "Function", "setTimeout",
                        "setInterval", "setImmediate"]) {
      const desc = Object.getOwnPropertyDescriptor(window, name);
      if (desc) {
        const oldValue = desc.value;
        desc.value = function() {
          const paramToCheck = name === "Function" ? arguments[arguments.length - 1] : arguments[0];
          const needsCheck = name === "eval" || name === "Function" ||
                             (typeof paramToCheck === "string" && !shouldAllowAnyway(paramToCheck));
          if (needsCheck && !handleCSPForEval(CSP || reportOnlyCSP, reportURI, !!CSP)) {
            return undefined;
          }
          return oldValue.apply(this, arguments);
        };
        Object.defineProperty(window, name, desc);
      }
    }
  }

  // eslint-disable-next-line no-eval
  window.eval(`(${pageScript})(${JSON.stringify(CSP)},
                               ${JSON.stringify(reportOnlyCSP)},
                               ${JSON.stringify(AllowEvalsToken)});`);

  browser.runtime.sendMessage({unregisterFor: url});
}
