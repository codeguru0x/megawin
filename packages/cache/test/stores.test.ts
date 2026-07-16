import { describe, expect, it } from "vitest";
import { MemoryCacheStore } from "../src/stores/memory-store";
import { NoopCacheStore } from "../src/stores/noop-store";
import { TieredCache } from "../src/stores/tiered-store";

describe("MemoryCacheStore", () => {
  it("set/get roundtrip", async () => {
    const store = new MemoryCacheStore({ max: 10 });
    await store.set("k1", { v: 42 }, 60);
    expect(await store.get("k1")).toEqual({ v: 42 });
  });

  it("get miss trả undefined", async () => {
    const store = new MemoryCacheStore({ max: 10 });
    expect(await store.get("missing")).toBeUndefined();
  });

  it("ttlSec <= 0 không ghi", async () => {
    const store = new MemoryCacheStore({ max: 10 });
    await store.set("k1", { v: 1 }, 0);
    expect(await store.get("k1")).toBeUndefined();
  });

  it("hết TTL → miss", async () => {
    const store = new MemoryCacheStore({ max: 10 });
    await store.set("k1", { v: 1 }, 0.01);
    await new Promise((r) => setTimeout(r, 30));
    expect(await store.get("k1")).toBeUndefined();
  });

  it("LRU evict khi vượt max", async () => {
    const store = new MemoryCacheStore({ max: 2 });
    await store.set("k1", { v: 1 }, 60);
    await store.set("k2", { v: 2 }, 60);
    await store.set("k3", { v: 3 }, 60);
    expect(await store.get("k1")).toBeUndefined();
    expect(await store.get("k3")).toEqual({ v: 3 });
  });

  it("delete xoá key", async () => {
    const store = new MemoryCacheStore({ max: 10 });
    await store.set("k1", { v: 1 }, 60);
    await store.delete("k1");
    expect(await store.get("k1")).toBeUndefined();
  });

  it("deleteByPrefix chỉ xoá key match prefix", async () => {
    const store = new MemoryCacheStore({ max: 10 });
    await store.set("keno:config:v1", { v: 1 }, 60);
    await store.set("keno:config:v1:t1", { v: 2 }, 60);
    await store.set("mega645:config:v1", { v: 3 }, 60);
    await store.deleteByPrefix("keno:config:v1");
    expect(await store.get("keno:config:v1")).toBeUndefined();
    expect(await store.get("keno:config:v1:t1")).toBeUndefined();
    expect(await store.get("mega645:config:v1")).toEqual({ v: 3 });
  });
});

describe("NoopCacheStore", () => {
  it("get luôn miss, set/delete no-op", async () => {
    const store = new NoopCacheStore();
    await store.set();
    expect(await store.get()).toBeUndefined();
    await store.delete();
    await store.deleteByPrefix();
  });
});

describe("TieredCache", () => {
  const makeTiered = () => {
    const l1 = new MemoryCacheStore({ max: 10 });
    const l2 = new MemoryCacheStore({ max: 10 });
    const tiered = new TieredCache({ l1, l2, l1TtlSec: 5 });
    return { l1, l2, tiered };
  };

  it("set ghi cả 2 tầng", async () => {
    const { l1, l2, tiered } = makeTiered();
    await tiered.set("k", { v: 1 }, 60);
    expect(await l1.get("k")).toEqual({ v: 1 });
    expect(await l2.get("k")).toEqual({ v: 1 });
  });

  it("L1 miss + L2 hit → backfill L1", async () => {
    const { l1, l2, tiered } = makeTiered();
    await l2.set("k", { v: 7 }, 60);
    expect(await tiered.get("k")).toEqual({ v: 7 });
    expect(await l1.get("k")).toEqual({ v: 7 });
  });

  it("cả 2 miss → undefined", async () => {
    const { tiered } = makeTiered();
    expect(await tiered.get("missing")).toBeUndefined();
  });

  it("delete xoá cả 2 tầng", async () => {
    const { l1, l2, tiered } = makeTiered();
    await tiered.set("k", { v: 1 }, 60);
    await tiered.delete("k");
    expect(await l1.get("k")).toBeUndefined();
    expect(await l2.get("k")).toBeUndefined();
  });

  it("cache ngắn (ttlSec=2 < l1TtlSec=5) vẫn ghi L1 — L1 dùng min(ttlSec, l1TtlSec)", async () => {
    // min(2, 5) = 2 → L1 lưu với TTL 2s, không vượt ttlSec caller yêu cầu.
    const { l1, l2, tiered } = makeTiered();
    await tiered.set("k", { v: 9 }, 2);
    expect(await l1.get("k")).toEqual({ v: 9 });
    expect(await l2.get("k")).toEqual({ v: 9 });
  });
});
