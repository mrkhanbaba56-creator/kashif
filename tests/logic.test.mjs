import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeOrders,
  calculateProfit,
  createListing,
  parseCSV,
  skuGrossMargin,
} from "../logic.mjs";

test("profit calculation includes fees, fee GST and expected reverse charges", () => {
  const result = calculateProfit({
    price: 500,
    productCost: 200,
    shipping: 70,
    packaging: 10,
    feeRate: 5,
    feeGstRate: 18,
    returnRate: 10,
    rtoRate: 5,
    reverseCharge: 100,
    ads: 10,
  });
  assert.equal(result.platformFee, 25);
  assert.equal(result.feeGst, 4.5);
  assert.equal(result.expectedReturnCost, 15);
  assert.equal(result.totalCosts, 334.5);
  assert.equal(result.profit, 165.5);
});

test("listing maker respects marketplace title limits and creates five bullets", () => {
  const listing = createListing({
    marketplace: "meesho",
    name: "Adjustable Rolling Laptop Trolley Table With Wheels For Home Office Study Bedside Use",
    brand: "ELV DIRECT",
    material: "Metal",
    color: "Snow White",
    pack: "Pack of 1",
    category: "Home and Office",
    features: "height adjustable, 360 degree wheels, space saving, strong frame, multipurpose",
    keywords: "laptop table, rolling desk",
  });
  assert.ok(listing.title.length <= 120);
  assert.equal(listing.bullets.length, 5);
  assert.match(listing.searchTerms, /rolling desk/i);
});

test("CSV parser handles quoted commas and common aliases", () => {
  const rows = parseCSV('order,product_sku,order_status,price,cost,shipping_fee,commission\n"A,1",SKU-1,delivered,499,200,70,25');
  assert.equal(rows[0].order_id, "A,1");
  assert.equal(rows[0].sku, "SKU-1");
  assert.equal(rows[0].selling_price, "499");
});

test("order analytics excludes return revenue and cancelled costs", () => {
  const report = analyzeOrders([
    { order_id: "1", sku: "A", status: "delivered", selling_price: "500", product_cost: "200", shipping: "70", platform_fee: "25" },
    { order_id: "2", sku: "A", status: "return", selling_price: "500", product_cost: "200", shipping: "70", platform_fee: "25" },
    { order_id: "3", sku: "A", status: "cancelled", selling_price: "500", product_cost: "200", shipping: "70", platform_fee: "25" },
  ]);
  assert.equal(report.total, 3);
  assert.equal(report.revenue, 500);
  assert.equal(report.profit, 110);
  assert.equal(report.returnCount, 1);
});

test("SKU gross margin is calculated from selling price", () => {
  assert.equal(skuGrossMargin(300, 500), 40);
});
