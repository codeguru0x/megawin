import { describe, it, expect, beforeAll } from "vitest";
import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { DEFAULT_MAX3D_CONFIG } from "@megawin/game-max3d/rules";
import { GameConfigScope } from "@megawin/game-core/entities";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Global Config (Max 3D)", () => {
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
      DEFAULT_MAX3D_CONFIG.rates.defaultCommissionRate,
    );
  });

  it("global config có đầy đủ default prizes – basic", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes).toBeDefined();
    expect(config!.defaultPrizes.basic.special).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.basic.special,
    );
    expect(config!.defaultPrizes.basic.first).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.basic.first,
    );
    expect(config!.defaultPrizes.basic.second).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.basic.second,
    );
    expect(config!.defaultPrizes.basic.third).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.basic.third,
    );
  });

  it("global config có đầy đủ default prizes – combo", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes.combo.combo3.special).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.combo.combo3.special,
    );
    expect(config!.defaultPrizes.combo.combo3.first).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.combo.combo3.first,
    );
    expect(config!.defaultPrizes.combo.combo6.special).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.combo.combo6.special,
    );
    expect(config!.defaultPrizes.combo.combo6.third).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.combo.combo6.third,
    );
  });

  it("global config có đầy đủ default prizes – plus", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes.plus.special).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.special,
    );
    expect(config!.defaultPrizes.plus.first).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.first,
    );
    expect(config!.defaultPrizes.plus.second).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.second,
    );
    expect(config!.defaultPrizes.plus.third).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.third,
    );
    expect(config!.defaultPrizes.plus.fourth).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.fourth,
    );
    expect(config!.defaultPrizes.plus.fifth).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.fifth,
    );
    expect(config!.defaultPrizes.plus.sixth).toBe(
      DEFAULT_MAX3D_CONFIG.defaultPrizes.plus.sixth,
    );
  });

  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(DEFAULT_MAX3D_CONFIG.play.unitPrice);
    expect(config!.play.maxBoardsPerTicket).toBe(
      DEFAULT_MAX3D_CONFIG.play.maxBoardsPerTicket,
    );
    expect(config!.play.maxDrawCount).toBe(
      DEFAULT_MAX3D_CONFIG.play.maxDrawCount,
    );
    expect(config!.play.salesCloseBeforeMinutes).toBe(
      DEFAULT_MAX3D_CONFIG.play.salesCloseBeforeMinutes,
    );
    expect(config!.play.drawsPerDay).toBe(
      DEFAULT_MAX3D_CONFIG.play.drawsPerDay,
    );
    expect(config!.play.drawTimes).toEqual(
      DEFAULT_MAX3D_CONFIG.play.drawTimes,
    );
    expect(config!.play.drawDaysOfWeek).toEqual(
      DEFAULT_MAX3D_CONFIG.play.drawDaysOfWeek,
    );
  });

  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_MAX3D_CONFIG.rates,
        defaultCommissionRate: 0.25,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.rates.defaultCommissionRate).toBe(0.25);
  });

  it("upsertGlobalConfig tăng version mỗi lần update", async () => {
    const before = await repo.getGlobalConfig();
    const versionBefore = before!.version;

    await repo.upsertGlobalConfig({
      play: {
        ...DEFAULT_MAX3D_CONFIG.play,
        unitPrice: 20_000,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.play.unitPrice).toBe(20_000);
  });
});
