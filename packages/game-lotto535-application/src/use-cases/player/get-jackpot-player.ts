/**
 * Use Case: Get Jackpot for Player (Lotto 5/35)
 *
 * `GetJackpotPlayerInternalUseCase` là điểm truy cập DUY NHẤT cho dữ liệu jackpot hiển thị
 * của Lotto 5/35. Trả raw output (`PlayerGetJackpotOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Hai caller:
 *   - `GetJackpotPlayerUseCase` (ApiGateway, cùng file) → `GET /games/lotto535/jackpot`, chỉ delegate.
 *   - `ListJackpotsUseCase` (api-player, cross-game) → `GET /games/jackpots`, gọi song song
 *     3 game bằng `tryLoad` + `Promise.all`.
 *
 * Đọc qua `activeJackpotCycleCache` (TTL 60s) — read path hiển thị, KHÔNG phải đường tiền.
 * Settle/void/resettle vẫn đọc thẳng repo.
 */

import { ApiGatewayUseCase, AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { hasReachedSplitThreshold } from "@megawin/game-lotto535/rules";

import { activeJackpotCycleCache } from "../../caches/active-jackpot-cycle.cache";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerInternalUseCase extends InternalUseCase<void, PlayerGetJackpotOutput> {
  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const activeCycle = await activeJackpotCycleCache.fetch();

    if (!activeCycle) {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại.");
    }

    const { cycleNo, currentAmount, seedAmount, peakAmount, totalContribution, drawCount, startDrawId } = activeCycle;
    const splitThreshold = activeCycle.config.splitThreshold;
    const percentage = Math.min(Math.round((currentAmount / splitThreshold) * 10000) / 100, 100);

    return {
      cycleNo,
      currentAmount,
      seedAmount,
      peakAmount,
      totalContribution,
      drawCount,
      startDrawId,
      progress: {
        splitThreshold,
        percentage,
        reachedSplitThreshold: hasReachedSplitThreshold(currentAmount, splitThreshold),
      },
    };
  }
}

/**
 * Endpoint: `GET /games/lotto535/jackpot`.
 *
 * Chỉ đóng gói HTTP envelope — toàn bộ logic nằm ở {@link GetJackpotPlayerInternalUseCase}
 * (dùng chung với endpoint gộp cross-game `GET /games/jackpots`). Sửa logic jackpot thì
 * sửa ở internal use-case, KHÔNG sửa ở đây.
 */
export class GetJackpotPlayerUseCase extends ApiGatewayUseCase<void, PlayerGetJackpotOutput> {
  private readonly internal = new GetJackpotPlayerInternalUseCase();

  protected async execute(): Promise<PlayerGetJackpotOutput> {
    return await this.internal.run();
  }
}
