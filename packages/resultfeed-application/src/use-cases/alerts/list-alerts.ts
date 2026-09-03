/**
 * ResultFeed – ListAlertsUseCase
 *
 * `07-admin-management-page.plan.md §2` (`alerts/route.ts`). Trả hàng đợi alert theo `status`
 * (mặc định `New` — badge dashboard) kèm `countNew` để FE hiện badge số lượng mà không cần
 * gọi thêm request riêng.
 */

import type { AlertEntity, ResultFeedAlertStatus } from "@megawin/resultfeed/entities";
import { ResultFeedAlertStatus as Status } from "@megawin/resultfeed/entities";

import { AlertRepository } from "../../infras/repos/alert-repo";

export interface ListAlertsInput {
  status?: ResultFeedAlertStatus;
  limit?: number;
}

export interface ListAlertsOutput {
  items: AlertEntity[];
  countNew: number;
}

export class ListAlertsUseCase {
  private readonly alertRepo = new AlertRepository();

  async run(input: ListAlertsInput): Promise<ListAlertsOutput> {
    const [items, countNew] = await Promise.all([
      this.alertRepo.findByStatus(input.status ?? Status.New, input.limit ?? 50),
      this.alertRepo.countNew(),
    ]);
    return { items, countNew };
  }
}
