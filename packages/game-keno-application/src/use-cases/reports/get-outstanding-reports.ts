import { NextApiUseCase } from "@megawin/next/server";

import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

/**
 * Lấy tất cả outstanding draw reports — auto-refresh every 60s trên UI.
 *
 * Keno có thể có ~10+ active draws cùng lúc.
 */
export class GetOutstandingReportsUseCase extends NextApiUseCase<Record<string, never>, GetOutstandingReportsOutput> {
  private readonly repo = new OutstandingReportRepository();

  protected async execute(): Promise<GetOutstandingReportsOutput> {
    const data = await this.repo.findAllSorted();
    return { data };
  }
}
