const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSeedTransactions,
  formatCurrency,
  isInMonth,
  mockReceiptTemplates,
  pickMockReceipt,
  summarize,
  toMinor,
} = require("./app.js");

test("toMinor converts decimal amounts to integer minor units", () => {
  assert.equal(toMinor("36.50"), 3650);
  assert.equal(toMinor("0.1"), 10);
  assert.equal(toMinor("128"), 12800);
  assert.equal(toMinor("abc"), null);
});

test("formatCurrency renders two decimal places", () => {
  assert.match(formatCurrency(3650), /36\.50/);
  assert.match(formatCurrency(1280000), /12,?800\.00/);
});

test("summarize calculates monthly income, expense, balance, and count", () => {
  const now = new Date(2026, 8, 10);
  const summary = summarize(createSeedTransactions(now), now);

  assert.equal(summary.count, 8);
  assert.equal(summary.income, 1280000);
  assert.equal(summary.expense, 88500);
  assert.equal(summary.balance, 1191500);
});

test("isInMonth matches year and month", () => {
  const now = new Date(2026, 8, 10);
  assert.equal(isInMonth({ occurredAt: "2026-09-03" }, now), true);
  assert.equal(isInMonth({ occurredAt: "2026-10-03" }, now), false);
  assert.equal(isInMonth({ occurredAt: "2025-09-03" }, now), false);
});

test("pickMockReceipt is deterministic and returns a complete template", () => {
  const first = pickMockReceipt("receipt.jpg");
  const second = pickMockReceipt("receipt.jpg");

  assert.deepEqual(first, second);
  assert.ok(mockReceiptTemplates.includes(first));
  assert.equal(typeof first.merchant, "string");
  assert.ok(first.amountMinor > 0);
  assert.equal(typeof first.categoryId, "string");
});

test("seed transactions never contain future dates", () => {
  const now = new Date(2026, 8, 10);
  const transactions = createSeedTransactions(now);

  assert.ok(transactions.length > 0);
  transactions.forEach((transaction) => {
    assert.ok(transaction.occurredAt <= "2026-09-10");
    assert.ok(transaction.amountMinor > 0);
  });
});
