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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(supplier\.meesho\.com|seller\.flipkart\.com)\//.test(tab.url || "")) {
    status.textContent = "Open a Meesho Supplier or Flipkart Seller Hub listing page first.";
    return;
  }
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
