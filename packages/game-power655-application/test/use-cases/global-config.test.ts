/**
 * Tests: GameConfigRepository – Power 6/55 Global Config
 *
 * Validates CRUD operations on the global config document:
 * - Seeded config matches DEFAULT_POWER655_CONFIG
 * - Dual jackpot settings (JP1 + JP2) are persisted correctly
 * - Financial rates, prize amounts (3 tiers, no consolation), and play rules
 * - Partial upsert preserves untouched fields
 * - Version auto-increments on each update
 */

import { systemActor } from "@megawin/audit/logger";
import { GameConfigScope } from "@megawin/game-core/entities";
import { Power655OpsAlertType } from "@megawin/game-power655/entities";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { globalConfigCache } from "../../src/caches/global-config.cache";
import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { GetGlobalConfigUseCase } from "../../src/use-cases/game-config/get-global-config";
import { UpdateGameConfigUseCase } from "../../src/use-cases/game-config/update-game-config";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Power 6/55 Global Config", () => {
  const repo = new GameConfigRepository();

  beforeAll(async () => {
    await insertDefaultGlobalConfig();
  });

  /** Validates the seeded document exists with scope=Global and no tenantId. */
  it("getGlobalConfig trả về config sau khi seed", async () => {
    const config = await repo.getGlobalConfig();

    expect(config).not.toBeNull();
    expect(config!.scope).toBe(GameConfigScope.Global);
    expect(config!.tenantId).toBeNull();
  });

  /** Validates dual jackpot settings: JP1 seed, JP2 seed, contribution ratios, overflow threshold. */
  it("global config có đầy đủ dual jackpot settings", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.jackpot).toBeDefined();
    expect(config!.jackpot.jackpot1.seedAmount).toBe(DEFAULT_POWER655_CONFIG.jackpot.jackpot1.seedAmount);
    expect(config!.jackpot.jackpot2.seedAmount).toBe(DEFAULT_POWER655_CONFIG.jackpot.jackpot2.seedAmount);
    expect(config!.jackpot.jp1ContributionRatio).toBe(DEFAULT_POWER655_CONFIG.jackpot.jp1ContributionRatio);
    expect(config!.jackpot.jp2ContributionRatio).toBe(DEFAULT_POWER655_CONFIG.jackpot.jp2ContributionRatio);
    expect(config!.jackpot.jp1OverflowThreshold).toBe(DEFAULT_POWER655_CONFIG.jackpot.jp1OverflowThreshold);
  });

  /** Validates financial rates: commission and company rates. */
  it("global config có đầy đủ financial rates", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.rates).toBeDefined();
    expect(config!.rates.defaultCommissionRate).toBe(DEFAULT_POWER655_CONFIG.rates.defaultCommissionRate);
    expect(config!.rates.companyRate).toBe(DEFAULT_POWER655_CONFIG.rates.companyRate);
  });

  /** Validates 3 prize tiers (tier1/tier2/tier3) — no tier4/tier5/consolation. */
  it("global config có đầy đủ default prizes (3 tiers)", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes).toBeDefined();
    expect(config!.defaultPrizes.tier1).toBe(DEFAULT_POWER655_CONFIG.defaultPrizes.tier1);
    expect(config!.defaultPrizes.tier2).toBe(DEFAULT_POWER655_CONFIG.defaultPrizes.tier2);
    expect(config!.defaultPrizes.tier3).toBe(DEFAULT_POWER655_CONFIG.defaultPrizes.tier3);
  });

  /** Validates play rules: unitPrice, maxBoards, maxDraws, salesClose, drawsPerDay, drawTimes, drawDaysOfWeek. */
  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(DEFAULT_POWER655_CONFIG.play.unitPrice);
    expect(config!.play.maxBoardsPerTicket).toBe(DEFAULT_POWER655_CONFIG.play.maxBoardsPerTicket);
    expect(config!.play.maxDrawCount).toBe(DEFAULT_POWER655_CONFIG.play.maxDrawCount);
    expect(config!.play.salesCloseBeforeMinutes).toBe(DEFAULT_POWER655_CONFIG.play.salesCloseBeforeMinutes);
    expect(config!.play.drawsPerDay).toBe(DEFAULT_POWER655_CONFIG.play.drawsPerDay);
    expect(config!.play.drawTimes).toEqual(DEFAULT_POWER655_CONFIG.play.drawTimes);
    expect(config!.play.drawDaysOfWeek).toEqual(DEFAULT_POWER655_CONFIG.play.drawDaysOfWeek);
  });

  /** Validates partial upsert updates only jackpot1 seedAmount while preserving other fields. */
  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      jackpot: {
        ...DEFAULT_POWER655_CONFIG.jackpot,
        jackpot1: { seedAmount: 50_000_000_000 },
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.jackpot.jackpot1.seedAmount).toBe(50_000_000_000);
    expect(updated!.jackpot.jackpot2.seedAmount).toBe(DEFAULT_POWER655_CONFIG.jackpot.jackpot2.seedAmount);
    expect(updated!.jackpot.jp1OverflowThreshold).toBe(DEFAULT_POWER655_CONFIG.jackpot.jp1OverflowThreshold);
  });

  /** Validates version auto-increments on each upsert call. */
  it("upsertGlobalConfig tăng version mỗi lần update", async () => {
    const before = await repo.getGlobalConfig();
    const versionBefore = before!.version;

    await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_POWER655_CONFIG.rates,
        companyRate: 0.18,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.rates.companyRate).toBe(0.18);
  });
});

/**
 * `GetGlobalConfigUseCase` + `GlobalConfigMapper` — merge default section `ops`
 * (analysis §3.8, divergence D4, p0-03 rủi ro R1/R2).
 *
 * Đi qua ĐÚNG đường thật (repo → mapper → cache → use-case) — KHÔNG mock, để bắt
 * đúng lỗi tích hợp giữa các tầng (VD quên invalidate cache sau khi sửa doc thẳng).
 */
describe("GetGlobalConfigUseCase — merge default ops khi thiếu doc/section", () => {
  const repo = new GameConfigRepository();

  // Mỗi test tự invalidate cache SAU KHI sửa doc trực tiếp — cache TTL 10 phút,
  // không tự phát hiện thay đổi ngoài luồng use-case update.
  afterAll(async () => {
    // Trả lại trạng thái đầy đủ cho các test file/describe khác trong cùng package
    // (nếu chạy cùng process) — seed lại full default config + ops.
    await insertDefaultGlobalConfig();
    await repo.upsertGlobalConfig({ ops: DEFAULT_POWER655_CONFIG.ops });
    await globalConfigCache.invalidate();
  });

  it("(a) chưa có global config doc → trả default virtual entity, KHÔNG throw", async () => {
    // SCOPED delete: CHỈ xoá global config (khớp filter `getGlobalConfig` = `{scope: Global}`).
    // TUYỆT ĐỐI KHÔNG `deleteMany({})` — collection `power655_game_configs` chứa CẢ tenant
    // config; `deleteMany({})` từng xoá sạch tenant config thật khi test trỏ vào DB dùng chung.
    await repo.deleteMany({ scope: GameConfigScope.Global });
    await globalConfigCache.invalidate();

    const config = await new GetGlobalConfigUseCase().run();

    // Sentinel virtual entity — chưa persist.
    expect(config.id).toBe("");
    expect(config.version).toBe(0);
    // Toàn bộ 5 nhóm = default tham khảo.
    expect(config.jackpot).toEqual(DEFAULT_POWER655_CONFIG.jackpot);
    expect(config.rates).toEqual(DEFAULT_POWER655_CONFIG.rates);
    expect(config.defaultPrizes).toEqual(DEFAULT_POWER655_CONFIG.defaultPrizes);
    expect(config.play).toEqual(DEFAULT_POWER655_CONFIG.play);
    expect(config.ops).toEqual(DEFAULT_POWER655_CONFIG.ops);
  });

  it("(b) doc tồn tại nhưng KHÔNG có field `ops` (doc trước p0-01) → merge default toàn bộ", async () => {
    await insertDefaultGlobalConfig(); // jackpot/rates/defaultPrizes/play — KHÔNG có ops.
    await globalConfigCache.invalidate();

    // Xác nhận doc raw thật sự thiếu `ops` trước khi test (tránh test giả nếu seed helper đổi).
    const coll = await repo.getCollection();
    const raw = await coll.findOne({ scope: GameConfigScope.Global });
    expect(raw?.ops).toBeUndefined();

    const config = await new GetGlobalConfigUseCase().run();

    expect(config.id).not.toBe(""); // Doc thật, có id.
    expect(config.ops).toEqual(DEFAULT_POWER655_CONFIG.ops);
  });

  it("(c) doc có `ops` MỘT PHẦN → field thiếu lấp default, field có giữ nguyên", async () => {
    await insertDefaultGlobalConfig();
    // Ghi thẳng vào doc 1 `ops` không đầy đủ — thiếu `baoHighStakeAmount`, thiếu
    // `Power655OpsAlertType.BaoHighStake` trong `enabled`, thiếu cả `stats.topCombosK`.
    const coll = await repo.getCollection();
    await coll.updateOne(
      { scope: GameConfigScope.Global },
      {
        $set: {
          ops: {
            alerts: {
              largeBetAmount: 99_000_000, // Field CÓ — phải giữ nguyên, không bị default đè.
              fixedExposureWarnAmount: 2_000_000_000,
              comboAccountsWarn: 5,
              // baoHighStakeAmount: thiếu.
              enabled: {
                [Power655OpsAlertType.LargeBet]: true,
                // BaoHighStake, ExposureThreshold, ComboConcentration, RevenueAnomaly, SettleStuck: thiếu.
              },
            },
            stats: {
              tickSeconds: 5, // Field CÓ — phải giữ nguyên.
              topPotentialK: 50,
              topAccountsK: 50,
              // topCombosK: thiếu.
            },
          },
        },
      },
    );
    await globalConfigCache.invalidate();

    const config = await new GetGlobalConfigUseCase().run();

    // Field có sẵn giữ nguyên.
    expect(config.ops.alerts.largeBetAmount).toBe(99_000_000);
    expect(config.ops.stats.tickSeconds).toBe(5);
    // Field thiếu lấp default.
    expect(config.ops.alerts.baoHighStakeAmount).toBe(DEFAULT_POWER655_CONFIG.ops.alerts.baoHighStakeAmount);
    expect(config.ops.stats.topCombosK).toBe(DEFAULT_POWER655_CONFIG.ops.stats.topCombosK);
    // `enabled` merge từng key — key có giữ, key thiếu lấp default.
    expect(config.ops.alerts.enabled[Power655OpsAlertType.LargeBet]).toBe(true);
    expect(config.ops.alerts.enabled[Power655OpsAlertType.BaoHighStake]).toBe(
      DEFAULT_POWER655_CONFIG.ops.alerts.enabled[Power655OpsAlertType.BaoHighStake],
    );
  });

  it("(d) update `ops` qua UpdateGameConfigUseCase rồi get lại → persist đúng", async () => {
    await insertDefaultGlobalConfig();
    await globalConfigCache.invalidate();

    await new UpdateGameConfigUseCase().run({
      ops: {
        alerts: { largeBetAmount: 50_000_000 },
        stats: { tickSeconds: 15 },
      },
      actor: systemActor(),
    });

    const config = await new GetGlobalConfigUseCase().run();

    expect(config.ops.alerts.largeBetAmount).toBe(50_000_000);
    expect(config.ops.stats.tickSeconds).toBe(15);
    // Field KHÔNG gửi trong input vẫn giữ default (existing lúc merge = insertDefaultGlobalConfig
    // không có `ops` → base = DEFAULT_POWER655_CONFIG.ops).
    expect(config.ops.alerts.fixedExposureWarnAmount).toBe(DEFAULT_POWER655_CONFIG.ops.alerts.fixedExposureWarnAmount);
  });
});
