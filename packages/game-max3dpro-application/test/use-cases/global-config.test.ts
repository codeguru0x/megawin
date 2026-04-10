import { describe, it, expect, beforeAll } from "vitest";
import { GameConfigRepository } from "../../src/infras/repos/game-config-repo";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { GameConfigScope } from "@megawin/game-core/entities";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

describe("GameConfigRepository – Global Config (Max 3D Pro)", () => {
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
      DEFAULT_MAX3D_PRO_CONFIG.rates.defaultCommissionRate,
    );
  });

  it("global config có đầy đủ default prizes – standard", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.defaultPrizes).toBeDefined();
    expect(config!.defaultPrizes.standard.special).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.special,
    );
    expect(config!.defaultPrizes.standard.specialSub).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.specialSub,
    );
    expect(config!.defaultPrizes.standard.first).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.first,
    );
    expect(config!.defaultPrizes.standard.second).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.second,
    );
    expect(config!.defaultPrizes.standard.third).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.third,
    );
    expect(config!.defaultPrizes.standard.fourth).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.fourth,
    );
    expect(config!.defaultPrizes.standard.fifth).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.fifth,
    );
    expect(config!.defaultPrizes.standard.sixth).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes.standard.sixth,
    );
  });

  it("global config có đầy đủ play rules", async () => {
    const config = await repo.getGlobalConfig();

    expect(config!.play).toBeDefined();
    expect(config!.play.unitPrice).toBe(DEFAULT_MAX3D_PRO_CONFIG.play.unitPrice);
    expect(config!.play.maxBoardsPerTicket).toBe(DEFAULT_MAX3D_PRO_CONFIG.play.maxBoardsPerTicket);
    expect(config!.play.maxDrawCount).toBe(DEFAULT_MAX3D_PRO_CONFIG.play.maxDrawCount);
    expect(config!.play.salesCloseBeforeMinutes).toBe(
      DEFAULT_MAX3D_PRO_CONFIG.play.salesCloseBeforeMinutes,
    );
    expect(config!.play.drawsPerDay).toBe(DEFAULT_MAX3D_PRO_CONFIG.play.drawsPerDay);
    expect(config!.play.drawTimes).toEqual(DEFAULT_MAX3D_PRO_CONFIG.play.drawTimes);
    expect(config!.play.drawDaysOfWeek).toEqual([2, 4, 6]);
  });

  it("upsertGlobalConfig cập nhật partial fields", async () => {
    const updated = await repo.upsertGlobalConfig({
      rates: {
        ...DEFAULT_MAX3D_PRO_CONFIG.rates,
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
        ...DEFAULT_MAX3D_PRO_CONFIG.play,
        unitPrice: 20_000,
      },
    });

    const after = await repo.getGlobalConfig();
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.play.unitPrice).toBe(20_000);
  });
});
