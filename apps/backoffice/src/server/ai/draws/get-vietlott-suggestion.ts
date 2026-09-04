/**
 * Use Case: Get Vietlott Suggestion (app-level, gộp 7 game)
 *
 * Điểm truy cập DUY NHẤT để tool `getVietlottSuggestion` tra mã kỳ Vietlott GỢI Ý (chưa xác nhận)
 * — theo 2 chế độ:
 *
 * - **Mode `draw`** (`drawId` — 1 kỳ MegaWin ĐÃ TỒN TẠI): dispatch thẳng sang
 *   `GetVietlottSuggestionUseCase` của game tương ứng — use-case này ĐÃ CÓ SẴN (phục vụ autofill
 *   form publish-result), file này chỉ ghép output.
 * - **Mode `time`** (`drawDate` + `drawTime` — 1 THỜI ĐIỂM TUỲ Ý chưa gắn kỳ nào): per-game
 *   use-case ở trên BẮT BUỘC có `drawId` tồn tại trong DB (đọc `DrawRepository.getDrawById` để
 *   suy `drawDate`/`drawTime`) nên KHÔNG dùng được cho trường hợp này — dispatcher tự đọc
 *   `GlobalConfigDoc` (qua `GetGlobalConfigUseCase` của từng game) và gọi hàm toán thuần
 *   `suggestVietlottPeriod` (`game-core`) trực tiếp, dựng `schedule` theo ĐÚNG field config của
 *   từng game — cùng công thức từng per-game use-case đang dùng, chỉ khác nguồn `target`.
 *
 * `game-core-application` KHÔNG phụ thuộc 7 package `game-*-application` → use-case gộp PHẢI sống
 * ở tầng app (`app-use-case-layering.mdc` §1), giống `get-draw-snapshot.ts` /
 * `get-vietlott-result-comparison.ts`.
 *
 * ⚠️ KHÔNG khuyến khích sửa `GlobalConfigDoc` chỉ để tool này tính ra số — nếu suggestion lệch
 * thực tế Vietlott, đó là dấu hiệu dữ liệu Vietlott tham chiếu/lịch quay CÓ THỂ sai, nhưng chỉ nên
 * đổi config khi staff đã XÁC NHẬN THẬT với dữ liệu Vietlott (VD qua `getVietlottResult`), KHÔNG
 * đổi chỉ để "cho khớp" — xem `guidance` trong output, luôn nhắc lại quy tắc này.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { GetVietlottSuggestionUseCase as Bingo18SuggestionUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { GetGlobalConfigUseCase as Bingo18GetConfigUseCase } from "@megawin/game-bingo18-application/use-cases/game-config";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import type { VietlottPeriodAnchor } from "@megawin/game-core/types";
import {
  suggestVietlottPeriod,
  type VietlottDrawSchedule,
  VietlottScheduleKind,
  VietlottSuggestionUnavailableReason,
} from "@megawin/game-core/utils";
import { GetVietlottSuggestionUseCase as KenoSuggestionUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { GetGlobalConfigUseCase as KenoGetConfigUseCase } from "@megawin/game-keno-application/use-cases/game-config";
import { GetVietlottSuggestionUseCase as Lotto535SuggestionUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { GetGlobalConfigUseCase as Lotto535GetConfigUseCase } from "@megawin/game-lotto535-application/use-cases/game-config";
import { GetVietlottSuggestionUseCase as Max3dSuggestionUseCase } from "@megawin/game-max3d-application/use-cases/draws";
import { GetGlobalConfigUseCase as Max3dGetConfigUseCase } from "@megawin/game-max3d-application/use-cases/game-config";
import { GetVietlottSuggestionUseCase as Max3dproSuggestionUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { GetGlobalConfigUseCase as Max3dproGetConfigUseCase } from "@megawin/game-max3dpro-application/use-cases/game-config";
import { GetVietlottSuggestionUseCase as Mega645SuggestionUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { GetGlobalConfigUseCase as Mega645GetConfigUseCase } from "@megawin/game-mega645-application/use-cases/game-config";
import { GetVietlottSuggestionUseCase as Power655SuggestionUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { GetGlobalConfigUseCase as Power655GetConfigUseCase } from "@megawin/game-power655-application/use-cases/game-config";
import { AppException } from "@megawin/shared/errors";
import { toVNDate } from "@megawin/shared/utils";

import {
  type GetVietlottSuggestionDispatchInput,
  type GetVietlottSuggestionDispatchOutput,
  VietlottSuggestionMode,
} from "./types";

const suggestionUseCases = {
  [GameProduct.Keno]: new KenoSuggestionUseCase(),
  [GameProduct.Lotto535]: new Lotto535SuggestionUseCase(),
  [GameProduct.Mega645]: new Mega645SuggestionUseCase(),
  [GameProduct.Power655]: new Power655SuggestionUseCase(),
  [GameProduct.Max3d]: new Max3dSuggestionUseCase(),
  [GameProduct.Max3dpro]: new Max3dproSuggestionUseCase(),
  [GameProduct.Bingo18]: new Bingo18SuggestionUseCase(),
};

const kenoConfigUseCase = new KenoGetConfigUseCase();
const lotto535ConfigUseCase = new Lotto535GetConfigUseCase();
const mega645ConfigUseCase = new Mega645GetConfigUseCase();
const power655ConfigUseCase = new Power655GetConfigUseCase();
const max3dConfigUseCase = new Max3dGetConfigUseCase();
const max3dproConfigUseCase = new Max3dproGetConfigUseCase();
const bingo18ConfigUseCase = new Bingo18GetConfigUseCase();

/** Bắt compiler khi `GameProduct` thêm entry mới mà `suggestionUseCases` chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof suggestionUseCases {
  if (!(game in suggestionUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

/**
 * Đọc dữ liệu Vietlott tham chiếu + dựng `schedule` (mode `time`) — mỗi `case` giữ đúng field
 * config của game đó, CÙNG công thức từng per-game `GetVietlottSuggestionUseCase` đang dùng (xem
 * JSDoc đầu file).
 */
async function loadAnchorAndSchedule(
  game: GameProduct,
): Promise<{ anchor: VietlottPeriodAnchor | undefined; schedule: VietlottDrawSchedule }> {
  switch (game) {
    case GameProduct.Keno: {
      const config = await kenoConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: {
          kind: VietlottScheduleKind.Grid,
          firstDrawTime: config.play.firstDrawTime,
          lastDrawTime: config.play.lastDrawTime,
          intervalMinutes: config.play.drawIntervalMinutes,
        },
      };
    }
    case GameProduct.Bingo18: {
      const config = await bingo18ConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: {
          kind: VietlottScheduleKind.Grid,
          firstDrawTime: config.play.firstDrawTime,
          lastDrawTime: config.play.lastDrawTime,
          intervalMinutes: config.play.drawIntervalMinutes,
        },
      };
    }
    case GameProduct.Lotto535: {
      const config = await lotto535ConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: { kind: VietlottScheduleKind.FixedTimes, drawTimes: config.play.drawTimes },
      };
    }
    case GameProduct.Mega645: {
      const config = await mega645ConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: {
          kind: VietlottScheduleKind.FixedTimes,
          drawTimes: [config.play.drawTime],
          drawDaysOfWeek: config.play.drawDaysOfWeek,
        },
      };
    }
    case GameProduct.Power655: {
      const config = await power655ConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: {
          kind: VietlottScheduleKind.FixedTimes,
          drawTimes: config.play.drawTimes,
          drawDaysOfWeek: config.play.drawDaysOfWeek,
        },
      };
    }
    case GameProduct.Max3d: {
      const config = await max3dConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: {
          kind: VietlottScheduleKind.FixedTimes,
          drawTimes: config.play.drawTimes,
          drawDaysOfWeek: config.play.drawDaysOfWeek,
        },
      };
    }
    case GameProduct.Max3dpro: {
      const config = await max3dproConfigUseCase.run();
      return {
        anchor: config.vietlott,
        schedule: {
          kind: VietlottScheduleKind.FixedTimes,
          drawTimes: config.play.drawTimes,
          drawDaysOfWeek: config.play.drawDaysOfWeek,
        },
      };
    }
    default: {
      const _exhaustive: never = game;
      throw AppException.internal(`Game không được hỗ trợ: ${String(_exhaustive)}`);
    }
  }
}

export class GetVietlottSuggestionDispatchUseCase extends UseCase<
  GetVietlottSuggestionDispatchInput,
  GetVietlottSuggestionDispatchOutput
> {
  protected async execute(input: GetVietlottSuggestionDispatchInput): Promise<GetVietlottSuggestionDispatchOutput> {
    const { game } = input;
    assertKnownGame(game);

    const meta = { game, gameLabel: GAME_LABELS[game], fetchedAt: new Date().toISOString() };

    if (input.drawId !== undefined) {
      const result = await suggestionUseCases[game].run({ drawId: input.drawId });
      return {
        meta: { ...meta, mode: VietlottSuggestionMode.Draw },
        draw: { drawId: input.drawId, drawDate: result.suggestedDrawDate },
        target: null,
        suggestion: { suggestedPeriod: result.suggestedPeriod, reason: result.reason },
        guidance: buildSuggestionGuidance({
          mode: VietlottSuggestionMode.Draw,
          gameLabel: GAME_LABELS[game],
          suggestedPeriod: result.suggestedPeriod,
          reason: result.reason,
        }),
      };
    }

    // Mode `time` — input schema (Zod, ở tool) đã đảm bảo có cả drawDate + drawTime khi không có
    // drawId. Check lại ở đây CHỈ để giữ type-safety cho compiler (không phải re-validate business
    // rule), vì `run()` là public method, không chỉ có tool này gọi.
    if (input.drawDate === undefined || input.drawTime === undefined) {
      throw AppException.badRequest("Phải truyền `drawId`, hoặc cả `drawDate` và `drawTime`.");
    }

    const { anchor, schedule } = await loadAnchorAndSchedule(game);
    const drawDate = input.drawDate;
    const drawTime = input.drawTime;
    const { suggestedPeriod, reason } = suggestVietlottPeriod({
      target: { drawDate, drawTime: toVNDate(drawDate, drawTime) },
      anchor,
      schedule,
    });

    return {
      meta: { ...meta, mode: VietlottSuggestionMode.Time },
      draw: null,
      target: { drawDate, drawTime },
      suggestion: { suggestedPeriod, reason },
      guidance: buildSuggestionGuidance({
        mode: VietlottSuggestionMode.Time,
        gameLabel: GAME_LABELS[game],
        suggestedPeriod,
        reason,
      }),
    };
  }
}

/**
 * Hướng dẫn phrasing cho model — build ĐỘNG theo `reason`/`mode`, chỉ tốn token khi tool THẬT SỰ
 * được gọi (khác 1 file instructions "system"-role cũ, luôn nằm trong context mọi lượt).
 *
 * Nguyên tắc phrasing với user (theo yêu cầu thiết kế): CHỈ nhấn mạnh đây là mã kỳ GỢI Ý, PHẢI xác
 * nhận lại khi nhập/công bố kết quả — TUYỆT ĐỐI KHÔNG giải thích cách tính ra số (không nhắc "cấu
 * hình", "công thức", "lịch quay", "dữ liệu tham chiếu Vietlott" hay bất kỳ chi tiết kỹ thuật nào
 * với user). Các case `reason` dưới đây là lỗi/thiếu dữ liệu cấu hình — CHỈ báo hiện trạng ngắn,
 * không tự đề xuất sửa `GlobalConfigDoc` trừ khi staff đã xác nhận thật với Vietlott.
 */
function buildSuggestionGuidance(params: {
  mode: VietlottSuggestionMode;
  gameLabel: string;
  suggestedPeriod: string | null;
  reason: VietlottSuggestionUnavailableReason | null;
}): string {
  const { mode, gameLabel, suggestedPeriod, reason } = params;

  if (reason !== null) {
    switch (reason) {
      case VietlottSuggestionUnavailableReason.NoAnchor:
        return (
          `Game ${gameLabel} chưa có dữ liệu Vietlott tham chiếu trong cấu hình — không tính được ` +
          "mã kỳ gợi ý. Chỉ báo hiện trạng cho user, KHÔNG tự đề xuất đổi/thêm cấu hình chỉ để tool " +
          "này chạy được."
        );
      case VietlottSuggestionUnavailableReason.BeforeAnchorDate:
        return (
          `Thời điểm được hỏi nằm trước mốc dữ liệu Vietlott tham chiếu hiện có của ${gameLabel} — ` +
          "không tính được mã kỳ gợi ý cho thời điểm này. Nếu chắc thời điểm đúng, đề nghị kiểm tra " +
          "lại giờ quay của kỳ. KHÔNG tự đề xuất sửa cấu hình chỉ để công thức chạy được — chỉ đổi " +
          "khi có xác nhận THẬT từ Vietlott."
        );
      case VietlottSuggestionUnavailableReason.OffGrid:
        return (
          `Giờ quay được hỏi không khớp lịch quay chuẩn hiện tại của ${gameLabel} — có thể do giờ ` +
          "quay kỳ này bị sửa tay hoặc nhập nhầm. Đề nghị kiểm tra lại giờ quay trước khi publish; " +
          "KHÔNG tự đề xuất sửa cấu hình chỉ để có mã kỳ gợi ý."
        );
      case VietlottSuggestionUnavailableReason.ScheduleChangedSinceAnchor:
        return (
          `Dữ liệu Vietlott tham chiếu hiện có của ${gameLabel} không còn khớp lịch quay hiện tại ` +
          "— lịch quay nhiều khả năng đã đổi. CHỈ đề nghị cập nhật lại cấu hình NẾU staff xác nhận " +
          'thật lịch đã đổi (đối chiếu Vietlott) — không tự đề xuất sửa chỉ để "cho khớp".'
        );
      default: {
        const _exhaustive: never = reason;
        return String(_exhaustive);
      }
    }
  }

  if (suggestedPeriod === null) {
    return "Không tính được mã kỳ Vietlott gợi ý vì lý do không xác định — báo hiện trạng, không bịa mã kỳ.";
  }

  return mode === VietlottSuggestionMode.Draw
    ? "Với user: CHỈ nói đây là mã kỳ Vietlott GỢI Ý, khi nhập/công bố kết quả PHẢI xác nhận lại " +
        "với dữ liệu Vietlott thật. TUYỆT ĐỐI KHÔNG giải thích cách tính ra số này. Muốn xem/đối " +
        "chiếu kết quả THẬT, dùng tool getVietlottResult."
    : "Với user: CHỈ nói đây là mã kỳ Vietlott GỢI Ý cho thời điểm được hỏi — chưa gắn với kỳ " +
        "MegaWin nào, khi nhập/công bố kết quả PHẢI xác nhận lại với dữ liệu Vietlott thật. TUYỆT " +
        "ĐỐI KHÔNG giải thích cách tính ra số này.";
}
