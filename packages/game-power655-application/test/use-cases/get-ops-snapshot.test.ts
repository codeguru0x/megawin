/**
 * Power 6/55 – Integration test: GetOpsSnapshotUseCase (p0-03, rủi ro R1)
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ `global-config.test.ts` /
 * `stats-repos-idempotency.test.ts`. Đi qua ĐÚNG đường thật (repo → mapper → use-case)
 * để bắt lỗi tích hợp giữa các tầng.
 *
 * ## Rủi ro test (p0-03)
 *
 * - **R1** (BO trắng trang khi worker CHƯA chạy / stats doc CHƯA có): snapshot 1 kỳ chưa
 *   có cược PHẢI trả zero-value shape (`stats: null`, mảng rỗng, `exposure: null`,
 *   `alertCounts` đủ 3 key = 0) và KHÔNG throw — mapper/use-case normalize thay vì crash.
 * - **Shape đầy đủ**: sau khi seed stats/number/account/combo/alert docs → snapshot gộp
 *   đúng từ 5 nguồn, `thresholds` + `pollSeconds` lấy từ config (KHÔNG hardcode).
 *
 * `drawId` giả lập RÕ RÀNG không trùng draw thật (`9998-...`) để không đụng draw/cycle
 * thật; cleanup toàn bộ ở `afterAll`.
 */

import { OpsAlertSeverity, OpsAlertStatus, PlayType, Power655OpsAlertType } from "@megawin/game-power655/entities";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { globalConfigCache } from "../../src/caches/global-config.cache";
import { AccountStatsRepository } from "../../src/infras/repos/account-stats-repo";
import { BettingStatsRepository } from "../../src/infras/repos/betting-stats-repo";
import { ComboAccountsRepository } from "../../src/infras/repos/combo-accounts-repo";
import { ComboStatsRepository } from "../../src/infras/repos/combo-stats-repo";
import { JackpotCycleRepository } from "../../src/infras/repos/jackpot-cycle-repo";
import { NumberStatsRepository } from "../../src/infras/repos/number-stats-repo";
import { OpsAlertRepository } from "../../src/infras/repos/ops-alert-repo";
import type {
  AccountStatsDelta,
  ComboStatsDelta,
  DrawStatsDelta,
  NumberStatsDelta,
} from "../../src/infras/repos/types";
import type { GetOpsSnapshotOutput } from "../../src/use-cases/operations/dto/ops.dto";
import { GetOpsSnapshotUseCase } from "../../src/use-cases/operations/get-ops-snapshot";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

// Kỳ zero-value (không seed stats) tách riêng kỳ full-shape để 2 test độc lập.
const EMPTY_DRAW_ID = "9998-01-01.001";
const FULL_DRAW_ID = "9998-02-02.001";

// Config: tier1 dùng để đối chiếu `exposure.fixedWorstCase` KHÔNG cần (đọc thẳng từ doc).
const TIER1 = DEFAULT_POWER655_CONFIG.defaultPrizes.tier1;

const statsRepo = new BettingStatsRepository();
const numberStatsRepo = new NumberStatsRepository();
const accountStatsRepo = new AccountStatsRepository();
const comboRepo = new ComboStatsRepository();
const comboAccountsRepo = new ComboAccountsRepository();
const alertRepo = new OpsAlertRepository();
const jackpotCycleRepo = new JackpotCycleRepository();

async function cleanup(): Promise<void> {
  for (const drawId of [EMPTY_DRAW_ID, FULL_DRAW_ID]) {
    await statsRepo.deleteMany({ drawId });
    await numberStatsRepo.deleteMany({ drawId });
    await accountStatsRepo.deleteMany({ drawId });
    await comboRepo.deleteMany({ drawId });
    await comboAccountsRepo.deleteMany({ drawId });
    await alertRepo.deleteMany({ drawId });
  }
}

beforeAll(async () => {
  // Dọn rác lần chạy trước bị gián đoạn (DB dùng chung), rồi seed config đầy đủ.
  await cleanup();
  // Seed config (không có `ops` → mapper merge DEFAULT_POWER655_CONFIG.ops) + invalidate
  // cache (TTL 10 phút, không tự thấy thay đổi ngoài luồng use-case update).
  await insertDefaultGlobalConfig();
  await globalConfigCache.invalidate();
});

afterAll(async () => {
  await cleanup();
});

describe("GetOpsSnapshotUseCase — R1: kỳ CHƯA có stats doc (worker chưa chạy)", () => {
  it("trả zero-value shape đầy đủ, KHÔNG throw", async () => {
    const snapshot = await new GetOpsSnapshotUseCase().run({ drawId: EMPTY_DRAW_ID });

    expect(snapshot.drawId).toBe(EMPTY_DRAW_ID);
    // Không có draw thật với drawId giả → status null (FE hiểu là chưa xác định).
    expect(snapshot.drawStatus).toBeNull();
    // Chưa có cược ⇒ stats doc chưa tạo ⇒ 4 collection kia cũng rỗng → khỏi query.
    expect(snapshot.stats).toBeNull();
    expect(snapshot.numberStats).toEqual([]);
    expect(snapshot.topCombos).toEqual([]);
    expect(snapshot.topAccounts).toEqual([]);
    expect(snapshot.uniquePlayers).toBe(0);
    // Exposure null khi chưa có stats doc (buildExposure không chạy).
    expect(snapshot.exposure).toBeNull();
    // alertCounts LUÔN đủ 3 key = 0 (reader không phải `?? 0`).
    expect(snapshot.alertCounts).toEqual({
      [OpsAlertStatus.New]: 0,
      [OpsAlertStatus.Ack]: 0,
      [OpsAlertStatus.Resolved]: 0,
    });
    // Thresholds + pollSeconds LUÔN có (lấy từ config, KHÔNG phụ thuộc stats doc).
    expect(snapshot.thresholds.largeBetAmount).toBe(DEFAULT_POWER655_CONFIG.ops.alerts.largeBetAmount);
    expect(snapshot.thresholds.fixedExposureWarnAmount).toBe(
      DEFAULT_POWER655_CONFIG.ops.alerts.fixedExposureWarnAmount,
    );
    expect(snapshot.thresholds.comboAccountsWarn).toBe(DEFAULT_POWER655_CONFIG.ops.alerts.comboAccountsWarn);
    expect(snapshot.thresholds.baoHighStakeAmount).toBe(DEFAULT_POWER655_CONFIG.ops.alerts.baoHighStakeAmount);
    expect(snapshot.pollSeconds).toBe(DEFAULT_POWER655_CONFIG.ops.stats.tickSeconds);
  });
});

describe("GetOpsSnapshotUseCase — shape đầy đủ khi đã có stats/number/account/combo/alert", () => {
  const comboKey = `${PlayType.Standard}:01,05,12,23,34,45`;
  const mainNumbers = ["01", "05", "12", "23", "34", "45"];
  const fixedWorstCase = 3 * TIER1; // 3 sets × tier1.

  beforeAll(async () => {
    const batchMaxId = new ObjectId().toHexString();

    // ── 1. betting stats doc ──────────────────────────────────────────────
    await statsRepo.ensureDocs([FULL_DRAW_ID]);
    const statsDelta: DrawStatsDelta = {
      totals: { revenue: 30_000, entries: 3, sets: 3, commission: 0, largeBetCount: 0 },
      byPlayType: { [PlayType.Standard]: { amount: 30_000, sets: 3, boards: 3 } },
      byTenant: {},
      fixedWorstCase,
      topPotential: [],
    };
    await statsRepo.applyDelta(FULL_DRAW_ID, statsDelta, batchMaxId, 50);

    // ── 2. number stats (heatmap) — 6 số của combo, mỗi số 3 sets ─────────
    const numberDeltas: NumberStatsDelta[] = mainNumbers.map((number) => ({
      drawId: FULL_DRAW_ID,
      number,
      sets: 3,
      amount: 30_000,
      boards: 3,
    }));
    await numberStatsRepo.bulkUpsertDelta(numberDeltas, batchMaxId);

    // ── 3. account stats (topAccounts + uniquePlayers) — 3 account ────────
    const accountDeltas: AccountStatsDelta[] = [
      {
        drawId: FULL_DRAW_ID,
        accountId: "accA",
        username: "userA",
        amount: 15_000,
        entries: 1,
        sets: 1,
      },
      {
        drawId: FULL_DRAW_ID,
        accountId: "accB",
        username: "userB",
        amount: 10_000,
        entries: 1,
        sets: 1,
      },
      {
        drawId: FULL_DRAW_ID,
        accountId: "accC",
        username: "userC",
        amount: 5_000,
        entries: 1,
        sets: 1,
      },
    ];
    await accountStatsRepo.bulkUpsertDelta(accountDeltas, batchMaxId);

    // ── 4. combo stats (+ combo-accounts) — 1 combo, 3 account ────────────
    const comboDelta: ComboStatsDelta = {
      comboKey,
      drawId: FULL_DRAW_ID,
      playType: PlayType.Standard,
      mainNumbers,
      sets: 3,
      amount: 30_000,
      accounts: new Map([
        ["accA", { accountId: "accA", username: "userA", sets: 1, amount: 15_000 }],
        ["accB", { accountId: "accB", username: "userB", sets: 1, amount: 10_000 }],
        ["accC", { accountId: "accC", username: "userC", sets: 1, amount: 5_000 }],
      ]),
    };
    // Thứ tự ĐÚNG: comboAccounts → comboStats → count → sync (analysis §4.2(3)).
    await comboAccountsRepo.bulkUpsertDelta([comboDelta], batchMaxId);
    await comboRepo.bulkUpsertDelta([comboDelta], batchMaxId);
    const counts = await comboAccountsRepo.countAccountsByCombo(FULL_DRAW_ID, [comboKey]);
    await comboRepo.syncAccountCounts(FULL_DRAW_ID, counts);

    // ── 5. alert — 1 alert New cho kỳ này (badge header) ──────────────────
    await alertRepo.bulkUpsertByDedupe([
      {
        drawId: FULL_DRAW_ID,
        type: Power655OpsAlertType.ComboConcentration,
        severity: OpsAlertSeverity.Warning,
        status: OpsAlertStatus.New,
        payload: { comboKey, accountCount: 3 },
        dedupeKey: `combo:${comboKey}`,
        createdAt: new Date(),
      },
    ]);
  });

  it("stats doc có mặt → totals + exposure.fixedWorstCase đọc đúng", async () => {
    const snapshot = await new GetOpsSnapshotUseCase().run({ drawId: FULL_DRAW_ID });

    expect(snapshot.stats).not.toBeNull();
    expect(snapshot.stats!.totals.revenue).toBe(30_000);
    expect(snapshot.stats!.totals.sets).toBe(3);
    // Exposure fixed đọc THẲNG từ doc (RAW không cap — Power 6/55 không có maxPerDraw).
    expect(snapshot.exposure).not.toBeNull();
    expect(snapshot.exposure!.fixedWorstCase).toBe(fixedWorstCase);
    // Jackpot part: drawId giả KHÔNG có draw → buildExposure đọc cycle ACTIVE hiện hành.
    // DB dùng chung CÓ THỂ có cycle active thật (không kiểm soát trong test) → không hardcode
    // giá trị; chỉ khẳng định lấy đúng pool active và tổng = jp1 + jp2 (invariant use-case).
    const activeCycle = await jackpotCycleRepo.getActiveCycle();
    const expectedJp1 = activeCycle?.jackpot1CurrentAmount ?? 0;
    const expectedJp2 = activeCycle?.jackpot2CurrentAmount ?? 0;
    expect(snapshot.exposure!.jackpot1).toBe(expectedJp1);
    expect(snapshot.exposure!.jackpot2).toBe(expectedJp2);
    expect(snapshot.exposure!.jackpotExposure).toBe(expectedJp1 + expectedJp2);
  });

  it("numberStats trả heatmap 6 số đã cược", async () => {
    const snapshot = await new GetOpsSnapshotUseCase().run({ drawId: FULL_DRAW_ID });

    expect(snapshot.numberStats).toHaveLength(6);
    const numbers = snapshot.numberStats.map((n) => n.number).sort();
    expect(numbers).toEqual(mainNumbers.slice().sort());
    expect(snapshot.numberStats.every((n) => n.sets === 3)).toBe(true);
  });

  it("topAccounts sort tiền giảm dần + uniquePlayers = 3", async () => {
    const snapshot = await new GetOpsSnapshotUseCase().run({ drawId: FULL_DRAW_ID });

    expect(snapshot.uniquePlayers).toBe(3);
    expect(snapshot.topAccounts).toHaveLength(3);
    // sort({amount:-1}) → accA(15k) > accB(10k) > accC(5k).
    expect(snapshot.topAccounts.map((a) => a.accountId)).toEqual(["accA", "accB", "accC"]);
    expect(snapshot.topAccounts[0]!.amount).toBe(15_000);
  });

  it("topCombos derive từ combo_stats với accountCount đã sync = 3", async () => {
    const snapshot = await new GetOpsSnapshotUseCase().run({ drawId: FULL_DRAW_ID });

    expect(snapshot.topCombos).toHaveLength(1);
    const combo = snapshot.topCombos[0]!;
    expect(combo.comboKey).toBe(comboKey);
    expect(combo.playType).toBe(PlayType.Standard);
    expect(combo.mainNumbers).toEqual(mainNumbers);
    expect(combo.sets).toBe(3);
    expect(combo.accounts).toBe(3); // accountCount sau syncAccountCounts.
    expect(combo.amount).toBe(30_000);
  });

  it("alertCounts phản ánh alert New của kỳ", async () => {
    const snapshot = await new GetOpsSnapshotUseCase().run({ drawId: FULL_DRAW_ID });

    expect(snapshot.alertCounts[OpsAlertStatus.New]).toBe(1);
    expect(snapshot.alertCounts[OpsAlertStatus.Ack]).toBe(0);
    expect(snapshot.alertCounts[OpsAlertStatus.Resolved]).toBe(0);
  });
});
