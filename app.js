import {
  analyzeOrders,
  calculateProfit,
  createListing,
  csvEscape,
  money,
  parseCSV,
  skuGrossMargin,
} from "./logic.mjs";
import { FreeAccountService } from "./auth.js";

const KEYS = {
  profile: "kashu.ecomauto.profile.v1",
  skus: "kashu.ecomauto.skus.v1",
  profit: "kashu.ecomauto.profit.v1",
  orders: "kashu.ecomauto.orders.v1",
};

const state = {
  profile: loadJSON(KEYS.profile, {}),
  skus: loadJSON(KEYS.skus, []),
  profit: loadJSON(KEYS.profit, null),
  orders: loadJSON(KEYS.orders, null),
  imageItems: [],
  deferredInstallPrompt: null,
  account: { configured: false, session: null, profile: null, users: [], tasks: [] },
};

const accountService = new FreeAccountService(handleSessionChange);
let authMode = "signup";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function navigate(pageName) {
  const page = $(`#${pageName}-page`);
  if (!page) return;
  $$(".page").forEach((item) => item.classList.toggle("is-active", item === page));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.page === pageName));
  $("#page-title").textContent = page.dataset.title || "kashu.ecomauto";
  $("#page-kicker").textContent = page.dataset.kicker || "Seller workspace";
  $("#sidebar").classList.remove("is-open");
  history.replaceState(null, "", `#${pageName}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-page]");
  if (target) navigate(target.dataset.page);
});

$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("is-open"));

function copyText(text, successMessage = "Copied") {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast(successMessage)).catch(() => {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast(successMessage);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Listing maker
$("#listing-image").addEventListener("change", (event) => {
  const file = event.target.files[0];
  $("#listing-image-label").textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "Choose product image";
});

$("#fill-profile-listing").addEventListener("click", () => {
  if (!state.profile.brand) {
    showToast("Save your business profile first");
    navigate("autofill");
    return;
  }
  $("#listing-brand").value = state.profile.brand || "";
  showToast("Saved brand added to listing");
});

$("#listing-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const listing = createListing({
    marketplace: $("#listing-marketplace").value,
    language: $("#listing-language").value,
    name: $("#listing-name").value,
    category: $("#listing-category").value,
    brand: $("#listing-brand").value,
    material: $("#listing-material").value,
    color: $("#listing-color").value,
    pack: $("#listing-pack").value,
    features: $("#listing-features").value,
    keywords: $("#listing-keywords").value,
  });
  if (!listing.title) {
    showToast("Add a product name first");
    return;
  }

  $("#listing-title").textContent = listing.title;
  $("#title-count").textContent = `${listing.title.length} / ${listing.titleLimit} characters`;
  const bullets = $("#listing-bullets");
  bullets.replaceChildren(...listing.bullets.map((bullet) => {
    const item = document.createElement("li");
    item.textContent = bullet;
    return item;
  }));
  $("#listing-description").textContent = listing.description;
  $("#listing-search").textContent = listing.searchTerms;
  $("#listing-empty").hidden = true;
  $("#listing-output").hidden = false;
  showToast("Listing created — review before publishing");
});

$("#listing-result").addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const element = $(`#${button.dataset.copy}`);
  const text = element.tagName === "UL" ? [...element.children].map((item) => `• ${item.textContent}`).join("\n") : element.textContent;
  copyText(text);
});

$("#copy-all-listing").addEventListener("click", () => {
  const bullets = [...$("#listing-bullets").children].map((item) => `• ${item.textContent}`).join("\n");
  const text = `TITLE\n${$("#listing-title").textContent}\n\nKEY FEATURES\n${bullets}\n\nDESCRIPTION\n${$("#listing-description").textContent}\n\nSEARCH KEYWORDS\n${$("#listing-search").textContent}`;
  copyText(text, "Complete listing copied");
});

// Profit calculator
const PROFIT_FIELDS = {
  price: "#profit-price",
  productCost: "#profit-cost",
  shipping: "#profit-shipping",
  packaging: "#profit-packaging",
  feeRate: "#profit-fee",
  feeGstRate: "#profit-fee-gst",
  returnRate: "#profit-return",
  rtoRate: "#profit-rto",
  reverseCharge: "#profit-reverse",
  ads: "#profit-ads",
};

function readProfitForm() {
  return Object.fromEntries(Object.entries(PROFIT_FIELDS).map(([key, selector]) => [key, $(selector).value]));
}

function renderProfit(result, persist = true) {
  $("#result-profit").textContent = money(result.profit);
  $("#result-margin").textContent = `${result.margin.toFixed(1)}% margin`;
  $("#result-fee").textContent = money(result.platformFee + result.feeGst);
  $("#result-return-cost").textContent = money(result.expectedReturnCost);
  $("#result-costs").textContent = money(result.totalCosts);
  $("#result-breakeven").textContent = money(result.breakEven);
  $("#hero-margin").textContent = `${result.margin.toFixed(1)}%`;

  const meter = Math.min(100, Math.max(0, result.margin * 2.5));
  $("#profit-meter-fill").style.width = `${meter}%`;
  let health = "Loss";
  let advice = "Your current selling price does not cover the entered costs. Increase price or reduce costs.";
  if (result.margin >= 25) {
    health = "Healthy";
    advice = "This margin has a useful cushion, but still verify the latest marketplace fee slab.";
  } else if (result.margin >= 12) {
    health = "Tight";
    advice = "There is profit, but returns or an ad spike can erase it. Try to create a 20%+ cushion.";
  } else if (result.margin >= 0) {
    health = "Risky";
    advice = "The margin is positive but fragile. Review shipping, packaging and return costs.";
  }
  $("#margin-health").textContent = health;
  $("#profit-advice").textContent = advice;

  if (persist) {
    state.profit = { inputs: readProfitForm(), result };
    saveJSON(KEYS.profit, state.profit);
    updateSetup();
  }
}

$("#profit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  renderProfit(calculateProfit(readProfitForm()));
  showToast("True profit estimate updated");
});

$("#reset-profit").addEventListener("click", () => {
  const defaults = { price: 499, productCost: 210, shipping: 72, packaging: 12, feeRate: 5, feeGstRate: 18, returnRate: 8, rtoRate: 5, reverseCharge: 110, ads: 15 };
  Object.entries(PROFIT_FIELDS).forEach(([key, selector]) => { $(selector).value = defaults[key]; });
  renderProfit(calculateProfit(defaults));
});

$("#save-rate-card").addEventListener("click", () => {
  $("#sku-cost").value = $("#profit-cost").value;
  $("#sku-price").value = $("#profit-price").value;
  $("#sku-form").hidden = false;
  navigate("sku");
  $("#sku-code").focus();
  showToast("Add SKU code and product name to save");
});

// SKU and rate cards
function renderSkus() {
  const body = $("#sku-table-body");
  body.replaceChildren(...state.skus.map((sku, index) => {
    const row = document.createElement("tr");
    const margin = skuGrossMargin(sku.cost, sku.price);
    [sku.code, sku.name, money(sku.cost), money(sku.price), `${margin.toFixed(1)}%`, sku.stock].forEach((value, cellIndex) => {
      const cell = document.createElement("td");
      if (cellIndex < 2) {
        const strong = document.createElement("strong");
        strong.textContent = value;
        cell.append(strong);
      } else cell.textContent = value;
      row.append(cell);
    });
    const actionCell = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-action";
    remove.textContent = "Remove";
    remove.dataset.removeSku = String(index);
    actionCell.append(remove);
    row.append(actionCell);
    return row;
  }));
  $("#sku-empty").hidden = state.skus.length > 0;
  $(".table-wrap", $("#sku-page")).hidden = state.skus.length === 0;
  $("#hero-skus").textContent = String(state.skus.length);
  updateSetup();
}

$("#add-sku").addEventListener("click", () => {
  $("#sku-form").hidden = false;
  $("#sku-code").focus();
});
$("#cancel-sku").addEventListener("click", () => {
  $("#sku-form").reset();
  $("#sku-form").hidden = true;
});
$("#sku-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = $("#sku-code").value.trim().toUpperCase();
  if (state.skus.some((item) => item.code === code)) {
    showToast("This SKU code already exists");
    return;
  }
  state.skus.unshift({
    code,
    name: $("#sku-name").value.trim(),
    cost: Number($("#sku-cost").value),
    price: Number($("#sku-price").value),
    stock: Number($("#sku-stock").value),
  });
  saveJSON(KEYS.skus, state.skus);
  event.target.reset();
  event.target.hidden = true;
  renderSkus();
  showToast("SKU rate card saved");
});
$("#sku-table-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-sku]");
  if (!button) return;
  state.skus.splice(Number(button.dataset.removeSku), 1);
  saveJSON(KEYS.skus, state.skus);
  renderSkus();
  showToast("SKU removed");
});
$("#export-skus").addEventListener("click", () => {
  if (!state.skus.length) return showToast("Add at least one SKU first");
  const lines = ["sku,product_name,cost,selling_price,gross_margin_percent,stock"];
  state.skus.forEach((sku) => lines.push([
    sku.code, sku.name, sku.cost, sku.price, skuGrossMargin(sku.cost, sku.price).toFixed(2), sku.stock,
  ].map(csvEscape).join(",")));
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "kashu-ecomauto-rate-cards.csv");
});

// Orders
const SAMPLE_CSV = `order_id,sku,status,selling_price,product_cost,shipping,platform_fee
ORD-1001,TT-WHITE,delivered,1299,720,110,65
ORD-1002,TT-BLACK,return,1299,720,110,65
ORD-1003,STAND-02,delivered,399,155,68,20
ORD-1004,STAND-02,rto,399,155,68,20
ORD-1005,BOOK-01,cancelled,699,280,80,35`;

$("#download-sample-csv").addEventListener("click", () => {
  downloadBlob(new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" }), "kashu-ecomauto-order-sample.csv");
});

$("#orders-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const rows = parseCSV(await file.text());
    if (!rows.length || !("status" in rows[0])) throw new Error("missing status");
    state.orders = analyzeOrders(rows);
    saveJSON(KEYS.orders, state.orders);
    renderOrders();
    showToast(`${state.orders.total} orders imported`);
  } catch {
    showToast("CSV could not be read. Download the sample format.");
  } finally {
    event.target.value = "";
  }
});

function renderOrders() {
  const orders = state.orders || { rows: [], total: 0, revenue: 0, profit: 0, returnRate: 0 };
  $("#orders-total").textContent = String(orders.total);
  $("#orders-revenue").textContent = money(orders.revenue);
  $("#orders-profit").textContent = money(orders.profit);
  $("#orders-return-rate").textContent = `${orders.returnRate.toFixed(1)}%`;
  const body = $("#orders-table-body");
  body.replaceChildren(...orders.rows.slice(0, 200).map((order) => {
    const row = document.createElement("tr");
    const values = [order.orderId, order.sku];
    values.forEach((value) => {
      const cell = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = value;
      cell.append(strong);
      row.append(cell);
    });
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `status-badge ${order.status.includes("return") ? "return" : order.status.includes("rto") ? "rto" : order.status.includes("cancel") ? "cancelled" : ""}`;
    status.textContent = order.status;
    statusCell.append(status);
    row.append(statusCell);
    [money(order.sellingPrice), money(order.costs), money(order.profit)].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    return row;
  }));
  $("#orders-empty").hidden = orders.rows.length > 0;
  $(".table-wrap", $("#orders-page > .panel")).hidden = orders.rows.length === 0;
  updateSetup();
}

$("#clear-orders").addEventListener("click", () => {
  if (!state.orders) return;
  if (!window.confirm("Remove imported order data from this browser?")) return;
  state.orders = null;
  localStorage.removeItem(KEYS.orders);
  renderOrders();
  showToast("Imported order data cleared");
});

// Free accounts, Admin/Agent/Seller roles and account-handling work
function openAuthModal(mode = "signup") {
  setAuthMode(mode);
  $("#auth-modal").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $(mode === "signup" ? "#auth-name" : "#auth-email").focus(), 0);
}

function closeAuthModal() {
  $("#auth-modal").hidden = true;
  document.body.style.overflow = "";
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#signup-tab").classList.toggle("is-active", signup);
  $("#login-tab").classList.toggle("is-active", !signup);
  $("#auth-name-wrap").hidden = !signup;
  $("#auth-name").required = signup;
  $("#auth-title").textContent = signup ? "Create your free account" : "Welcome back";
  $("#auth-submit").textContent = signup ? "Create free account" : "Log in";
  $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("#auth-status").textContent = accountService.configured
    ? (signup ? "No card, payment or paid plan is required." : "Use your registered email and password.")
    : "Owner setup needed: add the free Supabase URL and anon key in config.js.";
}

$("#open-auth").addEventListener("click", () => {
  if (state.account.session) navigate("team");
  else openAuthModal("signup");
});
$("#team-auth-button").addEventListener("click", () => {
  if (state.account.session) navigate("team");
  else openAuthModal("signup");
});
$("#close-auth").addEventListener("click", closeAuthModal);
$("#auth-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeAuthModal(); });
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));
$("#login-tab").addEventListener("click", () => setAuthMode("login"));

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!accountService.configured) {
    $("#auth-status").textContent = "Run supabase/schema.sql, then add the two public project values in config.js.";
    return;
  }
  const submit = $("#auth-submit");
  submit.disabled = true;
  submit.textContent = authMode === "signup" ? "Creating…" : "Logging in…";
  try {
    const credentials = {
      name: $("#auth-name").value.trim(),
      email: $("#auth-email").value.trim(),
      password: $("#auth-password").value,
    };
    if (authMode === "signup") {
      const result = await accountService.signUp(credentials);
      if (!result.session) {
        $("#auth-status").textContent = "Account created. Check your email once to confirm, then log in.";
        setAuthMode("login");
        return;
      }
      showToast("Free seller account created");
    } else {
      await accountService.signIn(credentials);
      showToast("Logged in successfully");
    }
    event.target.reset();
    closeAuthModal();
    navigate("team");
  } catch (error) {
    $("#auth-status").textContent = friendlyAccountError(error);
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === "signup" ? "Create free account" : "Log in";
  }
});

$("#sign-out").addEventListener("click", async () => {
  try {
    await accountService.signOut();
    showToast("Signed out");
  } catch (error) {
    showToast(friendlyAccountError(error));
  }
});

async function handleSessionChange({ session, profile, configured }) {
  state.account.configured = configured;
  state.account.session = session;
  state.account.profile = profile;
  const connection = $("#team-connection");
  connection.textContent = configured ? "Free cloud connected" : "Setup required";
  connection.classList.toggle("is-online", configured);
  connection.classList.toggle("is-local", !configured);

  const signedIn = Boolean(session && profile);
  $("#team-guest").hidden = signedIn;
  $("#team-console").hidden = !signedIn;
  $("#open-auth").textContent = signedIn ? profile.role.toUpperCase() : "Free sign up";
  $("#team-auth-button").textContent = signedIn ? "Open your workspace" : (configured ? "Create free account" : "Connect free backend");
  $("#account-avatar").textContent = signedIn ? initials(profile.full_name || profile.email) : "KM";
  if (!signedIn) return;

  $("#team-user-name").textContent = profile.full_name || "Seller";
  $("#team-user-email").textContent = profile.email || session.user.email || "";
  $("#team-user-role").textContent = titleCase(profile.role);
  $("#admin-console").hidden = profile.role !== "admin";
  $("#seller-console").hidden = profile.role !== "seller";
  $("#task-board-title").textContent = profile.role === "admin" ? "All account work" : profile.role === "agent" ? "Assigned account work" : "Your account work";
  await refreshTeamData();
}

async function refreshTeamData() {
  if (!state.account.session) return;
  try {
    state.account.tasks = await accountService.listTasks();
    if (state.account.profile.role === "admin") state.account.users = await accountService.listUsers();
    renderTeamUsers();
    renderTeamTasks();
  } catch (error) {
    showToast(friendlyAccountError(error));
  }
}

$("#refresh-team").addEventListener("click", refreshTeamData);

function renderTeamUsers() {
  if (state.account.profile?.role !== "admin") return;
  const users = state.account.users;
  const body = $("#team-user-table");
  body.replaceChildren(...users.map((user) => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const name = document.createElement("strong");
    name.textContent = user.full_name || "Unnamed user";
    nameCell.append(name);
    const emailCell = document.createElement("td");
    emailCell.textContent = user.email;
    const roleCell = document.createElement("td");
    const role = document.createElement("span");
    role.className = `status-badge role-${user.role}`;
    role.textContent = user.role;
    roleCell.append(role);
    const statusCell = document.createElement("td");
    statusCell.textContent = user.active ? "Active" : "Disabled";
    const actionCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = "role-select";
    select.dataset.roleUser = user.id;
    select.disabled = user.id === state.account.profile.id;
    ["seller", "agent", "admin"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = titleCase(value);
      option.selected = value === user.role;
      select.append(option);
    });
    actionCell.append(select);
    row.append(nameCell, emailCell, roleCell, statusCell, actionCell);
    return row;
  }));

  fillUserSelect("#assignment-seller", users.filter((user) => user.role === "seller"), "Choose seller");
  fillUserSelect("#assignment-agent", users.filter((user) => user.role === "agent"), "Choose agent");
}

function fillUserSelect(selector, users, placeholder) {
  const select = $(selector);
  select.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.append(first, ...users.map((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.full_name || "User"} · ${user.email}`;
    return option;
  }));
}

$("#team-user-table").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-role-user]");
  if (!select) return;
  select.disabled = true;
  try {
    await accountService.changeRole(select.dataset.roleUser, select.value);
    showToast(`User changed to ${titleCase(select.value)}`);
    await refreshTeamData();
  } catch (error) {
    showToast(friendlyAccountError(error));
  } finally {
    select.disabled = false;
  }
});

$("#assignment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    await accountService.assignAgent($("#assignment-seller").value, $("#assignment-agent").value);
    showToast("Seller assigned to agent");
    event.target.reset();
    await refreshTeamData();
  } catch (error) {
    showToast(friendlyAccountError(error));
  } finally {
    submit.disabled = false;
  }
});

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    await accountService.createTask({
      platform: $("#task-platform").value,
      title: $("#task-title").value.trim(),
      details: $("#task-details").value.trim(),
    });
    event.target.reset();
    showToast("Account work request created");
    await refreshTeamData();
  } catch (error) {
    showToast(friendlyAccountError(error));
  } finally {
    submit.disabled = false;
  }
});

function renderTeamTasks() {
  const tasks = state.account.tasks || [];
  $("#team-open-count").textContent = String(tasks.filter((task) => task.status !== "done").length);
  $("#task-count-badge").textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
  $("#team-task-empty").hidden = tasks.length > 0;
  const table = $("#team-task-table").closest(".table-wrap");
  table.hidden = tasks.length === 0;
  $("#team-task-table").replaceChildren(...tasks.map((task) => {
    const row = document.createElement("tr");
    const platform = document.createElement("td");
    const platformBadge = document.createElement("span");
    platformBadge.className = "status-badge";
    platformBadge.textContent = task.platform;
    platform.append(platformBadge);
    const work = document.createElement("td");
    const title = document.createElement("strong");
    title.textContent = task.title;
    const details = document.createElement("small");
    details.textContent = task.details;
    details.style.display = "block";
    details.style.color = "var(--muted)";
    details.style.marginTop = "3px";
    work.append(title, details);
    const seller = document.createElement("td");
    seller.textContent = task.seller?.full_name || task.seller?.email || "—";
    const agent = document.createElement("td");
    agent.textContent = task.agent?.full_name || task.agent?.email || "Unassigned";
    const status = document.createElement("td");
    const canUpdate = ["admin", "agent"].includes(state.account.profile.role);
    if (canUpdate) {
      const select = document.createElement("select");
      select.className = "task-status-select";
      select.dataset.taskStatus = task.id;
      ["open", "in_progress", "waiting", "done"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value.replace("_", " ");
        option.selected = value === task.status;
        select.append(option);
      });
      status.append(select);
    } else {
      const badge = document.createElement("span");
      badge.className = `status-badge ${task.status === "done" ? "" : "return"}`;
      badge.textContent = task.status.replace("_", " ");
      status.append(badge);
    }
    const updated = document.createElement("td");
    updated.textContent = new Date(task.updated_at).toLocaleDateString("en-IN");
    row.append(platform, work, seller, agent, status, updated);
    return row;
  }));
}

$("#team-task-table").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-task-status]");
  if (!select) return;
  select.disabled = true;
  try {
    await accountService.updateTaskStatus(select.dataset.taskStatus, select.value);
    showToast("Task status updated");
    await refreshTeamData();
  } catch (error) {
    showToast(friendlyAccountError(error));
  } finally {
    select.disabled = false;
  }
});

function initials(value = "") {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "K";
}

function titleCase(value = "") {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function friendlyAccountError(error) {
  const message = String(error?.message || error || "Something went wrong");
  if (message.includes("Invalid login")) return "Email or password is incorrect.";
  if (message.includes("already registered")) return "This email already has an account. Use Log in.";
  if (message.includes("Email not confirmed")) return "Confirm your email once, then log in.";
  if (message.includes("Failed to fetch")) return "Free backend could not be reached. Check config.js and internet.";
  return message.length > 120 ? "Account action could not be completed." : message;
}

// Image studio
const dropZone = $("#image-drop-zone");
["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  dropZone.classList.add("is-over");
}));
["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-over");
}));
dropZone.addEventListener("drop", (event) => setImageFiles([...event.dataTransfer.files]));
$("#image-files").addEventListener("change", (event) => setImageFiles([...event.target.files]));

function setImageFiles(files) {
  state.imageItems.forEach((item) => {
    if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  });
  state.imageItems = files.filter((file) => file.type.startsWith("image/")).slice(0, 20).map((file) => ({
    file,
    sourceUrl: URL.createObjectURL(file),
    outputUrl: null,
    outputBlob: null,
    status: "Ready",
  }));
  renderImageQueue();
}

function renderImageQueue() {
  const queue = $("#image-queue");
  $("#image-count").textContent = `${state.imageItems.length} file${state.imageItems.length === 1 ? "" : "s"}`;
  if (!state.imageItems.length) {
    queue.innerHTML = '<div class="empty-state compact"><div class="empty-orbit">▧</div><h3>No images yet</h3><p>Choose images to see their actual size and preview.</p></div>';
    return;
  }
  queue.replaceChildren(...state.imageItems.map((item, index) => {
    const card = document.createElement("article");
    card.className = "image-card";
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = item.outputUrl || item.sourceUrl;
    image.alt = item.file.name;
    figure.append(image);
    const body = document.createElement("div");
    body.className = "image-card-body";
    const name = document.createElement("strong");
    name.textContent = item.file.name;
    const meta = document.createElement("div");
    meta.className = "image-meta";
    const sourceSize = document.createElement("span");
    sourceSize.textContent = `Original ${formatBytes(item.file.size)}`;
    const outputSize = document.createElement("span");
    outputSize.textContent = item.outputBlob ? `Output ${formatBytes(item.outputBlob.size)}` : item.status;
    meta.append(sourceSize, outputSize);
    body.append(name, meta);
    if (item.outputBlob) {
      const download = document.createElement("button");
      download.type = "button";
      download.className = "button button-soft";
      download.textContent = "Download image";
      download.dataset.downloadImage = String(index);
      body.append(download);
    }
    card.append(figure, body);
    return card;
  }));
}

$("#image-queue").addEventListener("click", (event) => {
  const button = event.target.closest("[data-download-image]");
  if (!button) return;
  const item = state.imageItems[Number(button.dataset.downloadImage)];
  const extension = $("#image-format").value === "image/png" ? "png" : $("#image-format").value === "image/webp" ? "webp" : "jpg";
  const baseName = item.file.name.replace(/\.[^.]+$/, "");
  downloadBlob(item.outputBlob, `${baseName}-kashu-ecomauto.${extension}`);
});

$("#image-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.imageItems.length) return showToast("Choose at least one product image");
  const submit = $("#image-form button[type='submit']");
  submit.disabled = true;
  submit.textContent = "Processing…";
  try {
    for (const item of state.imageItems) {
      item.status = "Processing";
      renderImageQueue();
      const outputBlob = await processImage(item.file, {
        ratio: $("#image-ratio").value,
        format: $("#image-format").value,
        background: $("#image-bg").value,
        targetKb: Number($("#image-target").value),
        sticker: $("#image-sticker").value,
      });
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      item.outputBlob = outputBlob;
      item.outputUrl = URL.createObjectURL(outputBlob);
      item.status = "Done";
    }
    renderImageQueue();
    showToast("Images are ready to download");
  } catch {
    showToast("One image could not be processed");
  } finally {
    submit.disabled = false;
    submit.textContent = "Process selected images";
  }
});

async function processImage(file, options) {
  const bitmap = await loadBitmap(file);
  const maxSide = 1600;
  let width;
  let height;
  if (options.ratio === "1:1") [width, height] = [1200, 1200];
  else if (options.ratio === "4:5") [width, height] = [1200, 1500];
  else {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    width = Math.max(1, Math.round(bitmap.width * scale));
    height = Math.max(1, Math.round(bitmap.height * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: options.background === "transparent" });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (options.background !== "transparent") {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  } else context.clearRect(0, 0, width, height);

  const padding = options.ratio === "original" ? 0 : Math.round(Math.min(width, height) * .055);
  const scale = Math.min((width - padding * 2) / bitmap.width, (height - padding * 2) / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  if (options.sticker) drawSticker(context, options.sticker, width, height);

  if (bitmap.close) bitmap.close();
  return compressCanvas(canvas, options.format, Math.min(500, Math.max(35, options.targetKb)) * 1024);
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  const image = new Image();
  image.src = URL.createObjectURL(file);
  await image.decode();
  URL.revokeObjectURL(image.src);
  return image;
}

function canvasBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("encode failed")), format, quality));
}

async function compressCanvas(canvas, format, targetBytes) {
  if (format === "image/png") return canvasBlob(canvas, format, 1);
  let low = .22;
  let high = .96;
  let best = await canvasBlob(canvas, format, high);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasBlob(canvas, format, quality);
    if (Math.abs(blob.size - targetBytes) < Math.abs(best.size - targetBytes)) best = blob;
    if (blob.size > targetBytes) high = quality;
    else low = quality;
  }
  return best;
}

function drawSticker(context, text, width, height) {
  const fontSize = Math.max(28, Math.round(width * .038));
  context.save();
  context.font = `800 ${fontSize}px Manrope, sans-serif`;
  const padX = fontSize * .7;
  const boxWidth = context.measureText(text).width + padX * 2;
  const boxHeight = fontSize * 1.9;
  const x = width - boxWidth - width * .045;
  const y = height * .045;
  roundRect(context, x, y, boxWidth, boxHeight, boxHeight / 2);
  context.fillStyle = "#173f39";
  context.fill();
  context.fillStyle = "#d9ff83";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x + boxWidth / 2, y + boxHeight / 2 + 1);
  context.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Profile and backup
function loadProfileForm() {
  $("#profile-brand").value = state.profile.brand || "";
  $("#profile-seller").value = state.profile.seller || "";
  $("#profile-gstin").value = state.profile.gstin || "";
  $("#profile-hsn").value = state.profile.hsn || "";
  $("#profile-weight").value = state.profile.weight || "";
  $("#profile-country").value = state.profile.country || "India";
  $("#profile-packer").value = state.profile.packer || "";
}

$("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const gstin = $("#profile-gstin").value.trim().toUpperCase();
  if (gstin && gstin.length !== 15) return showToast("GSTIN should contain 15 characters");
  state.profile = {
    brand: $("#profile-brand").value.trim(),
    seller: $("#profile-seller").value.trim(),
    gstin,
    hsn: $("#profile-hsn").value.trim(),
    weight: $("#profile-weight").value.trim(),
    country: $("#profile-country").value.trim(),
    packer: $("#profile-packer").value.trim(),
  };
  saveJSON(KEYS.profile, state.profile);
  updateSetup();
  showToast("Business profile saved in this browser");
});

$("#export-backup").addEventListener("click", () => {
  const backup = {
    app: "kashu.ecomauto",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    skus: state.skus,
    profit: state.profit,
    orders: state.orders,
  };
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), "kashu-ecomauto-backup.json");
});

$("#import-backup").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== "kashu.ecomauto") throw new Error("wrong backup");
    state.profile = backup.profile || {};
    state.skus = Array.isArray(backup.skus) ? backup.skus : [];
    state.profit = backup.profit || null;
    state.orders = backup.orders || null;
    saveJSON(KEYS.profile, state.profile);
    saveJSON(KEYS.skus, state.skus);
    if (state.profit) saveJSON(KEYS.profit, state.profit); else localStorage.removeItem(KEYS.profit);
    if (state.orders) saveJSON(KEYS.orders, state.orders); else localStorage.removeItem(KEYS.orders);
    loadProfileForm();
    renderSkus();
    renderOrders();
    restoreProfit();
    showToast("Workspace backup restored");
  } catch {
    showToast("This is not a valid kashu.ecomauto backup");
  } finally {
    event.target.value = "";
  }
});

function restoreProfit() {
  if (!state.profit?.inputs) {
    renderProfit(calculateProfit(readProfitForm()), false);
    return;
  }
  Object.entries(PROFIT_FIELDS).forEach(([key, selector]) => {
    if (state.profit.inputs[key] !== undefined) $(selector).value = state.profit.inputs[key];
  });
  renderProfit(calculateProfit(state.profit.inputs), false);
}

function updateSetup() {
  const checks = [
    { done: Boolean(state.profile?.brand), selector: "#check-profile" },
    { done: state.skus.length > 0, selector: "#check-sku" },
    { done: Boolean(state.profit), selector: "#check-profit" },
    { done: Boolean(state.orders?.rows?.length), selector: "#check-orders" },
  ];
  checks.forEach(({ done, selector }) => { $(selector).textContent = done ? "●" : "○"; });
  const completed = checks.filter((check) => check.done).length;
  const percent = 20 + completed * 20;
  $("#setup-percent").textContent = `${percent}%`;
  $("#setup-progress").style.width = `${percent}%`;
}

// PWA installation
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  $("#install-app").hidden = false;
});
$("#install-app").addEventListener("click", async () => {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  $("#install-app").hidden = true;
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

// Initial render
loadProfileForm();
renderSkus();
renderOrders();
restoreProfit();
updateSetup();
const initialPage = location.hash.slice(1);
if (initialPage && $(`#${initialPage}-page`)) navigate(initialPage);
accountService.start().catch((error) => {
  handleSessionChange({ session: null, profile: null, configured: accountService.configured });
  $("#auth-status").textContent = friendlyAccountError(error);
});
