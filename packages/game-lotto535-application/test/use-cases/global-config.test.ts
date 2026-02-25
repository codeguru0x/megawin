import { describe, it, expect, beforeAll } from "vitest";
import { GameConfigRepository } from "../../src/infras/repos/global-config-repo";
import { DEFAULT_LOTTO535_CONFIG } from "@megawin/game-lotto535/rules";
import { GameConfigScope, GameProduct } from "@megawin/game-core/entities";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Global Config", () => {
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

  it("global config có đầy đủ jackpot settings", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.jackpot).toBeDefined();
    expect(config!.jackpot.seedAmount).toBe(
      DEFAULT_LOTTO535_CONFIG.jackpot.seedAmount
    );
    expect(config!.jackpot.splitThreshold).toBe(
      DEFAULT_LOTTO535_CONFIG.jackpot.splitThreshold
    );
    expect(config!.jackpot.splitRatios).toEqual(
      DEFAULT_LOTTO535_CONFIG.jackpot.splitRatios
    );
  });

  it("global config có đầy đủ financial rates", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.rates).toBeDefined();
    expect(config!.rates.defaultCommissionRate).toBe(
      DEFAULT_LOTTO535_CONFIG.rates.defaultCommissionRate
    );
    expect(config!.rates.companyRate).toBe(
      DEFAULT_LOTTO535_CONFIG.rates.companyRate
    );
  });

  it("global config có đầy đủ default prizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes).toBeDefined();
    expect(config!.defaultPrizes.tier1).toBe(
      DEFAULT_LOTTO535_CONFIG.defaultPrizes.tier1
    );
    expect(config!.defaultPrizes.tier2).toBe(
      DEFAULT_LOTTO535_CONFIG.defaultPrizes.tier2
    );
    expect(config!.defaultPrizes.tier3).toBe(
      DEFAULT_LOTTO535_CONFIG.defaultPrizes.tier3
    );
    expect(config!.defaultPrizes.tier4).toBe(
      DEFAULT_LOTTO535_CONFIG.defaultPrizes.tier4
    );
    expect(config!.defaultPrizes.tier5).toBe(
      DEFAULT_LOTTO535_CONFIG.defaultPrizes.tier5
    );
    expect(config!.defaultPrizes.consolation).toBe(
      DEFAULT_LOTTO535_CONFIG.defaultPrizes.consolation
    );
  });

  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(DEFAULT_LOTTO535_CONFIG.play.unitPrice);
    expect(config!.play.maxBoardsPerTicket).toBe(
      DEFAULT_LOTTO535_CONFIG.play.maxBoardsPerTicket
    );
    expect(config!.play.maxDrawCount).toBe(
      DEFAULT_LOTTO535_CONFIG.play.maxDrawCount
    );
    expect(config!.play.salesCloseBeforeMinutes).toBe(
      DEFAULT_LOTTO535_CONFIG.play.salesCloseBeforeMinutes
    );
    expect(config!.play.drawsPerDay).toBe(
      DEFAULT_LOTTO535_CONFIG.play.drawsPerDay
    );
    expect(config!.play.drawTimes).toEqual(
      DEFAULT_LOTTO535_CONFIG.play.drawTimes
    );
  });

  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      jackpot: {
        ...DEFAULT_LOTTO535_CONFIG.jackpot,
        seedAmount: 2_000_000_000,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.jackpot.seedAmount).toBe(2_000_000_000);
    expect(updated!.jackpot.splitThreshold).toBe(
      DEFAULT_LOTTO535_CONFIG.jackpot.splitThreshold
    );
  });

  it("upsertGlobalConfig tăng version mỗi lần update", async () => {
    const before = await repo.getGlobalConfig();
    const versionBefore = before!.version;

    await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_LOTTO535_CONFIG.rates,
        companyRate: 0.18,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.rates.companyRate).toBe(0.18);
  });
});
