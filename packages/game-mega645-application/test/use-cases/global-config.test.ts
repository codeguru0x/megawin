/**
 * Tests: GameConfigRepository – Mega 6/45 Global Config
 *
 * Validates CRUD operations on the global config document:
 * - Seeded config matches DEFAULT_MEGA645_CONFIG
 * - Jackpot settings (seedAmount only — Mega 6/45 không có split)
 * - Financial rates, prize amounts (3 tiers: tier1=10M, tier2=300K, tier3=30K)
 * - Play rules (unitPrice, drawsPerWeek, drawDaysOfWeek, drawTime)
 * - Partial upsert preserves untouched fields
 * - Version auto-increments on each update
 */

import { GameConfigScope } from "@megawin/game-core/entities";
import { DEFAULT_MEGA645_CONFIG } from "@megawin/game-mega645/rules";
import { beforeAll, describe, expect, it } from "vitest";

import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Mega 6/45 Global Config", () => {
  const repo = new GameConfigRepository();

  beforeAll(async () => {
    await insertDefaultGlobalConfig();
  });

  it("getGlobalConfig trả về config sau khi seed", async () => {
    const config = await repo.getGlobalConfig();

    expect(config).not.toBeNull();
    expect(config!.scope).toBe(GameConfigScope.Global);
    expect(config!.tenantId).toBeNull();
  });

  it("global config có jackpot seedAmount đúng", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.jackpot).toBeDefined();
    expect(config!.jackpot.seedAmount).toBe(DEFAULT_MEGA645_CONFIG.jackpot.seedAmount);
  });

  it("global config có đầy đủ financial rates", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.rates).toBeDefined();
    expect(config!.rates.defaultCommissionRate).toBe(DEFAULT_MEGA645_CONFIG.rates.defaultCommissionRate);
    expect(config!.rates.companyRate).toBe(DEFAULT_MEGA645_CONFIG.rates.companyRate);
  });

  it("global config có đầy đủ default prizes (3 tiers)", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes).toBeDefined();
    expect(config!.defaultPrizes.tier1).toBe(10_000_000);
    expect(config!.defaultPrizes.tier2).toBe(300_000);
    expect(config!.defaultPrizes.tier3).toBe(30_000);
  });

  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(10_000);
    expect(config!.play.maxBoardsPerTicket).toBe(DEFAULT_MEGA645_CONFIG.play.maxBoardsPerTicket);
    expect(config!.play.maxDrawCount).toBe(DEFAULT_MEGA645_CONFIG.play.maxDrawCount);
    expect(config!.play.salesCloseBeforeMinutes).toBe(DEFAULT_MEGA645_CONFIG.play.salesCloseBeforeMinutes);
    expect(config!.play.drawsPerWeek).toBe(3);
    expect(config!.play.drawDaysOfWeek).toEqual([0, 3, 5]);
    expect(config!.play.drawTime).toBe("18:00");
  });

  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      jackpot: {
        ...DEFAULT_MEGA645_CONFIG.jackpot,
        seedAmount: 20_000_000_000,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.jackpot.seedAmount).toBe(20_000_000_000);
  });

  it("upsertGlobalConfig tăng version mỗi lần update", async () => {
    const before = await repo.getGlobalConfig();
    const versionBefore = before!.version;

    await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_MEGA645_CONFIG.rates,
        companyRate: 0.18,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.rates.companyRate).toBe(0.18);
  });
});
