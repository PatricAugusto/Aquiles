import assert from "node:assert/strict";
import test from "node:test";
import { parseAmount } from "./amount.js";

test("accepts positive whole-number quantities", () => {
  assert.equal(parseAmount("250"), 250);
  assert.equal(parseAmount(" 1 "), 1);
});

test("rejects non-positive, fractional, and unsafe quantities", () => {
  assert.equal(parseAmount("0"), undefined);
  assert.equal(parseAmount("-2"), undefined);
  assert.equal(parseAmount("1.5"), undefined);
  assert.equal(parseAmount("2147483648"), undefined);
  assert.equal(parseAmount("9007199254740992"), undefined);
  assert.equal(parseAmount("abc"), undefined);
});
