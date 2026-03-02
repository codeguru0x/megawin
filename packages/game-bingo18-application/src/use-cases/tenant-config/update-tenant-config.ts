import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type {
  UpdateTenantConfigInput,
  UpdateTenantConfigOutput,
} from "./dto/tenant-config.dto";

/**
 * Cập nhật cấu hình game Bingo 18 riêng cho 1 tenant (upsert).
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 *
 * Khi tạo mới (insert):
 * - commissionRate lấy từ global config defaultCommissionRate
 * - isEnabled = true
 */
export class UpdateTenantConfigUseCase extends NextApiUseCase<
  UpdateTenantConfigInput,
  UpdateTenantConfigOutput
> {
  private readonly repo = new TenantConfigRepository();
  private readonly globalRepo = new GameConfigRepository();

  protected async execute(
    input: UpdateTenantConfigInput
  ): Promise<UpdateTenantConfigOutput> {
    this.validateInput(input);

    const existing = await this.repo.getTenantConfig(input.tenantId);
    const isCreating = !existing;

    const fields: Record<string, unknown> = {};

    if (isCreating) {
      const globalConfig = await this.globalRepo.getGlobalConfig();
      fields.commissionRate =
        input.commissionRate ??
        globalConfig?.rates.defaultCommissionRate ??
        0.2;
      fields.isEnabled = input.isEnabled ?? true;
    } else {
      if (input.commissionRate !== undefined)
        fields.commissionRate = input.commissionRate;
      if (input.isEnabled !== undefined) fields.isEnabled = input.isEnabled;
    }

    const updated = await this.repo.upsertTenantConfig(
      input.tenantId,
      fields as any
    );

    if (!updated) {
      throw AppException.internal(
        `Cập nhật cấu hình tenant "${input.tenantId}" thất bại.`
      );
    }

    return {
      config: updated,
      version: updated.version,
    };
  }

  private validateInput(input: UpdateTenantConfigInput): void {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw AppException.badRequest("tenantId không được để trống.");
    }

    if (
      input.commissionRate !== undefined &&
      (input.commissionRate < 0 || input.commissionRate > 1)
    ) {
      throw AppException.badRequest("commissionRate phải trong range [0, 1].");
    }
  }
}
