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

import { describe, it, expect, beforeAll } from "vitest";
import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { GameConfigScope, GameProduct } from "@megawin/game-core/entities";
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
    expect(config!.jackpot.jackpot1.seedAmount).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jackpot1.seedAmount,
    );
    expect(config!.jackpot.jackpot2.seedAmount).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jackpot2.seedAmount,
    );
    expect(config!.jackpot.jp1ContributionRatio).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jp1ContributionRatio,
    );
    expect(config!.jackpot.jp2ContributionRatio).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jp2ContributionRatio,
    );
    expect(config!.jackpot.jp1OverflowThreshold).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jp1OverflowThreshold,
    );
  });

  /** Validates financial rates: commission and company rates. */
  it("global config có đầy đủ financial rates", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.rates).toBeDefined();
    expect(config!.rates.defaultCommissionRate).toBe(
      DEFAULT_POWER655_CONFIG.rates.defaultCommissionRate,
    );
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
    expect(config!.play.salesCloseBeforeMinutes).toBe(
      DEFAULT_POWER655_CONFIG.play.salesCloseBeforeMinutes,
    );
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
    expect(updated!.jackpot.jackpot2.seedAmount).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jackpot2.seedAmount,
    );
    expect(updated!.jackpot.jp1OverflowThreshold).toBe(
      DEFAULT_POWER655_CONFIG.jackpot.jp1OverflowThreshold,
    );
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
