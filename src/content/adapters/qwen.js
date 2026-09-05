(() => {
  "use strict";

  const SOURCE = "qwen";
  const ATTACHED_ATTRIBUTE = "data-response-collector-attached";
  const CONTROL_ATTRIBUTE = "data-response-collector-controls";
  const SELECTORS = [
    "[data-message-id]",
    "[data-message-role]",
    "[data-message-author-role]",
    "[data-role=assistant]",
    "[data-role=user]",
    "[data-testid*=message]",
    "[class*=message]",
    "[class*=Message]",
    "[class*=chat-item]",
    "[class*=ChatItem]",
    "[role=article]"
  ];
  const CONVERSATION_ROOT_SELECTORS = ["main", "[role=main]"];
  const EXPLICIT_ROLE_ATTRIBUTES = [
    "data-message-role",
    "data-message-author-role",
    "data-author-role",
    "data-sender-role",
    "data-role",
    "data-author",
    "data-sender"
  ];
  const BLOCK_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DIV",
    "DL",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "TR",
    "UL"
  ]);

  let observer = null;
  let scanTimer = null;
  let lastUrl = window.location.href;

  function isSupportedPage() {
    return window.location.hostname === "chat.qwen.ai";
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function roleFromValue(value) {
    const normalized = String(value || "").toLowerCase();
    if (/\b(assistant|bot|model|ai)\b/.test(normalized)) {
      return "assistant";
    }
    if (/\b(user|human|question)\b/.test(normalized)) {
      return "user";
    }
    return null;
  }

  function roleFromElement(element) {
    const explicitValues = EXPLICIT_ROLE_ATTRIBUTES
      .map((attribute) => element.getAttribute(attribute))
      .filter(Boolean);

    for (const value of explicitValues) {
      const role = roleFromValue(value);
      if (role) {
        return role;
      }
    }

    const descendant = element.querySelector(EXPLICIT_ROLE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(","));
    if (descendant) {
      for (const attribute of EXPLICIT_ROLE_ATTRIBUTES) {
        const role = roleFromValue(descendant.getAttribute(attribute));
        if (role) {
          return role;
        }
      }
    }

    const semanticValue = [
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.id,
      typeof element.className === "string" ? element.className : ""
    ].filter(Boolean).join(" ");
    return roleFromValue(semanticValue);
  }

  function renderText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = /** @type {HTMLElement} */ (node);
    if (element.tagName === "BR") {
      return "\n";
    }
    if (element.tagName === "PRE") {
      return `\n${element.textContent || ""}\n`;
    }

    const content = Array.from(element.childNodes).map(renderText).join("");
    return BLOCK_TAGS.has(element.tagName) ? `${content}\n` : content;
  }

  function cleanVisibleText(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll([
      `[${CONTROL_ATTRIBUTE}]`,
      "button",
      "[role=button]",
      "svg",
      "script",
      "style",
      "textarea",
      "input",
      "[aria-hidden=true]",
      "[role=toolbar]",
      "header",
      "nav"
    ].join(",")).forEach((node) => node.remove());

    return renderText(clone)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function candidateRank(element) {
    if (element.hasAttribute("data-message-id")) {
      return 100;
    }
    if (EXPLICIT_ROLE_ATTRIBUTES.some((attribute) => element.hasAttribute(attribute))) {
      return 90;
    }
    if (element.getAttribute("data-testid")?.toLowerCase().includes("message")) {
      return 80;
    }
    if (element.className && String(element.className).toLowerCase().includes("message")) {
      return 60;
    }
    return 50;
  }

  function sortDocumentOrder(candidates) {
    return candidates.sort((left, right) => {
      if (left.element === right.element) {
        return 0;
      }
      return left.element.compareDocumentPosition(right.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function getConversationRoot(root) {
    if (root !== document) {
      return root;
    }

    for (const selector of CONVERSATION_ROOT_SELECTORS) {
      const candidate = document.querySelector(selector);
      if (candidate) {
        return candidate;
      }
    }

    return document.body;
  }

  function findMessages(root = document) {
    const byElement = new Map();
    const searchRoot = getConversationRoot(root);

    for (const selector of SELECTORS) {
      let elements = [];
      try {
        elements = Array.from(searchRoot.querySelectorAll(selector));
      } catch (error) {
        console.debug("[response-collector] selector skipped", selector, error);
      }

      for (const element of elements) {
        if (!isVisible(element)) {
          continue;
        }

        const role = roleFromElement(element);
        if (!role) {
          continue;
        }

        const text = cleanVisibleText(element);
        if (!text) {
          continue;
        }

        const existing = byElement.get(element);
        const candidate = { element, role, text, rank: candidateRank(element) };
        if (!existing || candidate.rank > existing.rank) {
          byElement.set(element, candidate);
        }
      }
    }

    const candidates = Array.from(byElement.values());
    return sortDocumentOrder(candidates).filter((candidate) => !candidates.some((other) => (
      other !== candidate &&
      other.role === candidate.role &&
      other.rank >= candidate.rank &&
      other.element.contains(candidate.element)
    )));
  }

  function isBefore(left, right) {
    return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function captureConversation(element) {
    const messages = findMessages();
    const currentIndex = messages.findIndex((candidate) => candidate.element === element);
    const preceding = currentIndex === -1
      ? messages.filter((candidate) => isBefore(candidate.element, element)).slice(-3)
      : messages.slice(Math.max(0, currentIndex - 3), currentIndex);

    return {
      response: cleanVisibleText(element),
      context: preceding.map((candidate) => ({
        role: candidate.role,
        content: candidate.text
      }))
    };
  }

  function updateControlState(controls, label) {
    controls.querySelectorAll(".response-collector-button").forEach((button) => {
      const selected = button.dataset.label === label;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  async function syncControlState(element, controls) {
    const capture = captureConversation(element);
    if (!capture.response) {
      return;
    }

    const id = window.ResponseCollectorStorage.createId({
      source: SOURCE,
      url: window.location.href,
      context: capture.context,
      response: capture.response
    });
    const sample = await window.ResponseCollectorStorage.findById(id);
    if (sample) {
      updateControlState(controls, sample.label);
    }
  }

  async function collect(element, controls, button, label) {
    button.disabled = true;
    const capture = captureConversation(element);
    if (!capture.response) {
      button.disabled = false;
      return;
    }

    const sample = {
      id: window.ResponseCollectorStorage.createId({
        source: SOURCE,
        url: window.location.href,
        context: capture.context,
        response: capture.response
      }),
      source: SOURCE,
      url: window.location.href,
      collected_at: new Date().toISOString(),
      label,
      context: capture.context,
      response: capture.response
    };

    try {
      const result = await window.ResponseCollectorStorage.upsertSample(sample);
      updateControlState(controls, result.sample.label);
      controls.dataset.status = result.status;
      controls.title = result.status === "reclassified"
        ? `Reclassified as ${label}`
        : result.status === "duplicate"
          ? `Already marked ${label}`
          : `Saved as ${label}`;
    } catch (error) {
      console.debug("[response-collector] sample was not stored", error);
    } finally {
      button.disabled = false;
    }
  }

  function createControls(element) {
    const controls = document.createElement("div");
    controls.className = "response-collector-controls";
    controls.setAttribute(CONTROL_ATTRIBUTE, "true");
    controls.setAttribute("aria-label", "Response Collector");

    for (const [label, symbol, title] of [
      ["positive", "☆", "Mark response positive"],
      ["negative", "×", "Mark response negative"]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "response-collector-button";
      button.dataset.label = label;
      button.textContent = symbol;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void collect(element, controls, button, label);
      });
      button.addEventListener("mousedown", (event) => event.stopPropagation());
      controls.appendChild(button);
    }

    element.insertAdjacentElement("afterend", controls);
    void syncControlState(element, controls);
    return controls;
  }

  function attachControls() {
    for (const candidate of findMessages()) {
      if (candidate.role !== "assistant" || candidate.element.hasAttribute(ATTACHED_ATTRIBUTE)) {
        continue;
      }

      candidate.element.setAttribute(ATTACHED_ATTRIBUTE, "true");
      createControls(candidate.element);
    }
  }

  function scheduleScan() {
    if (scanTimer) {
      return;
    }

    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      attachControls();
    }, 120);
  }

  function start() {
    if (!isSupportedPage() || observer || !document.body) {
      return;
    }

    attachControls();
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => {
        const target = mutation.target instanceof Element
          ? mutation.target.closest(`[${CONTROL_ATTRIBUTE}]`)
          : null;
        return !target && (mutation.type === "childList" || mutation.type === "characterData");
      })) {
        scheduleScan();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("hashchange", scheduleScan);
    window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        scheduleScan();
      }
    }, 1000);
  }

  window.ResponseCollectorQwen = Object.freeze({
    isSupportedPage,
    findMessages,
    start
  });
})();

