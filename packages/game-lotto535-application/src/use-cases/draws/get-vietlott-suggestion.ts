/**
 * Use Case: Get Vietlott Suggestion (Lotto 5/35)
 *
 * Gợi ý mã kỳ Vietlott (`vietlottRef.drawPeriod`) cho dialog công bố kết quả — đọc
 * neo + lịch quay từ `GlobalConfigDoc` (DB, qua `GetGlobalConfigUseCase`) và
 * `drawTime` của CHÍNH kỳ đang publish, rồi gọi hàm toán thuần `suggestVietlottPeriod`
 * ở `game-core`. KHÔNG query `vietlottRef` của kỳ khác (config-only design — xem
 * `.cursor/plans/vietlott-period-suggestion/00-overview.md` §4.4).
 *
 * Khác Keno (schedule kiểu Grid), Lotto 5/35 dùng schedule kiểu FixedTimes — lịch quay
 * là danh sách `play.drawTimes` cố định, quay MỌI ngày (không giới hạn `drawDaysOfWeek`).
 *
 * Config DB thiếu `vietlott` (neo chưa cấu hình) → trả `reason: NoAnchor`, KHÔNG
 * fallback `DEFAULT_LOTTO535_CONFIG` (P0.0.1).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { suggestVietlottPeriod, VietlottScheduleKind } from "@megawin/game-core/utils";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { GetVietlottSuggestionInput, GetVietlottSuggestionOutput } from "./dto/draw.dto";

export class GetVietlottSuggestionUseCase extends UseCase<GetVietlottSuggestionInput, GetVietlottSuggestionOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: GetVietlottSuggestionInput): Promise<GetVietlottSuggestionOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const config = await this.getGlobalConfig.run();

    const { suggestedPeriod, reason } = suggestVietlottPeriod({
      target: { drawDate: draw.drawDate, drawTime: draw.drawTime },
      anchor: config.vietlott,
      schedule: {
        kind: VietlottScheduleKind.FixedTimes,
        drawTimes: config.play.drawTimes,
      },
    });

    return {
      suggestedPeriod,
      reason,
      // draw.drawDate đã LÀ ngày VN của drawTime (gán lúc tạo kỳ) → dùng thẳng, không
      // tính lại qua formatVNDate để tránh 2 nguồn có thể lệch nhau.
      suggestedDrawDate: draw.drawDate,
    };
  }
}
