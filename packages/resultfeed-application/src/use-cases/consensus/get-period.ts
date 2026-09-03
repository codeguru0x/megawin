/**
 * ResultFeed – GetConsensusPeriodUseCase
 *
 * `07-admin-management-page.plan.md §2` (`consensus/[gameKey]/[drawPeriod]/route.ts`) và
 * `§7` (trang `periods`). Trả doc `consensus` hiện tại của 1 game × 1 kỳ + TOÀN BỘ
 * `observations` các nguồn đã ghi cho kỳ đó — đúng dữ liệu cả trang `review` (chi tiết 1 kỳ
 * conflict) và `periods` (tra cứu view-only) cần, dùng LẠI 1 use-case cho cả hai.
 */

import type { ConsensusEntity, ObservationEntity, ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { AppException } from "@megawin/shared/errors";

import { ConsensusRepository } from "../../infras/repos/consensus-repo";
import { ObservationRepository } from "../../infras/repos/observation-repo";

export interface GetConsensusPeriodInput {
  gameKey: ResultFeedGameKey;
  drawPeriod: string;
}

export interface GetConsensusPeriodOutput {
  consensus: ConsensusEntity;
  observations: ObservationEntity[];
}

export class GetConsensusPeriodUseCase {
  private readonly consensusRepo = new ConsensusRepository();
  private readonly observationRepo = new ObservationRepository();

  async run(input: GetConsensusPeriodInput): Promise<GetConsensusPeriodOutput> {
    const consensus = await this.consensusRepo.findByGameKeyAndPeriod(input.gameKey, input.drawPeriod);
    if (!consensus) {
      throw AppException.notFound(`Không tìm thấy consensus cho game=${input.gameKey}, kỳ=${input.drawPeriod}.`);
    }
    const observations = await this.observationRepo.findByGameKeyAndPeriod(input.gameKey, input.drawPeriod);
    return { consensus, observations };
  }
}
