import { describe, it, expect, beforeAll } from "vitest";
import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { DEFAULT_KENO_CONFIG } from "@megawin/game-keno/rules";
import { GameConfigScope } from "@megawin/game-core/entities";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Keno Global Config", () => {
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

  it("global config có đầy đủ financial rates", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.rates).toBeDefined();
    expect(config!.rates.defaultCommissionRate).toBe(
      DEFAULT_KENO_CONFIG.rates.defaultCommissionRate
    );
    expect(config!.rates.companyRate).toBe(
      DEFAULT_KENO_CONFIG.rates.companyRate
    );
  });

  it("global config có đầy đủ basic prizes (pick1-pick10)", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.basicPrizes).toBeDefined();

    for (let pick = 1; pick <= 10; pick++) {
      const key = `pick${pick}`;
      expect(config!.basicPrizes[key]).toBeDefined();
      expect(config!.basicPrizes[key]).toEqual(
        DEFAULT_KENO_CONFIG.basicPrizes[key]
      );
    }
  });

  it("global config có đầy đủ big/small prizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.bigSmallPrizes).toBeDefined();
    expect(config!.bigSmallPrizes.big13Plus).toBe(
      DEFAULT_KENO_CONFIG.bigSmallPrizes.big13Plus
    );
    expect(config!.bigSmallPrizes.big1112).toBe(
      DEFAULT_KENO_CONFIG.bigSmallPrizes.big1112
    );
    expect(config!.bigSmallPrizes.draw).toBe(
      DEFAULT_KENO_CONFIG.bigSmallPrizes.draw
    );
    expect(config!.bigSmallPrizes.small1112).toBe(
      DEFAULT_KENO_CONFIG.bigSmallPrizes.small1112
    );
    expect(config!.bigSmallPrizes.small13Plus).toBe(
      DEFAULT_KENO_CONFIG.bigSmallPrizes.small13Plus
    );
  });

  it("global config có đầy đủ even/odd prizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.evenOddPrizes).toBeDefined();
    expect(config!.evenOddPrizes.even15Plus).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.even15Plus
    );
    expect(config!.evenOddPrizes.even1314).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.even1314
    );
    expect(config!.evenOddPrizes.even1112).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.even1112
    );
    expect(config!.evenOddPrizes.draw).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.draw
    );
    expect(config!.evenOddPrizes.odd1112).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.odd1112
    );
    expect(config!.evenOddPrizes.odd1314).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.odd1314
    );
    expect(config!.evenOddPrizes.odd15Plus).toBe(
      DEFAULT_KENO_CONFIG.evenOddPrizes.odd15Plus
    );
  });

  it("global config có đầy đủ payout caps", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.payoutCaps).toBeDefined();
    expect(config!.payoutCaps.pick8MaxPerDraw).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick8MaxPerDraw
    );
    expect(config!.payoutCaps.pick8MaxSetsForFixed).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick8MaxSetsForFixed
    );
    expect(config!.payoutCaps.pick9MaxPerDraw).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick9MaxPerDraw
    );
    expect(config!.payoutCaps.pick9MaxSetsForFixed).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick9MaxSetsForFixed
    );
    expect(config!.payoutCaps.pick10MaxPerDraw).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick10MaxPerDraw
    );
    expect(config!.payoutCaps.pick10MaxSetsForFixed).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick10MaxSetsForFixed
    );
  });

  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(DEFAULT_KENO_CONFIG.play.unitPrice);
    expect(config!.play.maxBasicBoardsPerTicket).toBe(
      DEFAULT_KENO_CONFIG.play.maxBasicBoardsPerTicket
    );
    expect(config!.play.maxDrawCount).toBe(
      DEFAULT_KENO_CONFIG.play.maxDrawCount
    );
    expect(config!.play.salesCloseBeforeSeconds).toBe(
      DEFAULT_KENO_CONFIG.play.salesCloseBeforeSeconds
    );
    expect(config!.play.drawIntervalMinutes).toBe(
      DEFAULT_KENO_CONFIG.play.drawIntervalMinutes
    );
    expect(config!.play.firstDrawTime).toBe(
      DEFAULT_KENO_CONFIG.play.firstDrawTime
    );
    expect(config!.play.lastDrawTime).toBe(
      DEFAULT_KENO_CONFIG.play.lastDrawTime
    );
    expect(config!.play.timezone).toBe(DEFAULT_KENO_CONFIG.play.timezone);
  });

  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_KENO_CONFIG.rates,
        companyRate: 0.18,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.rates.companyRate).toBe(0.18);
    expect(updated!.rates.defaultCommissionRate).toBe(
      DEFAULT_KENO_CONFIG.rates.defaultCommissionRate
    );
  });

  it("upsertGlobalConfig tăng version mỗi lần update", async () => {
    const before = await repo.getGlobalConfig();
    const versionBefore = before!.version;

    await repo.upsertGlobalConfig({
      play: {
        ...DEFAULT_KENO_CONFIG.play,
        unitPrice: 20_000,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.play.unitPrice).toBe(20_000);
  });

  it("upsertGlobalConfig cập nhật basicPrizes", async () => {
    const customPrizes = {
      ...DEFAULT_KENO_CONFIG.basicPrizes,
      pick10: {
        10: 1_500_000_000,
        9: 100_000_000,
        8: 6_000_000,
        7: 500_000,
        6: 60_000,
        5: 15_000,
        0: 10_000,
      },
    };

    const updated = await repo.upsertGlobalConfig({
      basicPrizes: customPrizes,
    });

    expect(updated).not.toBeNull();
    expect(updated!.basicPrizes.pick10[10]).toBe(1_500_000_000);
    expect(updated!.basicPrizes.pick10[9]).toBe(100_000_000);
  });

  it("upsertGlobalConfig cập nhật payoutCaps", async () => {
    const updated = await repo.upsertGlobalConfig({
      payoutCaps: {
        ...DEFAULT_KENO_CONFIG.payoutCaps,
        pick10MaxPerDraw: 15_000_000_000,
        pick10MaxSetsForFixed: 7,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.payoutCaps.pick10MaxPerDraw).toBe(15_000_000_000);
    expect(updated!.payoutCaps.pick10MaxSetsForFixed).toBe(7);
    expect(updated!.payoutCaps.pick8MaxPerDraw).toBe(
      DEFAULT_KENO_CONFIG.payoutCaps.pick8MaxPerDraw
    );
  });
});
