/**
 * Tests: TenantConfigRepository – Power 6/55 Tenant Config
 *
 * Validates per-tenant config CRUD:
 * - Seeded config has correct scope, tenantId, default commission rate
 * - Custom overrides (commissionRate, isEnabled) are persisted
 * - Version auto-increments on each update
 * - listTenantConfigs returns all tenants sorted by tenantId
 * - Non-existent tenant returns null
 */

import { GameConfigScope } from "@megawin/game-core/entities";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { beforeAll, describe, expect, it } from "vitest";

import { TenantConfigRepository } from "../../src/infras/repos/tenant-config-repo";
import { seedTenantConfig } from "./helpers/seed-tenant-config";

describe("TenantConfigRepository – Power 6/55 Tenant Config", () => {
  const repo = new TenantConfigRepository();
  const TENANT_A = "tenant-alpha";
  const TENANT_B = "tenant-bravo";

  beforeAll(async () => {
    await seedTenantConfig(TENANT_A);
    await seedTenantConfig(TENANT_B, { commissionRate: 0.25 });
  });

  /** Validates the seeded document exists with scope=Tenant and correct tenantId. */
  it("getTenantConfig trả về config sau khi seed", async () => {
    const config = await repo.getTenantConfig(TENANT_A);

    expect(config).not.toBeNull();
    expect(config!.scope).toBe(GameConfigScope.Tenant);
    expect(config!.tenantId).toBe(TENANT_A);
  });

  /** Validates default commission rate matches DEFAULT_POWER655_CONFIG. */
  it("tenant config có commissionRate đúng với default", async () => {
    const config = await repo.getTenantConfig(TENANT_A);

    expect(config!.commissionRate).toBe(DEFAULT_POWER655_CONFIG.rates.defaultCommissionRate);
  });

  /** Validates custom commissionRate override is persisted. */
  it("tenant config có commissionRate custom", async () => {
    const config = await repo.getTenantConfig(TENANT_B);

    expect(config!.commissionRate).toBe(0.25);
  });

  /** Validates default isEnabled=true for newly seeded tenant. */
  it("tenant config mặc định isEnabled = true", async () => {
    const config = await repo.getTenantConfig(TENANT_A);

    expect(config!.isEnabled).toBe(true);
  });

  /** Validates commissionRate can be updated via upsert. */
  it("upsertTenantConfig cập nhật commissionRate", async () => {
    const updated = await repo.upsertTenantConfig(TENANT_A, {
      commissionRate: 0.18,
    });

    expect(updated).not.toBeNull();
    expect(updated!.commissionRate).toBe(0.18);
    expect(updated!.tenantId).toBe(TENANT_A);
  });

  /** Validates isEnabled can be toggled via upsert. */
  it("upsertTenantConfig cập nhật isEnabled", async () => {
    const updated = await repo.upsertTenantConfig(TENANT_A, {
      isEnabled: false,
    });

    expect(updated).not.toBeNull();
    expect(updated!.isEnabled).toBe(false);
  });

  /** Validates version auto-increments on each update. */
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

  /** Validates listTenantConfigs returns all seeded tenants. */
  it("listTenantConfigs trả về tất cả tenant configs", async () => {
    const configs = await repo.listTenantConfigs();

    expect(configs.length).toBeGreaterThanOrEqual(2);
    const tenantIds = configs.map((c) => c.tenantId);
    expect(tenantIds).toContain(TENANT_A);
    expect(tenantIds).toContain(TENANT_B);
  });

  /** Validates list is sorted by tenantId ascending. */
  it("listTenantConfigs sorted theo tenantId", async () => {
    const configs = await repo.listTenantConfigs();
    const tenantIds = configs.map((c) => c.tenantId);
    const sorted = [...tenantIds].sort();
    expect(tenantIds).toEqual(sorted);
  });

  /** Validates null is returned for a non-existent tenant. */
  it("getTenantConfig trả về null cho tenant chưa tồn tại", async () => {
    const config = await repo.getTenantConfig("non-existent-tenant");
    expect(config).toBeNull();
  });
});
