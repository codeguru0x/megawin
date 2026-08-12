/**
 * Use Case: Get Jackpot for Player (Power 6/55)
 *
 * `GetJackpotPlayerInternalUseCase` là điểm truy cập DUY NHẤT cho dữ liệu dual jackpot hiển
 * thị của Power 6/55. Trả raw output (`PlayerGetJackpotOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Hai caller:
 *   - `GetJackpotPlayerUseCase` (ApiGateway, cùng file) → `GET /games/power655/jackpot`, chỉ delegate.
 *   - `ListJackpotsUseCase` (api-player, cross-game) → `GET /games/jackpots`, gọi song song
 *     3 game bằng `tryLoad` + `Promise.all`.
 *
 * Đọc qua `activeJackpotCycleCache` (TTL 60s) — read path hiển thị, KHÔNG phải đường tiền.
 * Settle/void/resettle vẫn đọc thẳng repo.
 *
 * JP1 = trùng 6/6, JP2 = trùng 5/6 + bonus. Trả kèm overflow threshold để UI hiển thị
 * "JP1 gần ngưỡng 300 tỷ!".
 */

import { ApiGatewayUseCase, AppException, InternalUseCase } from "@megawin/app-core/use-cases";

import { activeJackpotCycleCache } from "../../caches/active-jackpot-cycle.cache";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerInternalUseCase extends InternalUseCase<void, PlayerGetJackpotOutput> {
  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const activeCycle = await activeJackpotCycleCache.fetch();

    if (activeCycle == null) {
      throw AppException.notFound("Không tìm thấy Jackpot hiện tại.");
    }

    return {
      jackpot1CurrentAmount: activeCycle.jackpot1CurrentAmount,
      jackpot2CurrentAmount: activeCycle.jackpot2CurrentAmount,
      jackpot1SeedAmount: activeCycle.jackpot1SeedAmount,
      jackpot2SeedAmount: activeCycle.jackpot2SeedAmount,
      jackpot1OverflowThreshold: activeCycle.config.jp1OverflowThreshold,
      cycleNo: activeCycle.cycleNo,
      drawCount: activeCycle.drawCount,
      jackpot2ResetCount: activeCycle.jackpot2ResetCount,
      startDrawId: activeCycle.startDrawId,
    };
  }
}

/**
 * Endpoint: `GET /games/power655/jackpot`.
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
