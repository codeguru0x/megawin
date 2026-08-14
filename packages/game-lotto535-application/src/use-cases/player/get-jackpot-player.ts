/**
 * Use Case: Get Jackpot for Player (Lotto 5/35)
 *
 * Điểm truy cập DUY NHẤT cho dữ liệu jackpot hiển thị của Lotto 5/35. Trả raw output
 * (`PlayerGetJackpotOutput`), throw {@link AppException} `NOT_FOUND` khi chưa có active cycle.
 *
 * Hai caller dùng CHUNG class này:
 *   - Handler `GET /games/lotto535/jackpot` (api-player) — envelope HTTP do middleware bọc.
 *   - `ListJackpotsUseCase` (api-player, cross-game) → `GET /games/jackpots`, gọi song song
 *     3 game bằng `tryLoad` + `Promise.all`.
 *
 * Trước 14/08/2026 chỗ này là 2 class (`*InternalUseCase` trả raw + `*UseCase` bọc `NextResponse`).
 * Sau khi `UseCase` thống nhất trả raw và envelope chuyển ra middleware ở edge, class thứ hai chỉ
 * còn `return this.internal.run()` — đã gộp làm một.
 *
 * Đọc qua `activeJackpotCycleCache` (TTL 60s) — read path hiển thị, KHÔNG phải đường tiền.
 * Settle/void/resettle vẫn đọc thẳng repo.
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";
import { hasReachedSplitThreshold } from "@megawin/game-lotto535/rules";

import { activeJackpotCycleCache } from "../../caches/active-jackpot-cycle.cache";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerUseCase extends UseCase<void, PlayerGetJackpotOutput> {
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
