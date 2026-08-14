import { UseCase } from "@megawin/app-core/use-cases";

import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

/**
 * Tất cả outstanding draws hiện đang active cho Power 6/55.
 *
 * Dữ liệu được sync mỗi 5 phút bởi scheduled job.
 * Dùng cho Outstanding Reports UI page.
 */
export class GetOutstandingReportsUseCase extends UseCase<void, GetOutstandingReportsOutput> {
  private readonly repo = new OutstandingReportRepository();

  protected async execute(): Promise<GetOutstandingReportsOutput> {
    const data = await this.repo.findAllSorted();
    return { data };
  }
}
