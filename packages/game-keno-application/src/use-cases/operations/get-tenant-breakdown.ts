import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetTenantBreakdownInput, TenantBreakdownOutput } from "./dto/operations.dto";

/**
 * Phân tích doanh thu theo đại lý cho Keno Operations Dashboard.
 *
 * Group by tenantId — revenue, commission, payout, entries, boards, players.
 * Sorted by revenue desc.
 */
export class GetTenantBreakdownUseCase extends NextApiUseCase<
  GetTenantBreakdownInput,
  TenantBreakdownOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetTenantBreakdownInput): Promise<TenantBreakdownOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const tenants = await this.entryRepo.aggregateTenantBreakdown({
      financialDate,
      drawId: input.drawId,
    });

    return { financialDate, tenants };
  }
}
