(() => {
  "use strict";

  function start() {
    if (window.ResponseCollectorQwen?.isSupportedPage()) {
      window.ResponseCollectorQwen.start();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
