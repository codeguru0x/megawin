/**
 * Use Case: Get Jackpot History (app-level, gộp 3 game có Jackpot — Wave 2)
 *
 * Điểm truy cập DUY NHẤT để tool `getJackpotHistory` đọc LỊCH SỬ Jackpot đã ĐÓNG — dispatch theo
 * `JackpotGameProduct` sang `ListJackpotCyclesUseCase` (không `cycleNo`) hoặc
 * `ListJackpotHistoryByCycleUseCase` (có `cycleNo`, draw-by-draw trong đúng vòng đó) của package
 * tương ứng.
 *
 * KHÁC `GetGameJackpotUseCase` (`getGameJackpot`, đã có sẵn — số ĐANG TÍCH LUỸ + config seed/
 * ngưỡng, biến thiên liên tục): tool này chỉ trả dữ liệu SỰ KIỆN đã chốt (vòng đã đóng / kỳ đã
 * settle) — không trùng phạm vi, không gọi lại use-case của nhau.
 *
 * 1 tool, 2 độ sâu drill-down (danh sách vòng ↔ diễn biến từng kỳ trong 1 vòng cụ thể) — theo
 * nguyên tắc superset p1-03 §2.7, giống `getDrawSettleReport`.
 *
 * Dispatch bằng object map + `assertKnownGame` — RAW passthrough (`result: unknown`) vì Power
 * 6/55 có shape KHÁC 2 game kia (JP1/JP2 song song thay vì 1 field jackpot duy nhất) — không thể
 * ép về 1 type chung, giống lý do `reports/get-draw-settle-report.ts` không map field.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { JackpotGameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import {
  ListJackpotCyclesUseCase as Lotto535ListJackpotCyclesUseCase,
  ListJackpotHistoryByCycleUseCase as Lotto535ListJackpotHistoryByCycleUseCase,
} from "@megawin/game-lotto535-application/use-cases/jackpot";
import {
  ListJackpotCyclesUseCase as Mega645ListJackpotCyclesUseCase,
  ListJackpotHistoryByCycleUseCase as Mega645ListJackpotHistoryByCycleUseCase,
} from "@megawin/game-mega645-application/use-cases/jackpot";
import {
  ListJackpotCyclesUseCase as Power655ListJackpotCyclesUseCase,
  ListJackpotHistoryByCycleUseCase as Power655ListJackpotHistoryByCycleUseCase,
} from "@megawin/game-power655-application/use-cases/jackpot";
import { AppException } from "@megawin/shared/errors";

import type { GetJackpotHistoryDispatchInput, GetJackpotHistoryDispatchOutput } from "./history-types";

/** Trần cứng cho `limit` — tool AI, không phải bảng ảo hoá web (p1-03 §1.1 mục 2). */
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

const listCyclesUseCases = {
  [JackpotGameProduct.Lotto535]: new Lotto535ListJackpotCyclesUseCase(),
  [JackpotGameProduct.Mega645]: new Mega645ListJackpotCyclesUseCase(),
  [JackpotGameProduct.Power655]: new Power655ListJackpotCyclesUseCase(),
};

const listHistoryByCycleUseCases = {
  [JackpotGameProduct.Lotto535]: new Lotto535ListJackpotHistoryByCycleUseCase(),
  [JackpotGameProduct.Mega645]: new Mega645ListJackpotHistoryByCycleUseCase(),
  [JackpotGameProduct.Power655]: new Power655ListJackpotHistoryByCycleUseCase(),
};

/** Bắt compiler khi `JackpotGameProduct` thêm entry mới mà 2 map trên chưa có. */
function assertKnownGame(
  game: JackpotGameProduct,
): asserts game is keyof typeof listCyclesUseCases & keyof typeof listHistoryByCycleUseCases {
  if (!(game in listCyclesUseCases) || !(game in listHistoryByCycleUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class GetJackpotHistoryDispatchUseCase extends UseCase<
  GetJackpotHistoryDispatchInput,
  GetJackpotHistoryDispatchOutput
> {
  protected async execute(input: GetJackpotHistoryDispatchInput): Promise<GetJackpotHistoryDispatchOutput> {
    const { game, cycleNo } = input;
    assertKnownGame(game);

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = input.page ?? 1;

    const result =
      cycleNo === undefined
        ? await listCyclesUseCases[game].run({ page, size: limit })
        : await listHistoryByCycleUseCases[game].run({ cycleNo, page, size: limit });

    return {
      meta: {
        game,
        gameLabel: GAME_LABELS[game],
        view: cycleNo === undefined ? "cycles" : "cycle-detail",
        cycleNo,
        fetchedAt: new Date().toISOString(),
      },
      result,
    };
  }
}
