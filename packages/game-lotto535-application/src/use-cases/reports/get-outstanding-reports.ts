import { UseCase } from "@megawin/app-core/use-cases";

import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

/**
 * Danh sách tất cả outstanding draw reports (TTL active).
 *
 * Không có input filter — luôn trả tất cả docs chưa expire.
 * Lotto 5/35 có tối đa ~4 kỳ outstanding cùng lúc.
 * TTL index: { snapshotAt: 1 }, expireAfterSeconds: 300
 */
export class GetOutstandingReportsUseCase extends UseCase<void, GetOutstandingReportsOutput> {
  private readonly repo = new OutstandingReportRepository();

  protected async execute(_input: void): Promise<GetOutstandingReportsOutput> {
    const data = await this.repo.findAllSorted();
    return { data };
  }
}
