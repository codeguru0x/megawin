import { describe, it, expect, beforeAll } from "vitest";
import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { GameConfigScope } from "@megawin/game-core/entities";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Bingo18 Global Config", () => {
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
      DEFAULT_BINGO18_CONFIG.rates.defaultCommissionRate
    );
    expect(config!.rates.companyRate).toBe(
      DEFAULT_BINGO18_CONFIG.rates.companyRate
    );
  });

  it("global config có đầy đủ singleNumPrizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.singleNumPrizes).toBeDefined();
    expect(config!.singleNumPrizes.match1).toBe(
      DEFAULT_BINGO18_CONFIG.singleNumPrizes.match1
    );
    expect(config!.singleNumPrizes.match2).toBe(
      DEFAULT_BINGO18_CONFIG.singleNumPrizes.match2
    );
    expect(config!.singleNumPrizes.match3).toBe(
      DEFAULT_BINGO18_CONFIG.singleNumPrizes.match3
    );
  });

  it("global config có đầy đủ doubleMatchPrizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.doubleMatchPrizes).toBeDefined();
    expect(config!.doubleMatchPrizes.win).toBe(
      DEFAULT_BINGO18_CONFIG.doubleMatchPrizes.win
    );
  });

  it("global config có đầy đủ tripleMatchPrizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.tripleMatchPrizes).toBeDefined();
    expect(config!.tripleMatchPrizes.specific).toBe(
      DEFAULT_BINGO18_CONFIG.tripleMatchPrizes.specific
    );
    expect(config!.tripleMatchPrizes.any).toBe(
      DEFAULT_BINGO18_CONFIG.tripleMatchPrizes.any
    );
  });

  it("global config có đầy đủ sumTotalPrizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.sumTotalPrizes).toBeDefined();
    for (let sum = 3; sum <= 18; sum++) {
      expect(config!.sumTotalPrizes[sum]).toBe(
        DEFAULT_BINGO18_CONFIG.sumTotalPrizes[sum]
      );
    }
  });

  it("global config có đầy đủ bigSmallDrawPrizes", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.bigSmallDrawPrizes).toBeDefined();
    expect(config!.bigSmallDrawPrizes.big).toBe(
      DEFAULT_BINGO18_CONFIG.bigSmallDrawPrizes.big
    );
    expect(config!.bigSmallDrawPrizes.draw).toBe(
      DEFAULT_BINGO18_CONFIG.bigSmallDrawPrizes.draw
    );
    expect(config!.bigSmallDrawPrizes.small).toBe(
      DEFAULT_BINGO18_CONFIG.bigSmallDrawPrizes.small
    );
  });

  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(DEFAULT_BINGO18_CONFIG.play.unitPrice);
    expect(config!.play.maxBasicBoardsPerTicket).toBe(
      DEFAULT_BINGO18_CONFIG.play.maxBasicBoardsPerTicket
    );
    expect(config!.play.maxDrawCount).toBe(
      DEFAULT_BINGO18_CONFIG.play.maxDrawCount
    );
    expect(config!.play.salesCloseBeforeSeconds).toBe(
      DEFAULT_BINGO18_CONFIG.play.salesCloseBeforeSeconds
    );
    expect(config!.play.drawIntervalMinutes).toBe(
      DEFAULT_BINGO18_CONFIG.play.drawIntervalMinutes
    );
    expect(config!.play.firstDrawTime).toBe(
      DEFAULT_BINGO18_CONFIG.play.firstDrawTime
    );
    expect(config!.play.lastDrawTime).toBe(
      DEFAULT_BINGO18_CONFIG.play.lastDrawTime
    );
    expect(config!.play.timezone).toBe(DEFAULT_BINGO18_CONFIG.play.timezone);
  });

  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_BINGO18_CONFIG.rates,
        companyRate: 0.18,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.rates.companyRate).toBe(0.18);
    expect(updated!.rates.defaultCommissionRate).toBe(
      DEFAULT_BINGO18_CONFIG.rates.defaultCommissionRate
    );
  });

  it("upsertGlobalConfig tăng version mỗi lần update", async () => {
    const before = await repo.getGlobalConfig();
    const versionBefore = before!.version;

    await repo.upsertGlobalConfig({
      play: {
        ...DEFAULT_BINGO18_CONFIG.play,
        unitPrice: 20_000,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.play.unitPrice).toBe(20_000);
  });

  it("upsertGlobalConfig cập nhật singleNumPrizes", async () => {
    const customPrizes = {
      match1: 15_000,
      match2: 25_000,
      match3: 40_000,
    };

    const updated = await repo.upsertGlobalConfig({
      singleNumPrizes: customPrizes,
    });

    expect(updated).not.toBeNull();
    expect(updated!.singleNumPrizes.match1).toBe(15_000);
    expect(updated!.singleNumPrizes.match2).toBe(25_000);
    expect(updated!.singleNumPrizes.match3).toBe(40_000);
  });

  it("upsertGlobalConfig cập nhật sumTotalPrizes", async () => {
    const customPrizes = {
      ...DEFAULT_BINGO18_CONFIG.sumTotalPrizes,
      3: 1_500_000,
      18: 1_500_000,
    };

    const updated = await repo.upsertGlobalConfig({
      sumTotalPrizes: customPrizes,
    });

    expect(updated).not.toBeNull();
    expect(updated!.sumTotalPrizes[3]).toBe(1_500_000);
    expect(updated!.sumTotalPrizes[18]).toBe(1_500_000);
    expect(updated!.sumTotalPrizes[10]).toBe(
      DEFAULT_BINGO18_CONFIG.sumTotalPrizes[10]
    );
  });
});
