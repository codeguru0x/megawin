import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetTenantBreakdownInput, TenantBreakdownOutput } from "./dto/operations.dto";

/**
 * Phân tích doanh thu theo đại lý (tenant breakdown) cho Power 6/55.
 *
 * Aggregate từ DB, sort theo revenue desc.
 * CRASH-SAFE: idempotent.
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
