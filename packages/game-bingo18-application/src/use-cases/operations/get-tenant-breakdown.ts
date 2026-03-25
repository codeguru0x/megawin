import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { OpsQueryInput, TenantBreakdownOutput } from "./dto/operations.dto";

/**
 * Phân tích doanh thu theo đại lý cho Bingo 18 Operations Dashboard.
 *
 * Group by tenantId — revenue, commission, entries, boards, players.
 * boards[] chứa cả cơ bản và bổ sung, đếm chung.
 * Sorted by revenue desc.
 */
export class GetTenantBreakdownUseCase extends NextApiUseCase<
  OpsQueryInput,
  TenantBreakdownOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: OpsQueryInput): Promise<TenantBreakdownOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const tenants = await this.entryRepo.aggregateTenantBreakdown({
      financialDate,
      drawId: input.drawId,
    });

    return { financialDate, tenants };
  }
}
