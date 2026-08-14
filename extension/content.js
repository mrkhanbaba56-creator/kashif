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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "KASHU_FILL") return false;
    const fields = [...document.querySelectorAll("input, textarea, select")].filter((element) => {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      return visible(element) && !element.disabled && !element.readOnly && !["hidden", "password", "file", "checkbox", "radio", "submit"].includes(type);
    });
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
