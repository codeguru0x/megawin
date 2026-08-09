import { GameConfigScope } from "@megawin/game-core/entities";
import { DEFAULT_LOTTO535_CONFIG } from "@megawin/game-lotto535/rules";
import { beforeAll, describe, expect, it } from "vitest";

import { TenantConfigRepository } from "../../src/infras/repos/tenant-config-repo";
import { seedTenantConfig } from "./helpers/seed-tenant-config";

describe("TenantConfigRepository – Lotto 5/35 Tenant Config", () => {
  const repo = new TenantConfigRepository();
  const TENANT_A = "tenant-alpha";
  const TENANT_B = "tenant-bravo";

  beforeAll(async () => {
    await seedTenantConfig(TENANT_A);
    await seedTenantConfig(TENANT_B, { commissionRate: 0.25 });
  });

  it("getTenantConfig trả về config sau khi seed", async () => {
    const config = await repo.getTenantConfig(TENANT_A);

    expect(config).not.toBeNull();
    expect(config!.scope).toBe(GameConfigScope.Tenant);
    expect(config!.tenantId).toBe(TENANT_A);
  });

  it("tenant config có commissionRate đúng với default", async () => {
    const config = await repo.getTenantConfig(TENANT_A);

    expect(config!.commissionRate).toBe(DEFAULT_LOTTO535_CONFIG.rates.defaultCommissionRate);
  });

  it("tenant config có commissionRate custom", async () => {
    const config = await repo.getTenantConfig(TENANT_B);

    expect(config!.commissionRate).toBe(0.25);
  });

  it("tenant config mặc định isEnabled = true", async () => {
    const config = await repo.getTenantConfig(TENANT_A);

    expect(config!.isEnabled).toBe(true);
  });

  it("upsertTenantConfig cập nhật commissionRate", async () => {
    const updated = await repo.upsertTenantConfig(TENANT_A, {
      commissionRate: 0.18,
    });

    expect(updated).not.toBeNull();
    expect(updated!.commissionRate).toBe(0.18);
    expect(updated!.tenantId).toBe(TENANT_A);
  });

  it("upsertTenantConfig cập nhật isEnabled", async () => {
    const updated = await repo.upsertTenantConfig(TENANT_A, {
      isEnabled: false,
    });

    expect(updated).not.toBeNull();
    expect(updated!.isEnabled).toBe(false);
  });

  it("upsertTenantConfig tăng version mỗi lần update", async () => {
    const before = await repo.getTenantConfig(TENANT_B);
    const versionBefore = before!.version;

    await repo.upsertTenantConfig(TENANT_B, {
      commissionRate: 0.22,
    });

    const after = await repo.getTenantConfig(TENANT_B);
    expect(after!.version).toBe(versionBefore + 1);
    expect(after!.commissionRate).toBe(0.22);
  });

  it("listTenantConfigs trả về tất cả tenant configs", async () => {
    const configs = await repo.listTenantConfigs();

    expect(configs.length).toBeGreaterThanOrEqual(2);
    const tenantIds = configs.map((c) => c.tenantId);
    expect(tenantIds).toContain(TENANT_A);
    expect(tenantIds).toContain(TENANT_B);
  });

  it("listTenantConfigs sorted theo tenantId", async () => {
    const configs = await repo.listTenantConfigs();
    const tenantIds = configs.map((c) => c.tenantId);
    const sorted = [...tenantIds].sort();
    expect(tenantIds).toEqual(sorted);
  });

  it("getTenantConfig trả về null cho tenant chưa tồn tại", async () => {
    const config = await repo.getTenantConfig("non-existent-tenant");
    expect(config).toBeNull();
  });
});
