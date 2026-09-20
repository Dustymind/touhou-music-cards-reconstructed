import { beforeEach, describe, expect, it } from "vitest";

import { shuffleWithSeed } from "../rng";
import { queueStoreFor } from "./queue";
import { useSeeds } from "./seeds";

const KEYS = ["a", "b", "c", "d", "e"];

/** 这个文件测的是队列本身的行为，固定用**原曲那把**（B：队列按音乐模式分键）。 */
const useQueue = queueStoreFor("originals");

const reset = (): void => {
  localStorage.clear();
  useQueue.setState({ order: [], temporaryDisabled: {}, currentKey: null });
  // 本机是权威端：随机动作才允许落地（D104）
  useSeeds.setState({ ownSeed: 20260919, adoptedSeed: null, authority: "authority", nonce: 0 });
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

describe("queue × 种子权威（D104）", () => {
  beforeEach(reset);

  it("重新抽选（权威端）：换新种子并洗牌，顺序是同一批角色", () => {
    const before = useSeeds.getState().ownSeed;
    useQueue.getState().regenerate(KEYS, true);
    const seed = useSeeds.getState().ownSeed;
    expect(seed).not.toBe(before);                                     // 换过种子
    expect([...useQueue.getState().order].sort()).toEqual([...KEYS].sort());
    expect(useQueue.getState().order).toEqual(shuffleWithSeed(KEYS, seed, "queue"));
  });

  it("重置顺序不需要随机数（两端都能各自执行），也不动种子", () => {
    const seed = useSeeds.getState().ownSeed;
    useSeeds.setState({ authority: "replica", adoptedSeed: 5 });
    useQueue.getState().regenerate(["b", "a"], false);
    expect(useQueue.getState().order).toEqual(["b", "a"]);
    expect(useQueue.getState().currentKey).toBe("b");
    expect(useSeeds.getState().ownSeed).toBe(seed);
  });

  it("副本端（联机客户端）：不能自己重新抽选，顺序保持不变等主机配置", () => {
    useSeeds.setState({ authority: "replica", adoptedSeed: 777 });
    const before = useQueue.getState().order;
    useQueue.getState().regenerate(KEYS, true);
    expect(useQueue.getState().order).toEqual(before);
  });

  it("采用主机种子：两端同种子 + 同角色列表 → 完全同一顺序", () => {
    useSeeds.setState({ ownSeed: 314159, adoptedSeed: null, authority: "authority" });
    useQueue.setState({ order: KEYS, currentKey: KEYS[0] });
    useQueue.getState().adoptSeed(314159);
    const hostOrder = useQueue.getState().order;

    // 客户端：同样的 key 列表，采用主机下发的种子
    useQueue.setState({ order: KEYS, currentKey: KEYS[0] });
    useSeeds.setState({ authority: "replica", adoptedSeed: 314159 });
    useQueue.getState().adoptSeed(314159);

    expect(useQueue.getState().order).toEqual(hostOrder);
    expect(useQueue.getState().currentKey).toBe(useQueue.getState().order[0]);
  });

  it("adopt / regenerate 都会清掉临时跳过（换了一套顺序，旧禁用没意义）", () => {
    useQueue.setState({ order: KEYS, temporaryDisabled: { a: true } });
    useQueue.getState().adoptSeed(4242);
    expect(useQueue.getState().temporaryDisabled).toEqual({});
  });
});
