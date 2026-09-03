/**
 * ResultFeed – Integration test: SourceRepository
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ
 * `game-power655-application/test/infras/stats-repos-idempotency.test.ts`. Dùng `sourceId`
 * sentinel rõ ràng không trùng nguồn thật, cleanup toàn bộ ở `afterAll`.
 */

import type { ResultFeedProviderId, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { ResultFeedGameKey, SourceRole } from "@megawin/resultfeed/entities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SourceEditableFields } from "../../src/infras/repos/source-repo";
import { SourceRepository } from "../../src/infras/repos/source-repo";

// Sentinel test source id — cast vì `ResultFeedSourceId` là literal union hardcode (chỉ chứa
// nguồn thật, xem `enums.ts`), không có nghĩa các nguồn test này phải nằm trong danh sách đó.
const TEST_SOURCE_ID_1 = "test-source-repo-1" as ResultFeedSourceId;
const TEST_SOURCE_ID_2 = "test-source-repo-2" as ResultFeedSourceId;

const repo = new SourceRepository();

const baseFields: SourceEditableFields = {
  name: "Test Source 1",
  baseUrl: "https://example.test",
  role: SourceRole.Reference,
  trustWeight: 50,
  gameKeys: [ResultFeedGameKey.Keno],
  isEnabled: true,
  providerId: "test-provider" as ResultFeedProviderId,
  parserVersion: "v1",
  requiresRender: false,
  minIntervalMs: 5000,
};

async function cleanup(): Promise<void> {
  await repo.deleteMany({ sourceId: TEST_SOURCE_ID_1 });
  await repo.deleteMany({ sourceId: TEST_SOURCE_ID_2 });
}

beforeAll(cleanup); // Dọn rác từ lần chạy trước bị gián đoạn (DB dùng chung).
afterAll(cleanup);

describe("SourceRepository.upsertBySourceId — idempotent theo sourceId", () => {
  it("lần gọi đầu (chưa có) → tạo mới, tìm được bằng findBySourceId", async () => {
    const applied = await repo.upsertBySourceId(TEST_SOURCE_ID_1, baseFields);
    expect(applied).toBe(true);

    const found = await repo.findBySourceId(TEST_SOURCE_ID_1);
    expect(found).not.toBeNull();
    expect(found!.sourceId).toBe(TEST_SOURCE_ID_1);
    expect(found!.name).toBe("Test Source 1");
    expect(found!.role).toBe(SourceRole.Reference);
    expect(found!.trustWeight).toBe(50);
    expect(found!.gameKeys).toEqual([ResultFeedGameKey.Keno]);
    expect(found!.isEnabled).toBe(true);
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });

  it("lần gọi thứ 2 (đã có) → cập nhật field editable, KHÔNG tạo doc mới, createdAt giữ nguyên", async () => {
    const before = await repo.findBySourceId(TEST_SOURCE_ID_1);
    const createdAtBefore = before!.createdAt;

    const applied = await repo.upsertBySourceId(TEST_SOURCE_ID_1, {
      ...baseFields,
      role: SourceRole.Authoritative,
      trustWeight: 90,
      isEnabled: false,
    });
    expect(applied).toBe(true);

    const after = await repo.findBySourceId(TEST_SOURCE_ID_1);
    expect(after!.role).toBe(SourceRole.Authoritative);
    expect(after!.trustWeight).toBe(90);
    expect(after!.isEnabled).toBe(false);
    expect(after!.createdAt.getTime()).toBe(createdAtBefore.getTime()); // KHÔNG tạo doc mới.

    const all = await repo.findMany({ sourceId: TEST_SOURCE_ID_1 });
    expect(all).toHaveLength(1); // Vẫn đúng 1 doc — không double-insert.
  });
});

describe("SourceRepository.findEnabledByGameKey — chỉ trả nguồn isEnabled=true", () => {
  beforeAll(async () => {
    await repo.upsertBySourceId(TEST_SOURCE_ID_1, {
      ...baseFields,
      isEnabled: true,
    }); // reset lại true
    await repo.upsertBySourceId(TEST_SOURCE_ID_2, {
      ...baseFields,
      isEnabled: false,
    });
  });

  it("nguồn isEnabled=false KHÔNG xuất hiện trong danh sách enabled", async () => {
    const enabled = await repo.findEnabledByGameKey(ResultFeedGameKey.Keno);
    const ids = enabled.map((s) => s.sourceId);

    expect(ids).toContain(TEST_SOURCE_ID_1);
    expect(ids).not.toContain(TEST_SOURCE_ID_2);
  });

  it("game khác (Bingo18) KHÔNG chứa nguồn chỉ khai báo cho Keno", async () => {
    const enabled = await repo.findEnabledByGameKey(ResultFeedGameKey.Bingo18);
    const ids = enabled.map((s) => s.sourceId);

    expect(ids).not.toContain(TEST_SOURCE_ID_1);
  });
});

describe("SourceRepository.listAll", () => {
  it("chứa cả 2 nguồn test, sort theo sourceId tăng", async () => {
    const all = await repo.listAll();
    const testSources = all.filter((s) => s.sourceId === TEST_SOURCE_ID_1 || s.sourceId === TEST_SOURCE_ID_2);

    expect(testSources).toHaveLength(2);
    expect(testSources[0]!.sourceId).toBe(TEST_SOURCE_ID_1); // "…-1" < "…-2"
  });
});
