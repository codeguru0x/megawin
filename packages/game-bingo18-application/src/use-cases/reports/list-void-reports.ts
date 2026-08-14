import { UseCase } from "@megawin/app-core/use-cases";

import { VoidReportRepository } from "../../infras/repos/void-report-repo";
import type { ListVoidReportsInput, ListVoidReportsOutput } from "./types";

export class ListVoidReportsUseCase extends UseCase<ListVoidReportsInput, ListVoidReportsOutput> {
  private readonly repo = new VoidReportRepository();
  protected async execute(input: ListVoidReportsInput): Promise<ListVoidReportsOutput> {
    return { data: await this.repo.findByDateRange(input.from, input.to) };
  }
}
