import { NextApiUseCase } from "@megawin/next/server";
import { VoidReportRepository } from "../../infras/repos/void-report-repo";
import type { ListVoidReportsInput, ListVoidReportsOutput } from "./types";

/**
 * Danh sách kỳ quay đã void trong date range.
 *
 * Kết quả thường rất ít (void rất hiếm).
 * Bao gồm previousSettleSnapshot nếu draw đã settle trước khi void.
 * Index: { financialDate: 1 }
 */
export class ListVoidReportsUseCase extends NextApiUseCase<ListVoidReportsInput, ListVoidReportsOutput> {
  private readonly repo = new VoidReportRepository();

  protected async execute(input: ListVoidReportsInput): Promise<ListVoidReportsOutput> {
    const data = await this.repo.findByDateRange(input.from, input.to);
    return { data };
  }
}
