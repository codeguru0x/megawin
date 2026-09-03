/**
 * ResultFeed – ListObservationsUseCase
 *
 * `07-admin-management-page.plan.md §2` (`observations/route.ts`). Tra observation gần đây
 * theo `gameKey` — thin wrapper `ObservationRepository.findRecentByGameKey`, dùng cho trang
 * vận hành khi cần xem observation KHÔNG gắn với 1 kỳ cụ thể (khác `GetConsensusPeriodUseCase`
 * — đó luôn cần `drawPeriod`).
 */

import type { ObservationEntity, ResultFeedGameKey } from "@megawin/resultfeed/entities";

import { ObservationRepository } from "../../infras/repos/observation-repo";

export interface ListObservationsInput {
  gameKey: ResultFeedGameKey;
  limit?: number;
}

export class ListObservationsUseCase {
  private readonly observationRepo = new ObservationRepository();

  async run(input: ListObservationsInput): Promise<ObservationEntity[]> {
    return await this.observationRepo.findRecentByGameKey(input.gameKey, input.limit ?? 50);
  }
}
