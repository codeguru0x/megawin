/**
 * Use Case: Get Jackpot for Player (Mega 6/45)
 *
 * `GetJackpotPlayerInternalUseCase` là điểm truy cập DUY NHẤT cho dữ liệu jackpot hiển thị
 * của Mega 6/45. Trả raw output (`PlayerGetJackpotOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Hai caller:
 *   - `GetJackpotPlayerUseCase` (ApiGateway, cùng file) → `GET /games/mega645/jackpot`, chỉ delegate.
 *   - `ListJackpotsUseCase` (api-player, cross-game) → `GET /games/jackpots`, gọi song song
 *     3 game bằng `tryLoad` + `Promise.all`.
 *
 * Đọc qua `activeJackpotCycleCache` (TTL 60s) — read path hiển thị, KHÔNG phải đường tiền.
 * Settle/void/resettle vẫn đọc thẳng repo.
 *
 * Mega 6/45 KHÔNG có splitThreshold — không có progress block như Lotto 5/35.
 */

import { ApiGatewayUseCase, AppException, InternalUseCase } from "@megawin/app-core/use-cases";

import { activeJackpotCycleCache } from "../../caches/active-jackpot-cycle.cache";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerInternalUseCase extends InternalUseCase<void, PlayerGetJackpotOutput> {
  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const activeCycle = await activeJackpotCycleCache.fetch();

    if (!activeCycle) {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại.");
    }

    const { cycleNo, currentAmount, seedAmount, peakAmount, totalContribution, drawCount, startDrawId } = activeCycle;

    return {
      cycleNo,
      currentAmount,
      seedAmount,
      peakAmount,
      totalContribution,
      drawCount,
      startDrawId,
    };
  }
}

/**
 * Endpoint: `GET /games/mega645/jackpot`.
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
