/**
 * PURE — không DB. Test codec `Date` ở biên L2 Redis (`json-date-codec.ts`).
 *
 * Codec này nằm trên đường đọc/ghi của MỌI cache trong hệ thống (game config, tenant config,
 * jackpot cycle, tenant callback config), nên mỗi hành vi dưới đây là một cách nó có thể làm hỏng
 * dữ liệu toàn hệ thống nếu regress. Test đi qua `JSON.parse(JSON.stringify(...))` thật thay vì gọi
 * `decode(encode(x))` trực tiếp — vòng JSON chính là chỗ kiểu bị mất, bỏ nó ra thì test không chứng
 * minh được điều cần chứng minh.
 */

import { describe, expect, it } from "vitest";

import { decodeCacheValue, encodeCacheValue } from "../src/stores/json-date-codec";

/** Mô phỏng đúng đường đi thật: `set` encode → Redis stringify → `get` parse → decode. */
function roundTrip<T>(value: T): unknown {
  return decodeCacheValue(JSON.parse(JSON.stringify(encodeCacheValue(value))));
}

describe("json-date-codec", () => {
  it("giữ nguyên kiểu Date qua vòng JSON — bug gốc 17/08", () => {
    const now = new Date("2026-08-17T09:30:00.000Z");
    // Envelope `{ v }` của cached-fetcher, đúng shape thật đi vào store.
    const out = roundTrip({ v: { id: "cfg1", updatedAt: now, version: 3 } }) as {
      v: { updatedAt: Date; version: number };
    };

    expect(out.v.updatedAt).toBeInstanceOf(Date);
    expect(out.v.updatedAt.toISOString()).toBe(now.toISOString());
    expect(out.v.version).toBe(3);
  });

  it("giữ Date lồng sâu trong object/array", () => {
    const d1 = new Date("2026-01-02T03:04:05.000Z");
    const d2 = new Date("2026-06-07T08:09:10.000Z");
    const out = roundTrip({ cycles: [{ startedAt: d1 }, { nested: { closedAt: d2 } }] }) as {
      cycles: [{ startedAt: Date }, { nested: { closedAt: Date } }];
    };

    expect(out.cycles[0].startedAt).toBeInstanceOf(Date);
    expect(out.cycles[1].nested.closedAt.toISOString()).toBe(d2.toISOString());
  });

  it("KHÔNG đổi string trông giống ISO thành Date", () => {
    // Chốt quyết định thiết kế: không dùng heuristic. `drawId`/`firstDrawTime` là string nghiệp vụ,
    // biến chúng thành Date sẽ tạo bug ngược hướng, khó tìm hơn bug đang sửa.
    const out = roundTrip({
      drawId: "2026-03-07.001",
      firstDrawTime: "2026-03-07T10:00:00.000Z",
      note: "2026-03-07",
    }) as Record<string, unknown>;

    expect(typeof out.drawId).toBe("string");
    expect(typeof out.firstDrawTime).toBe("string");
    expect(typeof out.note).toBe("string");
  });

  it("tương thích ngược: ISO string trần (entry bản cũ) giữ nguyên string", () => {
    // Entry ghi trước khi codec deploy vẫn nằm trong Redis tới hết TTL. Không được throw, và cũng
    // không được đoán rằng đó là Date.
    const legacy = JSON.parse('{"v":{"updatedAt":"2026-08-17T09:30:00.000Z"}}');
    const out = decodeCacheValue(legacy) as { v: { updatedAt: unknown } };

    expect(typeof out.v.updatedAt).toBe("string");
  });

  it("giữ nguyên null/undefined/number/boolean và mảng rỗng", () => {
    const out = roundTrip({ v: null, arr: [], flag: false, count: 0 }) as Record<string, unknown>;

    expect(out.v).toBeNull();
    expect(out.arr).toEqual([]);
    expect(out.flag).toBe(false);
    expect(out.count).toBe(0);
  });

  it("Invalid Date → null, KHÔNG throw (nếu throw thì cache im lặng không bao giờ ghi được)", () => {
    // `RedisCacheStore.set` bọc try/catch fail-open ⇒ exception ở encode = mất cache vĩnh viễn mà
    // chỉ để lại 1 dòng logWarn. Khớp hành vi `JSON.stringify(new Date(NaN))` = `null`.
    expect(() => encodeCacheValue({ at: new Date("rác") })).not.toThrow();
    expect(roundTrip({ at: new Date("rác") })).toEqual({ at: null });
  });

  it("không làm mất field tên `__proto__` và không đổi prototype của object dựng ra", () => {
    // Gán `out["__proto__"] = v` KHÔNG tạo own property mà đổi prototype ⇒ field biến mất. Đây là
    // ca duy nhất mà một phép gán bình thường lại làm codec MẤT dữ liệu mà JSON round-trip cũ giữ.
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"ok":1}');
    const decoded = decodeCacheValue(hostile) as Record<string, unknown>;

    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(decoded.ok).toBe(1);
    // Không rò rỉ ra prototype toàn cục.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const encoded = encodeCacheValue(hostile) as Record<string, unknown>;
    expect(Object.getPrototypeOf(encoded)).toBe(Object.prototype);
    expect(Object.hasOwn(encoded, "__proto__")).toBe(true);
  });

  it("object thật có field `$date` kèm field khác KHÔNG bị hiểu thành Date", () => {
    const out = roundTrip({ $date: "2026-08-17T00:00:00.000Z", other: 1 }) as Record<string, unknown>;

    expect(typeof out.$date).toBe("string");
    expect(out.other).toBe(1);
  });

  it("giữ nguyên class instance lạ (codec KHÔNG phải bộ sanitize JSON)", () => {
    // Chốt phạm vi: codec chỉ lo `Date`. Class instance khác vẫn theo semantics JSON như trước —
    // ai cần payload plain thì dùng `serializeDates`/`toToolResult`, không phải codec này.
    class Money {
      amount = 100;
    }
    const out = roundTrip({ price: new Money() }) as { price: { amount: number } };

    expect(out.price).toEqual({ amount: 100 });
    expect(out.price).not.toBeInstanceOf(Money);
  });
});
