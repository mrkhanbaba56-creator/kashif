const ids = ["brand", "seller", "gstin", "hsn", "weight", "country", "packer"];
const status = document.querySelector("#status");

chrome.storage.local.get("profile", ({ profile = {} }) => {
  ids.forEach((id) => {
    const field = document.querySelector(`#${id}`);
    field.value = profile[id] || (id === "country" ? "India" : "");
  });
});

document.querySelector("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const profile = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`).value.trim()]));
  profile.gstin = profile.gstin.toUpperCase();
  if (profile.gstin && profile.gstin.length !== 15) {
    status.textContent = "GSTIN should contain 15 characters.";
    return;
  }
  chrome.storage.local.set({ profile }, () => { status.textContent = "Profile saved only in this browser."; });
});

document.querySelector("#fill-page").addEventListener("click", async () => {
  status.textContent = "Checking the current page…";
  const tab = await getSupportedTab();
  if (!tab) return;
  const { profile = {} } = await chrome.storage.local.get("profile");
  if (!Object.values(profile).some(Boolean)) {
    status.textContent = "Save your profile before using autofill.";
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "KASHU_FILL", profile });
    status.textContent = response?.count
      ? `${response.count} empty field${response.count === 1 ? "" : "s"} filled. Please review them.`
      : "No matching empty fields were found on this step.";
  } catch {
    status.textContent = "Refresh the seller page once, then try again.";
  }
});

document.querySelector("#capture-listing").addEventListener("click", async () => {
  status.textContent = "Reading safe listing fields…";
  const tab = await getSupportedTab();
  if (!tab) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "KASHU_CAPTURE_LISTING" });
    if (!response?.fields?.length) {
      status.textContent = "No filled product fields were found on this step.";
      return;
    }
    await chrome.storage.local.set({ capturedListing: { fields: response.fields, source: tab.url, capturedAt: Date.now() } });
    status.textContent = `${response.fields.length} safe listing fields captured locally.`;
  } catch {
    status.textContent = "Refresh the seller page once, then try capture again.";
  }
});

document.querySelector("#fill-listing").addEventListener("click", async () => {
  status.textContent = "Matching captured listing fields…";
  const tab = await getSupportedTab();
  if (!tab) return;
  const { capturedListing } = await chrome.storage.local.get("capturedListing");
  if (!capturedListing?.fields?.length) {
    status.textContent = "Capture a filled listing first.";
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "KASHU_FILL_CAPTURED", fields: capturedListing.fields });
    status.textContent = response?.count
      ? `${response.count} listing fields filled. Review before submitting.`
      : "No matching empty fields were found on this step.";
  } catch {
    status.textContent = "Refresh the seller page once, then try autofill again.";
  }
});

document.querySelector("#clear-capture").addEventListener("click", async () => {
  await chrome.storage.local.remove("capturedListing");
  status.textContent = "Captured listing removed from this browser.";
});

async function getSupportedTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(supplier\.meesho\.com|seller\.flipkart\.com)\//.test(tab.url || "")) {
    status.textContent = "Open a Meesho Supplier or Flipkart Seller Hub listing page first.";
    return null;
  }
  return tab;
}
