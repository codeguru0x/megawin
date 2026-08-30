import { UseCase } from "@megawin/app-core/use-cases";
import { suggestVietlottPeriod, VietlottScheduleKind } from "@megawin/game-core/utils";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { GetVietlottSuggestionInput, GetVietlottSuggestionOutput } from "./dto/draw.dto";

/**
 * Gợi ý mã kỳ Vietlott (`vietlottRef.drawPeriod`) cho dialog công bố kết quả Bingo 18.
 *
 * Đọc neo + lịch quay TỪ DB (`GlobalConfigDoc` thật, không phải `DEFAULT_BINGO18_CONFIG`) —
 * config-only design (xem `vietlott-period-suggestion/p0-shared.plan.md` §P0.0.1): KHÔNG
 * query `vietlottRef` của kỳ khác để tránh lan truyền lỗi nhập tay.
 */
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
        kind: VietlottScheduleKind.Grid,
        firstDrawTime: config.play.firstDrawTime,
        lastDrawTime: config.play.lastDrawTime,
        intervalMinutes: config.play.drawIntervalMinutes,
      },
    });

    return {
      suggestedPeriod,
      reason,
      // draw.drawDate đã LÀ ngày VN của drawTime (gán lúc tạo kỳ) → dùng thẳng, không tính
      // lại qua formatVNDate để tránh 2 nguồn có thể lệch nhau.
      suggestedDrawDate: draw.drawDate,
    };
  }
}
