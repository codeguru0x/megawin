import { NextApiUseCase } from "@megawin/next/server";
import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

/**
 * Lấy tất cả outstanding draw reports hiện tại — dùng cho Outstanding page.
 *
 * Max 3D: ~4 docs active tối đa (2 kỳ/ngày, ~2 ngày).
 * Auto-refresh mỗi 30s ở UI để luôn cập nhật.
 */
export class GetOutstandingReportsUseCase extends NextApiUseCase<void, GetOutstandingReportsOutput> {
  private readonly repo = new OutstandingReportRepository();

  protected async execute(): Promise<GetOutstandingReportsOutput> {
    const data = await this.repo.findAll();
    return { data };
  }
}
