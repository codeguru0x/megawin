import { UseCase } from "@megawin/app-core/use-cases";

import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

export class GetOutstandingReportsUseCase extends UseCase<Record<string, never>, GetOutstandingReportsOutput> {
  private readonly repo = new OutstandingReportRepository();
  protected async execute(): Promise<GetOutstandingReportsOutput> {
    return { data: await this.repo.findAllSorted() };
  }
}
