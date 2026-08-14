import { UseCase } from "@megawin/app-core/use-cases";

import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

/** Tất cả outstanding draws hiện đang active cho Mega 6/45. */
export class GetOutstandingReportsUseCase extends UseCase<void, GetOutstandingReportsOutput> {
  private readonly repo = new OutstandingReportRepository();
  protected async execute(): Promise<GetOutstandingReportsOutput> {
    return { data: await this.repo.findAllSorted() };
  }
}
