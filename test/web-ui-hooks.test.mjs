import test from "node:test";
import assert from "node:assert/strict";

import { createQuerySequence } from "../web/client/src/hooks.js";

test("a query sequence csak a legfrissebb futást tekinti aktuálisnak", () => {
  const sequence = createQuerySequence();
  const first = sequence.begin();

  assert.equal(sequence.isCurrent(first), true);

  const second = sequence.begin();

  assert.equal(sequence.isCurrent(first), false);
  assert.equal(sequence.isCurrent(second), true);

  const third = sequence.begin();

  assert.equal(sequence.isCurrent(second), false);
  assert.equal(sequence.isCurrent(third), true);
});
