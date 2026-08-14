(() => {
  if (globalThis.__kashuEcomautoLoaded) return;
  globalThis.__kashuEcomautoLoaded = true;

  const terms = {
    brand: ["brand", "brand name"],
    seller: ["seller name", "legal name", "business name", "company name", "manufacturer name"],
    gstin: ["gstin", "gst number", "gst no"],
    hsn: ["hsn", "hsn code"],
    weight: ["product weight", "item weight", "net weight", "weight"],
    country: ["country of origin", "origin country", "made in"],
    packer: ["packer", "manufacturer address", "packer details", "manufacturer details"],
  };
  const blockedTerms = ["password", "passcode", "otp", "token", "cookie", "email", "phone", "mobile", "bank", "account number", "ifsc", "pan number", "aadhaar", "aadhar", "credit card", "debit card", "card number", "cvv"];

  function visible(element) {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function descriptor(element) {
    const explicitLabel = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent : "";
    const wrappingLabel = element.closest("label")?.textContent || "";
    return [
      element.name,
      element.id,
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      explicitLabel,
      wrappingLabel,
    ].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ");
  }

  function normalizedKey(element) {
    return descriptor(element).replace(/\b(required|optional|enter|select|choose)\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  }

  function safeField(element) {
    const type = (element.getAttribute("type") || "text").toLowerCase();
    const text = descriptor(element);
    return visible(element)
      && !element.disabled
      && !element.readOnly
      && !["hidden", "password", "file", "checkbox", "radio", "submit", "email", "tel"].includes(type)
      && !blockedTerms.some((term) => text.includes(term));
  }

  function matchingKey(element) {
    const text = descriptor(element);
    return Object.entries(terms).find(([, aliases]) => aliases.some((alias) => text.includes(alias)))?.[0] || null;
  }

  function setNativeValue(element, value) {
    if (element.tagName === "SELECT") {
      const option = [...element.options].find((item) => item.value.toLowerCase() === value.toLowerCase() || item.text.toLowerCase().includes(value.toLowerCase()));
      if (!option) return false;
      element.value = option.value;
    } else {
      const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function pageFields() {
    return [...document.querySelectorAll("input, textarea, select")].filter(safeField);
  }

  function capturedValueFor(element, captured) {
    const key = normalizedKey(element);
    if (!key) return null;
    const exact = captured.find((field) => field.key === key);
    if (exact) return exact.value;
    const candidates = captured.filter((field) => field.key.length > 4 && (key.includes(field.key) || field.key.includes(key)));
    return candidates.sort((a, b) => Math.abs(a.key.length - key.length) - Math.abs(b.key.length - key.length))[0]?.value ?? null;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const fields = pageFields();
    if (message.type === "KASHU_CAPTURE_LISTING") {
      const captured = fields
        .map((field) => ({
          key: normalizedKey(field),
          value: String(field.value || "").trim().slice(0, 3000),
          tag: field.tagName.toLowerCase(),
        }))
        .filter((field) => field.key && field.value)
        .slice(0, 120);
      sendResponse({ fields: captured });
      return true;
    }

    if (message.type === "KASHU_FILL_CAPTURED") {
      let count = 0;
      fields.forEach((field) => {
        if (String(field.value || "").trim()) return;
        const value = capturedValueFor(field, Array.isArray(message.fields) ? message.fields : []);
        if (value && setNativeValue(field, value)) count += 1;
      });
      sendResponse({ count });
      return true;
    }

    if (message.type !== "KASHU_FILL") return false;
    let count = 0;
    fields.forEach((field) => {
      if (String(field.value || "").trim()) return;
      const key = matchingKey(field);
      const value = key ? String(message.profile[key] || "").trim() : "";
      if (value && setNativeValue(field, value)) count += 1;
    });
    sendResponse({ count });
    return true;
  });
})();
