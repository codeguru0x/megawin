import { describe, expect, it, vi } from "vitest";

import { createCachedFetcher } from "../src/cached-fetcher";
import { MemoryCacheStore } from "../src/stores/memory-store";
import { NoopCacheStore } from "../src/stores/noop-store";
import type { CacheStore } from "../src/types";

const makeStore = () => new MemoryCacheStore({ max: 50 });

describe("createCachedFetcher — read-through", () => {
  it("miss → loader → hit không gọi loader", async () => {
    const loader = vi.fn(async () => ({ value: 1 }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:config:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch()).toEqual({ value: 1 });
    expect(await fetcher.fetch()).toEqual({ value: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("arg khác → key khác → loader gọi riêng", async () => {
    const loader = vi.fn(async (tenantId: string) => ({ tenantId }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:tenant-config:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch("t1")).toEqual({ tenantId: "t1" });
    expect(await fetcher.fetch("t2")).toEqual({ tenantId: "t2" });
    expect(await fetcher.fetch("t1")).toEqual({ tenantId: "t1" });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("createCachedFetcher — single-flight", () => {
  it("concurrent miss cùng key chỉ chạy loader 1 lần", async () => {
    let resolveLoader: (v: { n: number }) => void;
    const loader = vi.fn(() => new Promise<{ n: number }>((resolve) => (resolveLoader = resolve)));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:sf:v1",
      ttlSec: 60,
    });

    const p1 = fetcher.fetch();
    const p2 = fetcher.fetch();
    const p3 = fetcher.fetch();
    // Chờ microtask để store.get (async) resolve và loader được gọi.
    await vi.waitFor(() => expect(loader).toHaveBeenCalled());
    resolveLoader!({ n: 9 });

    expect(await Promise.all([p1, p2, p3])).toEqual([{ n: 9 }, { n: 9 }, { n: 9 }]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("loader reject → mọi caller đang chờ đều reject, lần sau retry", async () => {
    const loader = vi
      .fn<() => Promise<{ ok: boolean }>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ ok: true });
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:sf2:v1",
      ttlSec: 60,
    });

    await expect(fetcher.fetch()).rejects.toThrow("db down");
    expect(await fetcher.fetch()).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("createCachedFetcher — loader lỗi → throw (không stale)", () => {
  it("cache miss + loader lỗi → throw, KHÔNG che giấu lỗi source", async () => {
    const store = makeStore();
    const loader = vi
      .fn<() => Promise<{ v: number }>>()
      .mockResolvedValueOnce({ v: 1 })
      .mockRejectedValueOnce(new Error("db down"));
    const fetcher = createCachedFetcher(loader, {
      store,
      keyPrefix: "t:err:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch()).toEqual({ v: 1 });
    // Xoá cache trong store để force loader chạy lại — loader lỗi phải throw.
    await store.delete("t:err:v1");
    await expect(fetcher.fetch()).rejects.toThrow("db down");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("hit từ cache → KHÔNG gọi loader, không bị ảnh hưởng dù source down", async () => {
    const store = makeStore();
    const loader = vi.fn(async () => ({ v: 1 }));
    const fetcher = createCachedFetcher(loader, {
      store,
      keyPrefix: "t:err2:v1",
      ttlSec: 60,
    });

    await fetcher.fetch();
    expect(await fetcher.fetch()).toEqual({ v: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("createCachedFetcher — negative caching", () => {
  it("null được cache — loader không bị gọi lại", async () => {
    const loader = vi.fn(async () => null);
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:neg:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch()).toBeNull();
    expect(await fetcher.fetch()).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("negativeTtlSec=0 → null KHÔNG cache, loader gọi lại mỗi lần", async () => {
    const loader = vi.fn(async () => null);
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:neg2:v1",
      ttlSec: 60,
      negativeTtlSec: 0,
    });

    expect(await fetcher.fetch()).toBeNull();
    expect(await fetcher.fetch()).toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("createCachedFetcher — invalidation", () => {
  it("invalidate(arg) → lần fetch sau chạy lại loader", async () => {
    const loader = vi.fn(async (tenantId: string) => ({ tenantId, at: loader.mock.calls.length }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:inv:v1",
      ttlSec: 60,
    });

    await fetcher.fetch("t1");
    await fetcher.invalidate("t1");
    await fetcher.fetch("t1");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidateAll xoá mọi arg thuộc prefix", async () => {
    const loader = vi.fn(async (tenantId: string) => ({ tenantId }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:invall:v1",
      ttlSec: 60,
    });

    await fetcher.fetch("t1");
    await fetcher.fetch("t2");
    await fetcher.invalidateAll();
    await fetcher.fetch("t1");
    await fetcher.fetch("t2");
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("invalidate → lần fetch sau là cache miss, chạy lại loader từ source", async () => {
    const store = makeStore();
    const loader = vi
      .fn<() => Promise<{ v: number }>>()
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValueOnce({ v: 2 });
    const fetcher = createCachedFetcher(loader, {
      store,
      keyPrefix: "t:inv2:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch()).toEqual({ v: 1 });
    await fetcher.invalidate();
    // Cache đã xoá → fetch sau load lại từ source → giá trị mới.
    expect(await fetcher.fetch()).toEqual({ v: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("createCachedFetcher — key building", () => {
  it("arg chuỗi rỗng → throw (tránh collision với key global)", async () => {
    const loader = vi.fn(async (tenantId: string) => ({ tenantId }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:key:v1",
      ttlSec: 60,
    });

    await expect(fetcher.fetch("")).rejects.toThrow("discriminator rỗng");
    expect(loader).not.toHaveBeenCalled();
  });

  it("arg chứa ':' → throw (phá key convention)", async () => {
    const loader = vi.fn(async (id: string) => ({ id }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:key2:v1",
      ttlSec: 60,
    });

    await expect(fetcher.fetch("a:b")).rejects.toThrow('chứa ":"');
  });

  it("composite arg + keyOf → mỗi combination có key riêng", async () => {
    const loader = vi.fn(async (arg: { tenantId: string; drawId: string }) => ({ ...arg }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:key3:v1",
      ttlSec: 60,
      keyOf: ({ tenantId, drawId }) => `${tenantId}_${drawId}`,
    });

    await fetcher.fetch({ tenantId: "t1", drawId: "d1" });
    await fetcher.fetch({ tenantId: "t1", drawId: "d2" });
    await fetcher.fetch({ tenantId: "t1", drawId: "d1" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("composite arg KHÔNG có keyOf → throw (lỗi lập trình, fail sớm)", async () => {
    const loader = vi.fn(async (arg: { id: string }) => arg);
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:key4:v1",
      ttlSec: 60,
    });

    await expect(fetcher.fetch({ id: "x" })).rejects.toThrow("bắt buộc truyền keyOf");
  });
});

describe("createCachedFetcher — onEvent hook", () => {
  it("phát miss rồi hit, hook throw không ảnh hưởng flow", async () => {
    const events: string[] = [];
    const loader = vi.fn(async () => ({ v: 1 }));
    const fetcher = createCachedFetcher(loader, {
      store: makeStore(),
      keyPrefix: "t:evt:v1",
      ttlSec: 60,
      onEvent: (e) => {
        events.push(e.type);
        throw new Error("hook bị lỗi cũng không sao");
      },
    });

    expect(await fetcher.fetch()).toEqual({ v: 1 });
    expect(await fetcher.fetch()).toEqual({ v: 1 });
    expect(events).toEqual(["miss", "hit"]);
  });

  it("phát loader-error khi loader lỗi lúc cache miss", async () => {
    const events: string[] = [];
    const store = makeStore();
    const loader = vi
      .fn<() => Promise<{ v: number }>>()
      .mockResolvedValueOnce({ v: 1 })
      .mockRejectedValue(new Error("db down"));
    const fetcher = createCachedFetcher(loader, {
      store,
      keyPrefix: "t:evt2:v1",
      ttlSec: 60,
      onEvent: (e) => events.push(e.type),
    });

    await fetcher.fetch();
    await store.delete("t:evt2:v1");
    await expect(fetcher.fetch()).rejects.toThrow("db down"); // loader-error
    expect(events).toEqual(["miss", "miss", "loader-error"]);
  });
});

describe("createCachedFetcher — fail-open với store lỗi", () => {
  it("store get/set throw-free (Noop) → mọi call đều chạy loader, không throw", async () => {
    const loader = vi.fn(async () => ({ v: 1 }));
    const fetcher = createCachedFetcher(loader, {
      store: new NoopCacheStore(),
      keyPrefix: "t:noop:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch()).toEqual({ v: 1 });
    expect(await fetcher.fetch()).toEqual({ v: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("hoạt động đúng với store custom fail-open trả undefined", async () => {
    // Store giả lập backend chết nhưng tuân thủ contract fail-open.
    const brokenStore: CacheStore = {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
      deleteByPrefix: async () => {},
    };
    const loader = vi.fn(async () => ({ v: 2 }));
    const fetcher = createCachedFetcher(loader, {
      store: brokenStore,
      keyPrefix: "t:broken:v1",
      ttlSec: 60,
    });

    expect(await fetcher.fetch()).toEqual({ v: 2 });
  });
});
