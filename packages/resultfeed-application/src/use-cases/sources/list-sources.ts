/**
 * ResultFeed – ListSourcesUseCase
 *
 * `07-admin-management-page.plan.md §3.1`. Thin wrapper `SourceRepository.listAll()` — trang
 * quản lý nguồn (`/resultfeed/sources`) chỉ cần đọc toàn bộ registry, không có filter.
 */

import type { SourceEntity } from "@megawin/resultfeed/entities";

import { SourceRepository } from "../../infras/repos/source-repo";

export class ListSourcesUseCase {
  private readonly sourceRepo = new SourceRepository();

  async run(): Promise<SourceEntity[]> {
    return await this.sourceRepo.listAll();
  }
}
