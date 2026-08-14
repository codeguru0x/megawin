import { UseCase } from "@megawin/app-core/use-cases";

import { VoidReportRepository } from "../../infras/repos/void-report-repo";
import type { ListVoidReportsInput, ListVoidReportsOutput } from "./types";

/**
 * Lấy danh sách void reports trong date range.
 */
export class ListVoidReportsUseCase extends UseCase<ListVoidReportsInput, ListVoidReportsOutput> {
  private readonly repo = new VoidReportRepository();

  protected async execute(input: ListVoidReportsInput): Promise<ListVoidReportsOutput> {
    const data = await this.repo.findByDateRange(input.from, input.to);
    return { data };
  }
}
