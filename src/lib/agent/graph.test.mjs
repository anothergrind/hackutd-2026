// Run: npm test  (Node 24 strips TS types, so this imports graph.ts directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { blastRadius } from "./graph.ts";

const edges = [
  { upstream: "SWGR-1", downstream: "CHILLER-1", relation: "powers" },
  { upstream: "CHILLER-1", downstream: "CW-LOOP-1", relation: "cools" },
  { upstream: "CW-LOOP-1", downstream: "HALL-A", relation: "cools" },
  { upstream: "SWGR-1", downstream: "HALL-A", relation: "powers" },
  { upstream: "HALL-A", downstream: "SWGR-1", relation: "serves" }, // cycle
];

test("finds every downstream node at its shortest hop distance", () => {
  const r = blastRadius(edges, "SWGR-1");
  assert.deepEqual([...r.keys()].sort(), ["CHILLER-1", "CW-LOOP-1", "HALL-A"]);
  assert.equal(r.get("HALL-A").depth, 1);
  assert.equal(r.get("CW-LOOP-1").depth, 2);
  assert.equal(r.has("SWGR-1"), false); // cycle doesn't re-add the start
});

test("leaf node has empty blast radius", () => {
  assert.equal(blastRadius(edges, "NOPE").size, 0);
});
