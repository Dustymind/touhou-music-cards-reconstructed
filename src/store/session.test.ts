import { beforeEach, describe, expect, it } from "vitest";

import { effectiveOrder } from "./session";

describe("effectiveOrder", () => {
  beforeEach(() => localStorage.clear());

  it("覆盖过的按 order 排前，未覆盖的保持注册顺序在后", () => {
    expect(effectiveOrder({}, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(effectiveOrder(
      { c: { enabled: true, order: 1 }, a: { enabled: false, order: 2 } },
      ["a", "b", "c"],
    )).toEqual(["c", "a", "b"]);
  });
});
