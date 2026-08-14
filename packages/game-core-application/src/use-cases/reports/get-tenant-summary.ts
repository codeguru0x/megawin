import { UseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";
import { AppException } from "@megawin/shared/errors";

import { SystemSettleTenantDailyRepository } from "../../infras/repos/system-settle-tenant-daily-repo";
import type { GetTenantSummaryInput, GetTenantSummaryOutput } from "./types";

/**
 * Tổng hợp tài chính hệ thống theo đại lý trong date range.
 *
 * 2 chế độ:
 *   - tenantId có → game breakdown cho 1 tenant (inline expand).
 *   - tenantId không có → aggregate tất cả tenant, lọc theo game nếu có.
 *
 * Dùng cho tab "Theo đại lý" trang System Financial Reports.
 */
export class GetTenantSummaryUseCase extends UseCase<GetTenantSummaryInput, GetTenantSummaryOutput> {
  private readonly repo = new SystemSettleTenantDailyRepository();

  protected async execute(input: GetTenantSummaryInput): Promise<GetTenantSummaryOutput> {
    // Inline expand: game breakdown cho 1 tenant cụ thể
    if (input.tenantId && input.from && input.to) {
      const data = await this.repo.findTenantGameBreakdown(input.tenantId, input.from, input.to);
      return { data };
    }

    if (!input.from || !input.to) {
      throw new AppException("VALIDATION", "from và to là bắt buộc");
    }

    // Lọc theo game nếu có (undefined = tất cả game)
    const gameProduct = input.game && input.game !== "all" ? (input.game as GameProduct) : undefined;

    const data = await this.repo.aggregateByTenantId(input.from, input.to, gameProduct);
    return { data };
  }
}
