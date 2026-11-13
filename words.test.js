const test = require("node:test");
const assert = require("node:assert");

const { WORDS, COMMON_COUNT, ANSWER_COUNT } = require("./words.js");

// Checks on the shipped Word List's layout. Expected numbers come from the
// Tier split described in the Word List's header.

test("Word List: 8,636 entries numbered 1 to 8,636 with no gaps or repeats", () => {
  assert.strictEqual(WORDS.length, 8636);
  const numbers = WORDS.map((e) => e.n).sort((a, b) => a - b);
  numbers.forEach((n, i) => assert.strictEqual(n, i + 1));
});

test("Word List: every word is unique, lowercase and five letters", () => {
  for (const { w } of WORDS) assert.match(w, /^[a-z]{5}$/);
  assert.strictEqual(new Set(WORDS.map((e) => e.w)).size, WORDS.length);
});

test("Word List: every entry has a numeric score", () => {
  for (const entry of WORDS) {
    assert.ok(typeof entry.z === "number" && Number.isFinite(entry.z), entry.w);
  }
});

test("Word List: Common count is 2,531 and Answer count is 4,548", () => {
  assert.strictEqual(COMMON_COUNT, 2531);
  assert.strictEqual(ANSWER_COUNT, 4548);
});

test("Word List: Common words score at least 3.0, Uncommon words below 3.0", () => {
  for (const { n, w, z } of WORDS) {
    if (n <= COMMON_COUNT) assert.ok(z >= 3.0, `Common ${w} scores ${z}`);
    else if (n <= ANSWER_COUNT) assert.ok(z < 3.0, `Uncommon ${w} scores ${z}`);
  }
});

test("Word List: spot checks from the spec land in the right Tier", () => {
  const byWord = new Map(WORDS.map((e) => [e.w, e.n]));
  const tier = (w) => (byWord.get(w) <= COMMON_COUNT ? "common" : byWord.get(w) <= ANSWER_COUNT ? "uncommon" : "guess-only");
  assert.strictEqual(tier("kanji"), "common");
  assert.strictEqual(tier("aloof"), "uncommon");
  assert.strictEqual(tier("duvet"), "uncommon");
  assert.strictEqual(tier("routs"), "uncommon");
});
