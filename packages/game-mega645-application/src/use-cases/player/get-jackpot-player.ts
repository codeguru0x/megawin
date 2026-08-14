/**
 * Use Case: Get Jackpot for Player (Mega 6/45)
 *
 * Điểm truy cập DUY NHẤT cho dữ liệu jackpot hiển thị của Mega 6/45. Trả raw output
 * (`PlayerGetJackpotOutput`), throw {@link AppException} `NOT_FOUND` khi chưa có active cycle.
 *
 * Hai caller dùng CHUNG class này:
 *   - Handler `GET /games/mega645/jackpot` (api-player) — envelope HTTP do middleware bọc.
 *   - `ListJackpotsUseCase` (api-player, cross-game) → `GET /games/jackpots`, gọi song song
 *     3 game bằng `tryLoad` + `Promise.all`.
 *
 * Trước 14/08/2026 chỗ này là 2 class (`*InternalUseCase` trả raw + `*UseCase` bọc `NextResponse`).
 * Sau khi `UseCase` thống nhất trả raw và envelope chuyển ra middleware ở edge, class thứ hai chỉ
 * còn `return this.internal.run()` — đã gộp làm một.
 *
 * Đọc qua `activeJackpotCycleCache` (TTL 60s) — read path hiển thị, KHÔNG phải đường tiền.
 * Settle/void/resettle vẫn đọc thẳng repo.
 *
 * Mega 6/45 KHÔNG có splitThreshold — không có progress block như Lotto 5/35.
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";

import { activeJackpotCycleCache } from "../../caches/active-jackpot-cycle.cache";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerUseCase extends UseCase<void, PlayerGetJackpotOutput> {
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
