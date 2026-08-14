export const MARKETPLACE_TITLE_LIMITS = {
  meesho: 120,
  flipkart: 150,
  amazon: 180,
  generic: 160,
};

export function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function money(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(number);
}

export function toNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

export function calculateProfit(values) {
  const price = Math.max(0, toNumber(values.price));
  const productCost = Math.max(0, toNumber(values.productCost));
  const shipping = Math.max(0, toNumber(values.shipping));
  const packaging = Math.max(0, toNumber(values.packaging));
  const feeRate = Math.max(0, toNumber(values.feeRate));
  const feeGstRate = Math.max(0, toNumber(values.feeGstRate));
  const returnRate = Math.min(100, Math.max(0, toNumber(values.returnRate)));
  const rtoRate = Math.min(100, Math.max(0, toNumber(values.rtoRate)));
  const reverseCharge = Math.max(0, toNumber(values.reverseCharge));
  const ads = Math.max(0, toNumber(values.ads));

  const platformFee = price * (feeRate / 100);
  const feeGst = platformFee * (feeGstRate / 100);
  const expectedReturnCost = reverseCharge * ((returnRate + rtoRate) / 100);
  const fixedCosts = productCost + shipping + packaging + ads + expectedReturnCost;
  const totalCosts = fixedCosts + platformFee + feeGst;
  const profit = price - totalCosts;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const variableRate = (feeRate / 100) * (1 + feeGstRate / 100);
  const breakEven = variableRate < 1 ? fixedCosts / (1 - variableRate) : 0;

  return {
    price,
    productCost,
    shipping,
    packaging,
    platformFee,
    feeGst,
    expectedReturnCost,
    totalCosts,
    profit,
    margin,
    breakEven,
  };
}

function uniqueWords(values) {
  const seen = new Set();
  return values
    .flatMap((value) => cleanText(value).split(/[,|]/))
    .map((value) => cleanText(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sentenceCase(value) {
  const text = cleanText(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function createListing(input) {
  const marketplace = input.marketplace || "generic";
  const limit = MARKETPLACE_TITLE_LIMITS[marketplace] || MARKETPLACE_TITLE_LIMITS.generic;
  const language = input.language || "english";
  const name = cleanText(input.name);
  const brand = cleanText(input.brand);
  const material = cleanText(input.material);
  const color = cleanText(input.color);
  const pack = cleanText(input.pack);
  const category = cleanText(input.category);
  const features = uniqueWords([input.features]);
  const keywords = uniqueWords([input.keywords]);

  const titleParts = [brand, name, material, color, pack].filter(Boolean);
  let title = cleanText(titleParts.join(" "));
  if (title.length > limit) title = `${title.slice(0, limit - 1).trim()}…`;

  const defaultFeatures = [
    material ? `Made with ${material.toLowerCase()} for dependable everyday use` : "Made for dependable everyday use",
    color ? `${sentenceCase(color)} finish designed for a clean, versatile look` : "Clean finish designed for a versatile look",
    pack ? `${sentenceCase(pack)} included in the sales package` : "Practical sales package for easy use",
    category ? `Suitable for ${category.toLowerCase()} needs` : "Useful for home, office or daily needs",
  ];
  const bulletSource = [...features.map(sentenceCase), ...defaultFeatures];
  const bullets = uniqueWords(bulletSource).slice(0, 5).map((item) => item.replace(/[.!]+$/, ""));

  const featurePhrase = bullets.slice(0, 3).map((item) => item.toLowerCase()).join(", ");
  const englishDescription = `${brand ? `${brand} presents this ` : "This "}${name || "product"}${material ? ` in ${material}` : ""}${color ? ` with a ${color.toLowerCase()} finish` : ""}. It is designed for ${featurePhrase || "simple, dependable everyday use"}. ${pack ? `The package includes ${pack.toLowerCase()}. ` : ""}Please check the dimensions, compatibility and package contents before ordering.`;
  const hinglishDescription = `${brand ? `${brand} ka ` : "Yeh "}${name || "product"}${material ? ` ${material} material mein` : ""}${color ? ` aur ${color.toLowerCase()} colour mein` : ""} aata hai. Iska design daily use ko easy banane ke liye hai: ${featurePhrase || "strong build aur practical use"}. ${pack ? `Package mein ${pack.toLowerCase()} included hai. ` : ""}Order karne se pehle size, compatibility aur package contents zaroor check karein.`;

  const searchTerms = uniqueWords([
    keywords.join(","),
    name,
    category,
    `${material} ${name}`,
    `${color} ${name}`,
    `${name} online`,
  ]).join(", ");

  return {
    title,
    titleLimit: limit,
    bullets,
    description: language === "hinglish" ? hinglishDescription : englishDescription,
    searchTerms,
  };
}

export function skuGrossMargin(cost, price) {
  const costNumber = Math.max(0, toNumber(cost));
  const priceNumber = Math.max(0, toNumber(price));
  return priceNumber > 0 ? ((priceNumber - costNumber) / priceNumber) * 100 : 0;
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => cleanText(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => cleanText(value))) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map((header) => normalizeHeader(header));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, cleanText(values[index] || "")])));
}

function normalizeHeader(header) {
  const normalized = cleanText(header).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases = {
    order: "order_id",
    orderid: "order_id",
    order_no: "order_id",
    product_sku: "sku",
    product_id: "sku",
    order_status: "status",
    sale_price: "selling_price",
    price: "selling_price",
    amount: "selling_price",
    cost: "product_cost",
    purchase_cost: "product_cost",
    shipping_fee: "shipping",
    logistics_fee: "shipping",
    commission: "platform_fee",
    marketplace_fee: "platform_fee",
  };
  return aliases[normalized] || normalized;
}

export function analyzeOrders(rows) {
  const normalized = rows.map((row, index) => {
    const status = cleanText(row.status || "unknown").toLowerCase();
    const sellingPrice = toNumber(row.selling_price);
    const productCost = toNumber(row.product_cost);
    const shipping = toNumber(row.shipping);
    const platformFee = toNumber(row.platform_fee);
    const costs = productCost + shipping + platformFee;
    const isDelivered = ["delivered", "complete", "completed", "shipped"].some((value) => status.includes(value));
    const isReturn = status.includes("return") || status.includes("rto");
    const isCancelled = status.includes("cancel");
    const revenue = isDelivered && !isReturn && !isCancelled ? sellingPrice : 0;
    const chargedCosts = isCancelled ? 0 : (isReturn ? shipping + platformFee : costs);
    const profit = revenue - chargedCosts;
    return {
      orderId: cleanText(row.order_id) || `ROW-${index + 1}`,
      sku: cleanText(row.sku) || "—",
      status,
      sellingPrice,
      costs: chargedCosts,
      revenue,
      profit,
      isReturn,
    };
  });

  const total = normalized.length;
  const revenue = normalized.reduce((sum, row) => sum + row.revenue, 0);
  const profit = normalized.reduce((sum, row) => sum + row.profit, 0);
  const returnCount = normalized.filter((row) => row.isReturn).length;
  const returnRate = total ? (returnCount / total) * 100 : 0;

  return { rows: normalized, total, revenue, profit, returnCount, returnRate };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
