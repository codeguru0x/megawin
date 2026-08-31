/**
 * Use Case: Preview Draws (Bingo18)
 *
 * Trả về danh sách kỳ quay **còn tạo được** của MỘT ngày chỉ định — nguồn dữ liệu duy nhất
 * cho bảng gợi ý trong dialog "Tạo kỳ quay" ở backoffice.
 *
 * Công thức: `lưới giờ trong ngày (game config) − slot hết cửa sổ bán − slot đã có kỳ`.
 * Toàn bộ phép toán nằm ở `computeDrawDayCapacity` (`@megawin/game-core/utils`) để dùng
 * chung với `CreateDrawUseCase` — xem JSDoc `isDrawSlotCreatable` về lý do KHÔNG viết lại
 * điều kiện ở 2 nơi.
 *
 * Chỉ đọc, KHÔNG cấp `drawNo` từ counter: `drawNo` trong output là **dự kiến**
 * (`lastDrawNo + k`) chỉ để hiển thị. Số thật do `CreateDrawUseCase` lấy từ atomic counter.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { computeDrawDayCapacity, isDrawSlotCreatable, listDrawSlotMinutes } from "@megawin/game-core/utils";
import { AppException } from "@megawin/shared/errors";
import { minutesOfDayVN, minutesToHHmm, secondsOfDayVN, todayVN, toVNDate } from "@megawin/shared/utils";

import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

export class PreviewDrawsUseCase extends UseCase<PreviewDrawsInput, PreviewDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly counterRepo = new DrawCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: PreviewDrawsInput): Promise<PreviewDrawsOutput> {
    const today = todayVN();
    const drawDate = input.drawDate ?? today;

    // Ngày đã qua thì mọi kỳ của nó đã có kết quả — tạo mới là vô nghĩa và làm lệch báo cáo.
    // Chặn ở đây (không chỉ ở CreateDraw) để staff biết ngay khi chọn ngày, không phải bấm
    // tạo mới thấy lỗi.
    if (drawDate < today) {
      throw AppException.badRequest(`Không thể tạo kỳ quay cho ngày đã qua: ${drawDate} (hôm nay ${today}).`);
    }

    const { play } = await this.getGlobalConfig.run();

    // Chỉ ngày HÔM NAY mới bị lọc theo giờ. Ngày tương lai: `undefined` ⇒ mọi slot còn nguyên
    // cửa sổ bán (xem `isDrawSlotCreatable`).
    const nowSecondsOfDay = drawDate === today ? secondsOfDayVN() : undefined;

    const grid = listDrawSlotMinutes(play.firstDrawTime, play.lastDrawTime, play.drawIntervalMinutes);
    if (!grid) {
      throw AppException.badRequest(
        "Cấu hình lịch quay không hợp lệ (giờ kỳ đầu/kỳ cuối hoặc chu kỳ). Vui lòng kiểm tra cấu hình game.",
      );
    }

    // ── Mốc cắt: slot ĐẦU TIÊN còn tạo được ────────────────────────────────────────────
    // Dùng làm `fromDrawTime` cho query DB bên dưới. Kỳ có `drawTime` sớm hơn mốc này không
    // thể trùng với kỳ đang định tạo (kỳ mới luôn ở tương lai), nên không cần đọc về —
    // buổi tối điều này cắt ~140 document vô ích mỗi lần staff mở dialog.
    const firstCreatableMinutes = grid.find((m) =>
      isDrawSlotCreatable(m, play.salesCloseBeforeSeconds, nowSecondsOfDay),
    );

    // Hôm nay đã qua giờ kỳ cuối ⇒ không slot nào tạo được, khỏi cần query DB.
    if (firstCreatableMinutes === undefined) {
      return { drawDate, maxPerDay: grid.length, draws: [] };
    }

    const [existingDrawTimes, counter] = await Promise.all([
      this.drawRepo.listDrawTimesByDate(drawDate, toVNDate(drawDate, minutesToHHmm(firstCreatableMinutes))),
      this.counterRepo.findOne({ drawDate }),
    ]);

    const capacity = computeDrawDayCapacity({
      firstDrawTime: play.firstDrawTime,
      lastDrawTime: play.lastDrawTime,
      intervalMinutes: play.drawIntervalMinutes,
      salesCloseBeforeSeconds: play.salesCloseBeforeSeconds,
      // `drawTime` là `Date` (UTC instant) → quy về phút-trong-ngày giờ VN để so với lưới.
      occupiedMinutes: existingDrawTimes.map(minutesOfDayVN),
      nowSecondsOfDay,
    });

    // `grid` đã tính được ở trên nên config chắc chắn hợp lệ — nhánh này không đạt tới được,
    // giữ để thoả type mà không cần non-null assertion.
    if (!capacity) {
      throw AppException.badRequest("Cấu hình lịch quay không hợp lệ. Vui lòng kiểm tra cấu hình game.");
    }

    const lastDrawNo = counter?.lastDrawNo ?? 0;

    return {
      drawDate,
      maxPerDay: capacity.maxPerDay,
      draws: capacity.availableMinutes.map((minutes, i) => {
        const drawTime = toVNDate(drawDate, minutesToHHmm(minutes));

        return {
          // Số dự kiến = counter hiện tại + vị trí trong danh sách. Server cấp lại lúc tạo.
          drawNo: lastDrawNo + i + 1,
          drawDate,
          drawTime: drawTime.toISOString(),
          closeAt: new Date(drawTime.getTime() - play.salesCloseBeforeSeconds * 1000).toISOString(),
        };
      }),
    };
  }
}
