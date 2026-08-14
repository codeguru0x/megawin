import { UseCase } from "@megawin/app-core/use-cases";

import { VoidReportRepository } from "../../infras/repos/void-report-repo";
import type { ListVoidReportsInput, ListVoidReportsOutput } from "./types";

/**
 * List void reports trong date range — dùng cho Void Reports page.
 */
export class ListVoidReportsUseCase extends UseCase<ListVoidReportsInput, ListVoidReportsOutput> {
  private readonly repo = new VoidReportRepository();

  protected async execute(input: ListVoidReportsInput): Promise<ListVoidReportsOutput> {
    const data = await this.repo.findByDateRange({ from: input.from, to: input.to });
    return { data };
  }
}
