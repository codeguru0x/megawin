import { UseCase } from "@megawin/app-core/use-cases";

import { SystemOutstandingReportRepository } from "../../infras/repos/system-outstanding-report-repo";
import type { GetSystemOutstandingOutput } from "./types";

/**
 * Danh sách tất cả outstanding draw reports hệ thống (cross-game).
 *
 * Không có input filter — luôn trả tất cả docs active (TTL chưa expire).
 * Dùng cho trang System Outstanding.
 */
export class GetSystemOutstandingUseCase extends UseCase<void, GetSystemOutstandingOutput> {
  private readonly repo = new SystemOutstandingReportRepository();

  protected async execute(_input: void): Promise<GetSystemOutstandingOutput> {
    const data = await this.repo.findAllSorted();
    return { data };
  }
}
