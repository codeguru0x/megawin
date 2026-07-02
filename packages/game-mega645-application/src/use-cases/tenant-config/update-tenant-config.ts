import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateTenantConfig } from "../../services/audit-log";
import type { UpdateTenantConfigInput, UpdateTenantConfigOutput } from "./dto/tenant-config.dto";

export class UpdateTenantConfigUseCase extends NextApiUseCase<
  UpdateTenantConfigInput,
  UpdateTenantConfigOutput
> {
  private readonly repo = new TenantConfigRepository();
  private readonly globalRepo = new GameConfigRepository();

  protected async execute(input: UpdateTenantConfigInput): Promise<UpdateTenantConfigOutput> {
    const existing = await this.repo.getTenantConfig(input.tenantId);
    const isCreating = !existing;

    const fields: Record<string, unknown> = {};

    if (isCreating) {
      const globalConfig = await this.globalRepo.getGlobalConfig();
      fields.commissionRate =
        input.commissionRate ?? globalConfig?.rates.defaultCommissionRate ?? 0.2;
      fields.isEnabled = input.isEnabled ?? true;
    } else {
      if (input.commissionRate !== undefined) fields.commissionRate = input.commissionRate;
      if (input.isEnabled !== undefined) fields.isEnabled = input.isEnabled;
    }

    const updated = await this.repo.upsertTenantConfig(input.tenantId, fields as any);

    if (!updated) {
      throw AppException.internal(`Cập nhật cấu hình tenant "${input.tenantId}" thất bại.`);
    }

    // Audit sau khi upsert thành công. Chỉ ghi giá trị MỚI (`after`) từ entity đã
    // ghi — muốn biết giá trị cũ thì trace ngược record version trước.
    // Fire-and-forget: không chặn response.
    auditUpdateTenantConfig({
      actor: input.actor,
      tenantId: input.tenantId,
      version: updated.version,
      after: { commissionRate: updated.commissionRate, isEnabled: updated.isEnabled },
    });

    return {
      config: updated,
      version: updated.version,
    };
  }
}
