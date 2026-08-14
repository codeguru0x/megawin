/**
 * Use Case: List Jackpots (cross-game) — `GET /games/jackpots`
 *
 * Trả jackpot hiện tại của TẤT CẢ game có jackpot trong 1 request (thay vì gọi từng
 * `GET /games/{game}/jackpot`). Phục vụ widget "Jackpot đang tích luỹ" ở trang chủ tenant.
 *
 * Chỉ 3 game có jackpot cycle: lotto535, mega645, power655 — xem
 * {@link JackpotGameProduct}. Gọi 3 use-case SONG SONG qua `tryLoad` để 1 game
 * lỗi/thiếu cycle không làm hỏng cả response.
 *
 * Đặt ở tầng app (không thuộc package game nào) vì đây là aggregate CROSS-GAME — mỗi game
 * vẫn sở hữu logic jackpot của mình trong `GetJackpotPlayerUseCase`; use-case này
 * chỉ orchestrate + map sang shape chung.
 *
 * ⚠️ PHÂN LOẠI LỖI (quan trọng): `NOT_FOUND` = game đang GIỮA 2 cycle → bỏ qua im lặng,
 * đúng nghiệp vụ. MỌI lỗi khác (DB timeout, config lỗi, bug mapping) được LOG ở mức error
 * rồi mới bỏ qua — nếu nuốt im lặng thì Mongo chết sẽ trả `200 { jackpots: [] }` và không
 * ai biết. Phân loại này do `tryLoad` (`@megawin/shared/utils`) đảm nhiệm, dùng chung với
 * các endpoint aggregate khác — KHÔNG tự viết lại bằng `allSettled` + `console.error`.
 *
 * ⚠️ CHỐNG DRIFT: `details` được khai báo bằng `Omit<PlayerGetJackpotOutput, …>` (xem
 * `jackpot-summary.types.ts`) nên endpoint gộp luôn là SUPERSET của endpoint riêng từng
 * game. Game thêm field vào DTO getJackpot → 3 mapper dưới đây KHÔNG COMPILE cho tới khi
 * map field mới. Khi đó phải cập nhật `@megawin/player-sdk` + CHANGELOG (SDK mirror tay).
 * TUYỆT ĐỐI KHÔNG "chữa" lỗi compile bằng cách nới type `details` — đó là mất dữ liệu.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { JackpotGameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import {
  GetJackpotPlayerUseCase as GetLotto535JackpotUseCase,
  type PlayerGetJackpotOutput as Lotto535JackpotOutput,
} from "@megawin/game-lotto535-application/use-cases/player";
import {
  GetJackpotPlayerUseCase as GetMega645JackpotUseCase,
  type PlayerGetJackpotOutput as Mega645JackpotOutput,
} from "@megawin/game-mega645-application/use-cases/player";
import {
  GetJackpotPlayerUseCase as GetPower655JackpotUseCase,
  type PlayerGetJackpotOutput as Power655JackpotOutput,
} from "@megawin/game-power655-application/use-cases/player";
import { tryLoad } from "@megawin/shared/utils";

import type { JackpotSummary, JackpotSummaryListResponse } from "./jackpot-summary.types";

/** Map output getJackpot của Lotto 5/35 → mục summary trong response gộp. */
function toLotto535Summary(out: Lotto535JackpotOutput): JackpotSummary {
  return {
    gameProduct: JackpotGameProduct.Lotto535,
    displayName: GAME_LABELS[JackpotGameProduct.Lotto535],
    primaryAmount: out.currentAmount,
    cycleNo: out.cycleNo,
    drawCount: out.drawCount,
    startDrawId: out.startDrawId,
    details: {
      seedAmount: out.seedAmount,
      peakAmount: out.peakAmount,
      totalContribution: out.totalContribution,
      progress: {
        splitThreshold: out.progress.splitThreshold,
        percentage: out.progress.percentage,
        reachedSplitThreshold: out.progress.reachedSplitThreshold,
      },
    },
  };
}

/** Map output getJackpot của Mega 6/45 → mục summary trong response gộp. */
function toMega645Summary(out: Mega645JackpotOutput): JackpotSummary {
  return {
    gameProduct: JackpotGameProduct.Mega645,
    displayName: GAME_LABELS[JackpotGameProduct.Mega645],
    primaryAmount: out.currentAmount,
    cycleNo: out.cycleNo,
    drawCount: out.drawCount,
    startDrawId: out.startDrawId,
    details: {
      seedAmount: out.seedAmount,
      peakAmount: out.peakAmount,
      totalContribution: out.totalContribution,
    },
  };
}

/** Map output getJackpot của Power 6/55 (dual JP) → mục summary trong response gộp. */
function toPower655Summary(out: Power655JackpotOutput): JackpotSummary {
  return {
    gameProduct: JackpotGameProduct.Power655,
    displayName: GAME_LABELS[JackpotGameProduct.Power655],
    // primaryAmount = Jackpot 1 (giải chính 6/6). JP2 nằm trong details.
    primaryAmount: out.jackpot1CurrentAmount,
    cycleNo: out.cycleNo,
    drawCount: out.drawCount,
    startDrawId: out.startDrawId,
    details: {
      jackpot2CurrentAmount: out.jackpot2CurrentAmount,
      jackpot1SeedAmount: out.jackpot1SeedAmount,
      jackpot2SeedAmount: out.jackpot2SeedAmount,
      jackpot1OverflowThreshold: out.jackpot1OverflowThreshold,
      jackpot2ResetCount: out.jackpot2ResetCount,
    },
  };
}

/** Label dùng cho log — trace nhanh về endpoint này trên CloudWatch. */
const SCOPE = "ListJackpots";

export class ListJackpotsUseCase extends UseCase<void, JackpotSummaryListResponse> {
  private readonly lotto535 = new GetLotto535JackpotUseCase();
  private readonly mega645 = new GetMega645JackpotUseCase();
  private readonly power655 = new GetPower655JackpotUseCase();

  protected async execute(): Promise<JackpotSummaryListResponse> {
    // Gọi song song 3 game — mỗi game 1 findOne trên index `status` (qua cache TTL 60s).
    //
    // Mapping nằm TRONG `tryLoad` (không map sau) để cả 3 promise cùng type `JackpotSummary`
    // → gom kết quả chỉ cần `filter`, không cần out-param/`PromiseSettledResult`. `tryLoad`
    // không bao giờ reject nên dùng `Promise.all` thuần: NOT_FOUND (game giữa 2 cycle) → bỏ
    // qua im lặng, lỗi bất thường (DB down, bug mapping) → tự log error kèm `source`.
    const [lotto535, mega645, power655] = await Promise.all([
      tryLoad(() => this.lotto535.run().then(toLotto535Summary), {
        scope: SCOPE,
        source: JackpotGameProduct.Lotto535,
      }),
      tryLoad(() => this.mega645.run().then(toMega645Summary), {
        scope: SCOPE,
        source: JackpotGameProduct.Mega645,
      }),
      tryLoad(() => this.power655.run().then(toPower655Summary), {
        scope: SCOPE,
        source: JackpotGameProduct.Power655,
      }),
    ]);

    return { jackpots: [lotto535, mega645, power655].filter((jp) => jp !== undefined) };
  }
}
