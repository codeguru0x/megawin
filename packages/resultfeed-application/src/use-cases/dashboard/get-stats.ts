/**
 * ResultFeed – GetDashboardStatsUseCase
 *
 * `07-admin-management-page.plan.md §3.4`. Tổng hợp cho trang `page.tsx` (dashboard):
 * đếm consensus theo `state` (toàn cục + breakdown mỗi game) và số alert `New` chưa xử lý.
 */

import { type ConsensusState, ResultFeedGameKey } from "@megawin/resultfeed/entities";

import { AlertRepository } from "../../infras/repos/alert-repo";
import { ConsensusRepository } from "../../infras/repos/consensus-repo";

export interface DashboardStatsOutput {
  /** Đếm toàn cục theo state — mọi game gộp lại. */
  totalByState: Record<ConsensusState, number>;
  /** Đếm theo từng game — dùng vẽ bảng/heatmap theo game. */
  byGame: Record<ResultFeedGameKey, Record<ConsensusState, number>>;
  /** Alert chưa xử lý (status=new) — badge trên sidebar/dashboard. */
  newAlertCount: number;
}

const ALL_GAME_KEYS = Object.values(ResultFeedGameKey);

export class GetDashboardStatsUseCase {
  private readonly consensusRepo = new ConsensusRepository();
  private readonly alertRepo = new AlertRepository();

  async run(): Promise<DashboardStatsOutput> {
    const [totalByState, byGameEntries, newAlertCount] = await Promise.all([
      this.consensusRepo.countByState(),
      Promise.all(
        ALL_GAME_KEYS.map(async (gameKey) => [gameKey, await this.consensusRepo.countByState(gameKey)] as const),
      ),
      this.alertRepo.countNew(),
    ]);

    const byGame = Object.fromEntries(byGameEntries) as Record<ResultFeedGameKey, Record<ConsensusState, number>>;

    return { totalByState, byGame, newAlertCount };
  }
}
