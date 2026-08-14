/**
 * Use Case: Get Jackpot for Player (Power 6/55)
 *
 * Điểm truy cập DUY NHẤT cho dữ liệu dual jackpot hiển thị của Power 6/55. Trả raw output
 * (`PlayerGetJackpotOutput`), throw {@link AppException} `NOT_FOUND` khi chưa có active cycle.
 *
 * Hai caller dùng CHUNG class này:
 *   - Handler `GET /games/power655/jackpot` (api-player) — envelope HTTP do middleware bọc.
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
 * JP1 = trùng 6/6, JP2 = trùng 5/6 + bonus. Trả kèm overflow threshold để UI hiển thị
 * "JP1 gần ngưỡng 300 tỷ!".
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";

import { activeJackpotCycleCache } from "../../caches/active-jackpot-cycle.cache";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerUseCase extends UseCase<void, PlayerGetJackpotOutput> {
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
