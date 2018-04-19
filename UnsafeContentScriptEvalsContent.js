/* this source code form is subject to the terms of the mozilla public
 * license, v. 2.0. if a copy of the mpl was not distributed with this
 * file, you can obtain one at http://mozilla.org/mpl/2.0/. */

"use strict";

function BlockUnsafeEvals(url, CSP, AllowEvalsToken) {
  window.eval(`(function(CSP, AllowEvalsToken) {
    const ErrorSource = "call to eval() or related function blocked by CSP";
    const ErrorMessage = "Content Security Policy: The page’s settings blocked the loading of a resource at self (“$DIRECTIVE$”). Source: " + ErrorSource + ".";
    const ExceptionMessage = "call to $NAME$() blocked by CSP";
    const EventSampleProperty = "call to eval() or related function blocked by CSP";

    function sendCSPReport(reportURI, report) {
      let headers = {
        type: "application/csp-report",
      };
      let blob = new Blob([JSON.stringify(report)], headers);
      try {
        navigator.sendBeacon(reportURI, blob);
      } catch(e) {}
    }

    let AllowEvalsTokenWithComment = "//" + AllowEvalsToken;

    function shouldAllowAnyway(str) {
      return AllowEvalsTokenWithComment === str.substring(str.length - AllowEvalsTokenWithComment.length);
    }

    let referrer = document.referrer;
    let reportURI = (CSP.originalPolicy.match(/report-uri ([^;]*)/i) || [])[1];

    for (const name of ["eval", "Function", "execScript", "setTimeout",
                        "setInterval", "setImmediate"]) {
      let desc = Object.getOwnPropertyDescriptor(window, name);
      if (desc) {
        let oldValue = desc.value;
        desc.value = function() {
          let paramToCheck = name === "Function" ? arguments[arguments.length-1] : arguments[0];
          if (typeof paramToCheck === "string" && !shouldAllowAnyway(paramToCheck)) {
            let init = Object.assign(CSP, {
              bubbles: true,
              composed: true,
              blockedURI: "self",
              sample: EventSampleProperty,
              type: "unsafe-eval",
            });
            let evt = new SecurityPolicyViolationEvent("securitypolicyviolation", init);
            document.dispatchEvent(evt);

            console.error(ErrorMessage.replace("$DIRECTIVE$", CSP.violatedDirective));

            // Prepare an exception with the correct stack trace info (stripping the
            // first line, which is us).
            let ex = new Error(ExceptionMessage.replace("$NAME$", name));
            ex.stack = ex.stack.replace(/.*?[\\n$]/m, "");
            let info = ex.stack.split("\\n")[0].match(/@(.*):(\\d.*):(\\d.*)$/);
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
          return oldValue.apply(this, arguments);
        };
        Object.defineProperty(window, name, desc);
      }
    }
  })(${JSON.stringify(CSP)}, ${JSON.stringify(AllowEvalsToken)});`);
  browser.runtime.sendMessage({unregisterFor: url});
}
