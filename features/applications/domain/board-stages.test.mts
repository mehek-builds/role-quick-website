import assert from "node:assert/strict";
import test from "node:test";
import { activeBoardStages } from "./board-stages.ts";

test("the application board keeps only active pipeline stages", () => {
  assert.deepEqual(
    activeBoardStages(["saved", "applied", "interview", "offer", "closed"]),
    ["applied", "interview", "offer"],
  );
});

test("the application board preserves the server's active-stage order", () => {
  assert.deepEqual(activeBoardStages(["offer", "saved", "applied"]), ["offer", "applied"]);
  assert.deepEqual(activeBoardStages([]), []);
});
