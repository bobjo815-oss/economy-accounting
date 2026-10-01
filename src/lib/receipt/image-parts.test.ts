import assert from "node:assert/strict";
import test from "node:test";
import { imagePartBoxes } from "./image-parts.ts";

test("four receipts in a portrait photo become four distinct non-overlapping bands", () => {
  assert.deepEqual(imagePartBoxes(2252, 4000, { axis: "rows", count: 4, rotation: 270 }), [
    { x: 0, y: 0, width: 2252, height: 1000 },
    { x: 0, y: 1000, width: 2252, height: 1000 },
    { x: 0, y: 2000, width: 2252, height: 1000 },
    { x: 0, y: 3000, width: 2252, height: 1000 },
  ]);
});

test("column split covers every pixel without overlap", () => {
  const boxes = imagePartBoxes(1001, 600, { axis: "columns", count: 3, rotation: 0 });
  assert.equal(boxes[0].x, 0);
  assert.equal(boxes[2].x + boxes[2].width, 1001);
  assert.ok(boxes.every((box, index) => index === 0 || boxes[index - 1].x + boxes[index - 1].width === box.x));
});
