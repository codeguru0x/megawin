import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetTenantBreakdownInput, TenantBreakdownOutput } from "./dto/operations.dto";

/**
 * Lấy breakdown theo đại lý cho dashboard vận hành Max 3D.
 *
 * Hỗ trợ filter theo ngày tài chính hoặc 1 kỳ cụ thể.
 * Không có Jackpot → không có cột payout (tiền thưởng chỉ biết sau settle).
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
