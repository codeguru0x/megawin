/**
 * Power 6/55 – Integration test: idempotency của stats repos (p0-02, rủi ro R1 + R5)
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ `global-config.test.ts`. Dùng
 * `drawId` giả lập RÕ RÀNG không trùng draw thật (`9999-...`), cleanup toàn bộ ở
 * `afterAll` để không rớt rác vào DB dùng chung.
 *
 * ## Rủi ro test
 *
 * - **R1** (double-count sau crash): gọi `applyDelta`/`bulkUpsertDelta` 2 LẦN với CÙNG
 *   `batchMaxId` → giá trị PHẢI giữ nguyên (watermark `$lt` per-doc chặn áp lại).
 * - **R5** (`syncAccountCounts` đếm sai nếu combo-accounts ghi sau combo): 3 account cùng
 *   cược 1 combo → `accountCount` PHẢI = 3 sau khi ghi đúng thứ tự
 *   comboAccounts → `countAccountsByCombo` → `syncAccountCounts`.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { ObjectId } from "mongodb";
import { BettingStatsRepository } from "../../src/infras/repos/betting-stats-repo";
import { ComboStatsRepository } from "../../src/infras/repos/combo-stats-repo";
import { ComboAccountsRepository } from "../../src/infras/repos/combo-accounts-repo";
import type { ComboStatsDelta, DrawStatsDelta } from "../../src/infras/repos/types";
import { PlayType } from "@megawin/game-power655/entities";

const TEST_DRAW_ID = "9999-01-01.001"; // Không trùng draw thật (drawTimes/drawDaysOfWeek giới hạn).

const statsRepo = new BettingStatsRepository();
const comboRepo = new ComboStatsRepository();
const comboAccountsRepo = new ComboAccountsRepository();

afterAll(async () => {
  await statsRepo.deleteMany({ drawId: TEST_DRAW_ID });
  await comboRepo.deleteMany({ drawId: TEST_DRAW_ID });
  await comboAccountsRepo.deleteMany({ drawId: TEST_DRAW_ID });
});

// Dọn rác từ lần chạy trước bị gián đoạn (DB dùng chung): mỗi test tự tạo baseline sạch,
// không phụ thuộc `afterAll` của lần trước chạy xong (crash/interrupt giữa chừng → doc sót).
beforeAll(async () => {
  await statsRepo.deleteMany({ drawId: TEST_DRAW_ID });
  await comboRepo.deleteMany({ drawId: TEST_DRAW_ID });
  await comboAccountsRepo.deleteMany({ drawId: TEST_DRAW_ID });
});

describe("BettingStatsRepository.applyDelta — idempotent theo watermark (R1)", () => {
  it("gọi 2 lần CÙNG batchMaxId → doc chỉ nhận delta 1 lần", async () => {
    await statsRepo.ensureDocs([TEST_DRAW_ID]);

    const batchMaxId = new ObjectId().toHexString();
    const delta: DrawStatsDelta = {
      totals: { revenue: 100_000, entries: 1, sets: 1, commission: 0, largeBetCount: 0 },
      byPlayType: { [PlayType.Standard]: { amount: 100_000, sets: 1, boards: 1 } },
      byTenant: {},
      fixedWorstCase: 40_000_000,
      topPotential: [],
    };

    const applied1 = await statsRepo.applyDelta(TEST_DRAW_ID, delta, batchMaxId, 50);
    expect(applied1).toBe(true);

    // Gọi LẦN 2 với CÙNG batchMaxId — filter `lastEntryId: {$lt: batchMaxId}` phải KHÔNG khớp.
    const applied2 = await statsRepo.applyDelta(TEST_DRAW_ID, delta, batchMaxId, 50);
    expect(applied2).toBe(false); // no-op — batch đã áp trước đó.

    const doc = await statsRepo.findByDrawId(TEST_DRAW_ID);
    expect(doc!.totals.revenue).toBe(100_000); // KHÔNG double thành 200_000.
    expect(doc!.totals.entries).toBe(1);
    expect(doc!.byPlayType[PlayType.Standard]!.amount).toBe(100_000);
    expect(doc!.exposure.fixedWorstCase).toBe(40_000_000);
    expect(doc!.lastEntryId).toBe(batchMaxId);
  });

  it("batch KẾ TIẾP (batchMaxId lớn hơn) → cộng tiếp đúng, không mất delta cũ", async () => {
    const batchMaxId2 = new ObjectId().toHexString();
    const delta2: DrawStatsDelta = {
      totals: { revenue: 50_000, entries: 1, sets: 1, commission: 0, largeBetCount: 0 },
      byPlayType: { [PlayType.Standard]: { amount: 50_000, sets: 1, boards: 1 } },
      byTenant: {},
      fixedWorstCase: 40_000_000,
      topPotential: [],
    };

    const applied = await statsRepo.applyDelta(TEST_DRAW_ID, delta2, batchMaxId2, 50);
    expect(applied).toBe(true);

    const doc = await statsRepo.findByDrawId(TEST_DRAW_ID);
    // Cộng dồn với batch trước: 100_000 (batch 1) + 50_000 (batch 2) = 150_000.
    expect(doc!.totals.revenue).toBe(150_000);
    expect(doc!.exposure.fixedWorstCase).toBe(80_000_000);
    expect(doc!.lastEntryId).toBe(batchMaxId2);
  });
});

describe("ComboStatsRepository + ComboAccountsRepository — thứ tự ghi & idempotency (R1, R5)", () => {
  const comboKey = `${PlayType.Standard}:01,05,12,23,34,45`;
  const mainNumbers = ["01", "05", "12", "23", "34", "45"];

  it("3 account cùng cược 1 combo → accountCount = 3 (đúng thứ tự comboAccounts → count → sync)", async () => {
    const batchMaxId = new ObjectId().toHexString();
    const delta: ComboStatsDelta = {
      comboKey,
      drawId: TEST_DRAW_ID,
      playType: PlayType.Standard,
      mainNumbers,
      sets: 3,
      amount: 30_000,
      accounts: new Map([
        ["accA", { accountId: "accA", username: "userA", sets: 1, amount: 10_000 }],
        ["accB", { accountId: "accB", username: "userB", sets: 1, amount: 10_000 }],
        ["accC", { accountId: "accC", username: "userC", sets: 1, amount: 10_000 }],
      ]),
    };

    // Thứ tự ĐÚNG theo analysis §4.2(3): comboAccounts → comboStats → count → sync.
    await comboAccountsRepo.bulkUpsertDelta([delta], batchMaxId);
    await comboRepo.bulkUpsertDelta([delta], batchMaxId);
    const counts = await comboAccountsRepo.countAccountsByCombo(TEST_DRAW_ID, [comboKey]);
    await comboRepo.syncAccountCounts(TEST_DRAW_ID, counts);

    expect(counts.get(comboKey)).toBe(3);
    const combo = await comboRepo.findByComboKey(TEST_DRAW_ID, comboKey);
    expect(combo!.accountCount).toBe(3);
    expect(combo!.sets).toBe(3);
    expect(combo!.amount).toBe(30_000);

    const accounts = await comboAccountsRepo.listByCombo(TEST_DRAW_ID, comboKey, 10);
    expect(accounts).toHaveLength(3);
  });

  it("bulkUpsertDelta CÙNG batchMaxId lần 2 → sets/amount KHÔNG double (R1)", async () => {
    const batchMaxId = new ObjectId().toHexString();
    const delta: ComboStatsDelta = {
      comboKey,
      drawId: TEST_DRAW_ID,
      playType: PlayType.Standard,
      mainNumbers,
      sets: 5,
      amount: 50_000,
      accounts: new Map([
        ["accA", { accountId: "accA", username: "userA", sets: 5, amount: 50_000 }],
      ]),
    };

    await comboAccountsRepo.bulkUpsertDelta([delta], batchMaxId);
    await comboRepo.bulkUpsertDelta([delta], batchMaxId);

    const before = await comboRepo.findByComboKey(TEST_DRAW_ID, comboKey);
    const setsBefore = before!.sets;
    const amountBefore = before!.amount;

    // Gọi lại CÙNG batchMaxId — watermark `$lt` phải chặn áp lại ở cả 2 collection.
    await comboAccountsRepo.bulkUpsertDelta([delta], batchMaxId);
    await comboRepo.bulkUpsertDelta([delta], batchMaxId);

    const after = await comboRepo.findByComboKey(TEST_DRAW_ID, comboKey);
    expect(after!.sets).toBe(setsBefore); // KHÔNG double.
    expect(after!.amount).toBe(amountBefore);
  });
});
