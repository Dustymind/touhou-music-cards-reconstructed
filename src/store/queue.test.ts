import { beforeEach, describe, expect, it } from "vitest";

import { useQueue } from "./queue";

const reset = (): void => {
  localStorage.clear();
  useQueue.setState({ order: [], temporaryDisabled: {}, currentKey: null, seed: 0 });
};

describe("queue", () => {
  beforeEach(reset);

  it("syncKeys 补齐新增角色、剔除消失的，并修正当前角色", () => {
    useQueue.setState({ order: ["a", "b"], currentKey: "b" });
    useQueue.getState().syncKeys(["a", "c"]);
    expect(useQueue.getState().order).toEqual(["a", "c"]);
    expect(useQueue.getState().currentKey).toBe("a");
  });

  it("regenerate 打乱/重置顺序并清空临时跳过", () => {
    useQueue.getState().regenerate(["a", "b", "c"], false);
    expect(useQueue.getState().order).toEqual(["a", "b", "c"]);
    expect(useQueue.getState().currentKey).toBe("a");
    useQueue.getState().toggleTemporary("b");
    useQueue.getState().regenerate(["a", "b", "c"], true);
    expect(useQueue.getState().temporaryDisabled).toEqual({});
  });

  it("step 环形推进并跳过临时禁用", () => {
    useQueue.getState().regenerate(["a", "b", "c"], false);
    useQueue.getState().toggleTemporary("b");
    expect(useQueue.getState().step(1, ["a", "b", "c"])).toBe("c");
    expect(useQueue.getState().step(1, ["a", "b", "c"])).toBe("a");
    expect(useQueue.getState().step(-1, ["a", "b", "c"])).toBe("c");
  });

  it("全部临时禁用时 step 返回 null", () => {
    useQueue.getState().regenerate(["a", "b"], false);
    useQueue.getState().toggleTemporary("a");
    useQueue.getState().toggleTemporary("b");
    expect(useQueue.getState().step(1, ["a", "b"])).toBeNull();
  });

  it("允许集合之外的 key 不参与轮转", () => {
    useQueue.getState().regenerate(["a", "b", "c"], false);
    expect(useQueue.getState().step(1, ["c"])).toBe("c");
  });
});
