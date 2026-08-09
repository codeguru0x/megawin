/**
 * PURE — không DB (dùng BSON ObjectId/Long tạo doc giả, không kết nối Mongo).
 *
 * Unit test cho FeedSyncCursorMapper — map doc Mongo → entity:
 * `_id` (ObjectId) → `id` (hex), `lastVersion` (Long) → string.
 */

import { Long, ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { FeedSyncCursorMapper } from "../src/infras/mappers/feed-sync-cursor-mapper";

describe("FeedSyncCursorMapper", () => {
  it("map _id → id hex, lastVersion Long → string, giữ nguyên field khác", () => {
    const oid = new ObjectId();
    const doc = {
      _id: oid,
      lastVersion: Long.fromString("42"),
      gameId: "keno",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const entity = new FeedSyncCursorMapper().mapOne(doc);

    expect(entity).not.toBeNull();
    expect(entity!.id).toBe(oid.toHexString());
    expect(entity!.lastVersion).toBe("42");
    expect(entity!.gameProduct).toBe("keno");
    expect(entity!.updatedAt).toBeInstanceOf(Date);
  });
});
