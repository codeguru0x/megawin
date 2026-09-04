/**
 * Use Case: Get Vietlott Result Comparison (app-level, gộp 7 game)
 *
 * Điểm truy cập DUY NHẤT để tool `getVietlottResult` đọc kết quả 1 kỳ quay (hoặc kỳ hiện hành) VÀ
 * đối chiếu với kết quả tham khảo tra được từ Vietlott (ResultFeed) theo mã kỳ Vietlott suy/xác
 * nhận từ kỳ đó. Dispatch theo `GameProduct` sang đúng `GetDrawDetailUseCase`/`GetCurrentDrawUseCase`/
 * `GetVietlottSuggestionUseCase`/`GetVietlottResultUseCase` của game tương ứng — toàn bộ 4 use-case
 * này ĐÃ CÓ SẴN (phục vụ autofill form publish-result), file này chỉ ghép lại + flatten + so sánh.
 *
 * `game-core-application` KHÔNG phụ thuộc 7 package `game-*-application` → use-case gộp PHẢI sống
 * ở tầng app (`app-use-case-layering.mdc` §1), giống `get-draw-snapshot.ts`.
 *
 * ⚠️ Khác `get-draw-snapshot.ts`: dispatcher đó trả `draw: unknown` (model tự đọc RAW DTO của mỗi
 * game), nên đường "kỳ hiện hành" dùng thẳng `GetCurrentDrawUseCase` — output của nó (`CurrentDrawInfo`)
 * là projection RÚT GỌN, KHÔNG có `vietlottRef`. Dispatcher này CẦN `vietlottRef` (để biết mã kỳ
 * Vietlott đã publish) VÀ `result` đầy đủ dù đang ở đường "kỳ hiện hành" hay "kỳ cụ thể" — nên LUÔN
 * resolve về `DrawEntity` đầy đủ qua `GetDrawDetailUseCase`, chỉ dùng `GetCurrentDrawUseCase` để lấy
 * `drawId` khi input không truyền `drawId` (chấp nhận thêm 1 lần gọi cho đường current).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { DrawResult as Bingo18DrawResult } from "@megawin/game-bingo18/entities";
import {
  GetCurrentDrawUseCase as Bingo18CurrentUseCase,
  GetDrawDetailUseCase as Bingo18DetailUseCase,
  GetVietlottResultUseCase as Bingo18ResultUseCase,
  GetVietlottSuggestionUseCase as Bingo18SuggestionUseCase,
} from "@megawin/game-bingo18-application/use-cases/draws";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import type { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import type { DrawResult as KenoDrawResult } from "@megawin/game-keno/entities";
import {
  GetCurrentDrawUseCase as KenoCurrentUseCase,
  GetDrawDetailUseCase as KenoDetailUseCase,
  GetVietlottResultUseCase as KenoResultUseCase,
  GetVietlottSuggestionUseCase as KenoSuggestionUseCase,
} from "@megawin/game-keno-application/use-cases/draws";
import type { DrawResult as Lotto535DrawResult } from "@megawin/game-lotto535/entities";
import {
  GetCurrentDrawUseCase as Lotto535CurrentUseCase,
  GetDrawDetailUseCase as Lotto535DetailUseCase,
  GetVietlottResultUseCase as Lotto535ResultUseCase,
  GetVietlottSuggestionUseCase as Lotto535SuggestionUseCase,
} from "@megawin/game-lotto535-application/use-cases/draws";
import type { DrawResult as Max3dDrawResult } from "@megawin/game-max3d/entities";
import {
  GetCurrentDrawUseCase as Max3dCurrentUseCase,
  GetDrawDetailUseCase as Max3dDetailUseCase,
  GetVietlottResultUseCase as Max3dResultUseCase,
  GetVietlottSuggestionUseCase as Max3dSuggestionUseCase,
} from "@megawin/game-max3d-application/use-cases/draws";
import type { DrawResult as Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import {
  GetCurrentDrawUseCase as Max3dproCurrentUseCase,
  GetDrawDetailUseCase as Max3dproDetailUseCase,
  GetVietlottResultUseCase as Max3dproResultUseCase,
  GetVietlottSuggestionUseCase as Max3dproSuggestionUseCase,
} from "@megawin/game-max3dpro-application/use-cases/draws";
import type { DrawResult as Mega645DrawResult } from "@megawin/game-mega645/entities";
import {
  GetCurrentDrawUseCase as Mega645CurrentUseCase,
  GetDrawDetailUseCase as Mega645DetailUseCase,
  GetVietlottResultUseCase as Mega645ResultUseCase,
  GetVietlottSuggestionUseCase as Mega645SuggestionUseCase,
} from "@megawin/game-mega645-application/use-cases/draws";
import type { DrawResult as Power655DrawResult } from "@megawin/game-power655/entities";
import {
  GetCurrentDrawUseCase as Power655CurrentUseCase,
  GetDrawDetailUseCase as Power655DetailUseCase,
  GetVietlottResultUseCase as Power655ResultUseCase,
  GetVietlottSuggestionUseCase as Power655SuggestionUseCase,
} from "@megawin/game-power655-application/use-cases/draws";
import { AppException } from "@megawin/shared/errors";
import type { WireType } from "@megawin/shared/types";

import { resultFeedClient } from "@/lib/resultfeed-client";

import type {
  GetVietlottResultComparisonInput,
  GetVietlottResultComparisonOutput,
  VietlottNumberPositionDiff,
} from "./types";
import { VietlottPeriodSource } from "./types";

const detailUseCases = {
  [GameProduct.Keno]: new KenoDetailUseCase(),
  [GameProduct.Lotto535]: new Lotto535DetailUseCase(),
  [GameProduct.Mega645]: new Mega645DetailUseCase(),
  [GameProduct.Power655]: new Power655DetailUseCase(),
  [GameProduct.Max3d]: new Max3dDetailUseCase(),
  [GameProduct.Max3dpro]: new Max3dproDetailUseCase(),
  [GameProduct.Bingo18]: new Bingo18DetailUseCase(),
};

const currentUseCases = {
  [GameProduct.Keno]: new KenoCurrentUseCase(),
  [GameProduct.Lotto535]: new Lotto535CurrentUseCase(),
  [GameProduct.Mega645]: new Mega645CurrentUseCase(),
  [GameProduct.Power655]: new Power655CurrentUseCase(),
  [GameProduct.Max3d]: new Max3dCurrentUseCase(),
  [GameProduct.Max3dpro]: new Max3dproCurrentUseCase(),
  [GameProduct.Bingo18]: new Bingo18CurrentUseCase(),
};

const suggestionUseCases = {
  [GameProduct.Keno]: new KenoSuggestionUseCase(),
  [GameProduct.Lotto535]: new Lotto535SuggestionUseCase(),
  [GameProduct.Mega645]: new Mega645SuggestionUseCase(),
  [GameProduct.Power655]: new Power655SuggestionUseCase(),
  [GameProduct.Max3d]: new Max3dSuggestionUseCase(),
  [GameProduct.Max3dpro]: new Max3dproSuggestionUseCase(),
  [GameProduct.Bingo18]: new Bingo18SuggestionUseCase(),
};

// `resultFeedClient` là singleton (factory theo `RESULTFEED_CLIENT_MODE`, xem `lib/resultfeed-client.ts`)
// — bind 1 lần lúc khởi tạo module, KHÔNG tạo mới mỗi call, giống 7 route `vietlott-result/route.ts`.
const resultUseCases = {
  [GameProduct.Keno]: new KenoResultUseCase(resultFeedClient),
  [GameProduct.Lotto535]: new Lotto535ResultUseCase(resultFeedClient),
  [GameProduct.Mega645]: new Mega645ResultUseCase(resultFeedClient),
  [GameProduct.Power655]: new Power655ResultUseCase(resultFeedClient),
  [GameProduct.Max3d]: new Max3dResultUseCase(resultFeedClient),
  [GameProduct.Max3dpro]: new Max3dproResultUseCase(resultFeedClient),
  [GameProduct.Bingo18]: new Bingo18ResultUseCase(resultFeedClient),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà 4 map trên chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof detailUseCases {
  if (!(game in detailUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

/**
 * Độ dài kỳ vọng của dàn số flatten theo game — dùng để model biết "thiếu số" so với chuẩn.
 *
 * Đã tìm trong `game-core` (labels, entities, types) và `packages/resultfeed*` — KHÔNG có enum/const
 * dùng chung nào cho "số lượng số kỳ vọng theo game" để import. `GAME_LABELS` (`game-core/labels`) chỉ
 * có tên hiển thị, không có count. `packages/resultfeed/src/rules/intrinsic-check.ts` có đúng các giá
 * trị này (`KENO_NUMBER_COUNT`, `LOTTO535_TOTAL_COUNT`, …) nhưng **tự khai báo cục bộ, không export** —
 * đây là quyết định kiến trúc CÓ CHỦ Ý (xem JSDoc đầu file đó): mỗi lớp verify độc lập tự khai hằng số
 * biên, không import chung với `game-*`, để khi 1 lớp sai luật thì lớp khác không "sai theo" và vẫn bắt
 * được lệch. `EXPECTED_LENGTH` ở đây theo ĐÚNG pattern đó — map cục bộ cho lớp so sánh AI, KHÔNG import
 * từ `intrinsic-check.ts` (nó không export) và KHÔNG nên tạo shared const mới chỉ để dùng ở 2 nơi.
 *
 * Nếu 1 trong 7 game đổi số lượng số kết quả (hiếm, nhưng vd Power655 đổi cấu trúc bonus), phải sửa TAY
 * ở đây — không có compiler nào tự nhắc. Giá trị đối chiếu bảng §3.4 plan
 * `.cursor/plans/resultfeed/10-ai-tool-vietlott-lookup.plan.md` và `intrinsic-check.ts` (cùng giá trị,
 * 2 nơi khai báo độc lập).
 */
const EXPECTED_LENGTH: Record<GameProduct, number> = {
  [GameProduct.Keno]: 20,
  [GameProduct.Bingo18]: 3,
  [GameProduct.Lotto535]: 6,
  [GameProduct.Mega645]: 6,
  [GameProduct.Power655]: 7,
  [GameProduct.Max3d]: 20,
  [GameProduct.Max3dpro]: 20,
};

export class GetVietlottResultComparisonUseCase extends UseCase<
  GetVietlottResultComparisonInput,
  GetVietlottResultComparisonOutput
> {
  protected async execute(input: GetVietlottResultComparisonInput): Promise<GetVietlottResultComparisonOutput> {
    const { game, drawId: inputDrawId } = input;
    assertKnownGame(game);

    const isCurrent = inputDrawId === undefined;

    // Bước 1 — resolve drawId cụ thể khi đang ở đường "kỳ hiện hành". Không có kỳ nào đang mở/sắp
    // mở → trả sớm, không gọi gì thêm (không có gì để tra suggestion/ResultFeed).
    let drawId = inputDrawId;
    if (isCurrent) {
      const { currentDraw } = await currentUseCases[game].run();
      if (!currentDraw) {
        return buildNoActiveDrawOutput(game, isCurrent);
      }
      drawId = currentDraw.drawId;
    }

    // Bước 2 — LUÔN lấy DrawEntity đầy đủ qua detail use-case — nguồn duy nhất có `vietlottRef`/`result`
    // đầy đủ, bất kể input có `drawId` hay không (xem JSDoc đầu file).
    const { draw } = await detailUseCases[game].run({ drawId: drawId as string });

    // Bước 3 — xác định mã kỳ Vietlott: ƯU TIÊN vietlottRef đã publish (nguồn xác nhận), chỉ suy
    // (suggestVietlottPeriod) khi draw CHƯA có ref — tránh gọi suggestion vô ích khi đã biết chắc.
    let drawPeriod: string | null = null;
    let source: VietlottPeriodSource | null = null;
    let unavailableReason: VietlottSuggestionUnavailableReason | null = null;

    if (draw.vietlottRef?.drawPeriod) {
      drawPeriod = draw.vietlottRef.drawPeriod;
      source = VietlottPeriodSource.Ref;
    } else {
      const suggestion = await suggestionUseCases[game].run({ drawId: draw.drawId });
      if (suggestion.suggestedPeriod) {
        drawPeriod = suggestion.suggestedPeriod;
        source = VietlottPeriodSource.Suggested;
      } else {
        unavailableReason = suggestion.reason;
      }
    }

    // Bước 4 — tra ResultFeed CHỈ khi có drawPeriod.
    const feedResult = drawPeriod ? await resultUseCases[game].run({ drawPeriod }) : null;

    // Bước 5 — flatten theo bảng quy ước từng game, rồi so sánh.
    const drawNumbers = flattenDrawResult(game, draw.result);
    const feedNumbers = feedResult?.found ? feedResult.numbers : null;
    const comparison = compareVietlottNumbers(game, drawNumbers, feedNumbers);
    const hasResult = drawNumbers !== null;
    const resultFeedFound = feedResult?.found ?? false;

    return {
      meta: { game, gameLabel: GAME_LABELS[game], fetchedAt: new Date().toISOString(), isCurrent },
      draw: {
        drawId: draw.drawId,
        drawDate: draw.drawDate,
        status: draw.status,
        hasResult,
        numbers: drawNumbers,
        raw: draw,
      },
      vietlott: { drawPeriod, source, unavailableReason },
      resultFeed: {
        queried: drawPeriod !== null,
        found: resultFeedFound,
        numbers: feedNumbers,
        drawDateSource: feedResult?.drawDateSource ?? null,
        publishedAt: feedResult?.publishedAt ?? null,
        verifiedByHuman: feedResult?.verifiedByHuman ?? null,
        sourceCount: feedResult?.sourceCount ?? null,
      },
      comparison,
      guidance: buildResultGuidance({
        draw: { drawId: draw.drawId, hasResult },
        drawPeriod,
        resultFeedQueried: drawPeriod !== null,
        resultFeedFound,
        comparisonIdentical: comparison.identical,
      }),
    };
  }
}

/**
 * Hướng dẫn phrasing cho model — thay `45-vietlott-result.md` (đã xoá, xem `40-tool-policy.md`
 * cho lý do). Build ĐỘNG theo state của response này, chỉ tốn token khi tool THẬT SỰ được gọi —
 * khác instructions file cũ (`system`-role, luôn nằm trong context MỌI lượt dù không liên quan).
 *
 * Nội dung giữ đúng các quy tắc gốc: KHÔNG lộ từ kỹ thuật "draw"/"ResultFeed" ra câu trả lời (gọi
 * "kết quả nội bộ" / "kết quả tham khảo từ Vietlott"), chỉ nói về so sánh khi CẢ 2 nguồn đã có số,
 * và câu mẫu khi chưa có kết quả tham khảo.
 */
function buildResultGuidance(state: {
  draw: { drawId: string; hasResult: boolean } | null;
  drawPeriod: string | null;
  resultFeedQueried: boolean;
  resultFeedFound: boolean;
  comparisonIdentical: boolean | null;
}): string {
  const base =
    "Với user: gọi draw.numbers là 'kết quả nội bộ', resultFeed.numbers là 'kết quả tham khảo từ " +
    "Vietlott'. KHÔNG dùng chữ 'draw'/'ResultFeed' hay thuật ngữ kỹ thuật nào (adapter, consensus, " +
    "cursor...) trong câu trả lời. Mỗi ý chỉ nói 1 lần, không lặp lại 'chưa có' ở nhiều câu.";

  if (state.draw === null) {
    return `${base} Game hiện KHÔNG có kỳ nào đang mở/sắp mở — nói rõ điều đó, không suy diễn thêm.`;
  }

  if (!state.draw.hasResult) {
    return (
      `${base} Kỳ ${state.draw.drawId} chưa có kết quả nội bộ — nói đúng 1 câu, KHÔNG tự giải ` +
      "thích thêm lý do chưa so sánh được (chỉ nhắc so sánh khi cả 2 nguồn đã có số)."
    );
  }

  if (!state.resultFeedQueried) {
    return (
      `${base} Kỳ ${state.draw.drawId} đã có kết quả nội bộ, nhưng KHÔNG xác định được mã kỳ ` +
      "Vietlott để tra kết quả tham khảo — nói rõ chưa xác định được mã kỳ Vietlott, KHÔNG bịa mã " +
      "kỳ, KHÔNG tự đề xuất đổi game config chỉ để có gợi ý (chỉ đổi khi có xác nhận THẬT từ " +
      "Vietlott)."
    );
  }

  if (!state.resultFeedFound) {
    return (
      `${base} Trả đúng câu mẫu: Hiện chưa có kết quả của kỳ "${state.draw.drawId}" - Kỳ Vietlott ` +
      `"${state.drawPeriod}". Đây là BÌNH THƯỜNG với kỳ vừa đóng/gần mép hiện tại (worker cập ` +
      "nhật nền chưa tới lượt), KHÔNG phải lỗi — không cần giải thích gì thêm."
    );
  }

  if (state.comparisonIdentical === true) {
    return (
      `${base} 2 nguồn khớp nhau — xác nhận ngắn, KHÔNG liệt lại từng số (đã hiển thị sẵn qua thẻ ` +
      "kết quả). KHÔNG thêm cụm gây hoang mang kiểu 'chưa xác minh' — verifiedByHuman=false không " +
      "có nghĩa kết quả không đáng tin."
    );
  }

  return (
    `${base} 2 nguồn KHÁC NHAU — nêu cả hai và điểm khác biệt theo vị trí (comparison.detail.` +
    "positionsDiffer) NGẮN GỌN. Nếu độ dài lệch (drawLength ≠ resultFeedLength so expectedLength), " +
    "nói rõ bên nào đang THIẾU số so với chuẩn."
  );
}

/**
 * Dàn số kết quả của draw về CÙNG shape flat `string[]` với `resultFeed.numbers`, theo đúng thứ tự
 * quay từng game (khớp hợp đồng mà `publish-result-action.tsx` mỗi game đang dùng để map ngược).
 * `undefined` (draw chưa publish kết quả) → `null`.
 *
 * ⚠️ Đã verify thứ tự flatten + zero-padding khớp với `resultFeed.numbers` bằng cách đọc trực tiếp
 * parser nguồn (`resultfeed-application/src/sources/vietlott/vietlott-detail/parse-*.ts`) và
 * `ConsensusDoc.numbers` JSDoc (`resultfeed/src/entities/consensus.ts`) — KHÔNG giả định:
 * - Keno/Mega645: flat, zero-pad "01"-"80"/"01"-"45", giữ đúng thứ tự quay (không sort).
 * - Bingo18: `numbersDisplay` giữ đúng thứ tự DOM, KHÔNG zero-pad (số nguyên 1-6) — cả 2 phía
 *   (`draw.result.numbers` và `resultFeed`) đều dùng số nguyên không pad → `.map(String)` khớp.
 * - Lotto535/Power655: main (sort trong `canonicalizeNumbers`, nhưng `numbersDisplay`/`consensus`
 *   giữ NGUYÊN thứ tự nguồn) + đặc biệt/bonus LUÔN ở index cuối — khớp `[...main, special/bonus]`.
 * - Max3d/Max3dpro: 20 triplet 3-chữ-số zero-pad, thứ tự CỐ ĐỊNH Đặc biệt(2)→Nhất(4)→Nhì(6)→Ba(8)
 *   — khớp `[...special, ...first, ...second, ...third]` (offset đúng `MAX3D_TIER_COUNTS`).
 */
function flattenDrawResult(
  game: GameProduct,
  result:
    | WireType<KenoDrawResult>
    | WireType<Bingo18DrawResult>
    | WireType<Lotto535DrawResult>
    | WireType<Mega645DrawResult>
    | WireType<Power655DrawResult>
    | WireType<Max3dDrawResult>
    | WireType<Max3dproDrawResult>
    | undefined,
): string[] | null {
  if (!result) {
    return null;
  }

  switch (game) {
    case GameProduct.Keno: {
      const r = result as WireType<KenoDrawResult>;
      return [...r.winningNumbers];
    }
    case GameProduct.Bingo18: {
      // Bingo18 lưu số nguyên 1-6 (KHÔNG zero-pad) — khác 6 game còn lại.
      const r = result as WireType<Bingo18DrawResult>;
      return r.numbers.map(String);
    }
    case GameProduct.Lotto535: {
      const r = result as WireType<Lotto535DrawResult>;
      return [...r.winningMain, r.winningSpecial];
    }
    case GameProduct.Mega645: {
      const r = result as WireType<Mega645DrawResult>;
      return [...r.winningNumbers];
    }
    case GameProduct.Power655: {
      const r = result as WireType<Power655DrawResult>;
      return [...r.winningMain, r.bonusNumber];
    }
    case GameProduct.Max3d: {
      const r = result as WireType<Max3dDrawResult>;
      return [...r.special, ...r.first, ...r.second, ...r.third];
    }
    case GameProduct.Max3dpro: {
      const r = result as WireType<Max3dproDrawResult>;
      return [...r.special, ...r.first, ...r.second, ...r.third];
    }
    default: {
      const _exhaustive: never = game;
      throw AppException.internal(`Game không được hỗ trợ: ${String(_exhaustive)}`);
    }
  }
}

/**
 * So sánh 2 dàn số đã flatten theo VỊ TRÍ (không phải theo Set) — thứ tự quay có ý nghĩa hiển thị,
 * lệch vị trí (dù cùng tập số) vẫn phải báo là khác nhau.
 */
function compareVietlottNumbers(
  game: GameProduct,
  draw: string[] | null,
  resultFeed: string[] | null,
): GetVietlottResultComparisonOutput["comparison"] {
  if (draw === null || resultFeed === null) {
    return { identical: null, detail: null };
  }

  const positionsDiffer: VietlottNumberPositionDiff[] = [];
  const maxLen = Math.max(draw.length, resultFeed.length);
  for (let i = 0; i < maxLen; i++) {
    const a = draw[i] ?? null;
    const b = resultFeed[i] ?? null;
    if (a !== b) {
      positionsDiffer.push({ index: i, draw: a, resultFeed: b });
    }
  }

  if (positionsDiffer.length === 0) {
    return { identical: true, detail: null };
  }

  return {
    identical: false,
    detail: {
      expectedLength: EXPECTED_LENGTH[game],
      drawLength: draw.length,
      resultFeedLength: resultFeed.length,
      positionsDiffer,
    },
  };
}

/**
 * Case biên: `isCurrent=true` nhưng game hiện KHÔNG có kỳ nào đang mở/sắp mở (VD ngoài giờ hoạt
 * động, hoặc lỗi vận hành chưa tạo kỳ kế tiếp). Trả sớm, KHÔNG gọi suggestion/ResultFeed — không có
 * `drawId` nào để tra.
 */
function buildNoActiveDrawOutput(game: GameProduct, isCurrent: boolean): GetVietlottResultComparisonOutput {
  return {
    meta: { game, gameLabel: GAME_LABELS[game], fetchedAt: new Date().toISOString(), isCurrent },
    draw: null,
    vietlott: { drawPeriod: null, source: null, unavailableReason: null },
    resultFeed: {
      queried: false,
      found: false,
      numbers: null,
      drawDateSource: null,
      publishedAt: null,
      verifiedByHuman: null,
      sourceCount: null,
    },
    comparison: { identical: null, detail: null },
    guidance: buildResultGuidance({
      draw: null,
      drawPeriod: null,
      resultFeedQueried: false,
      resultFeedFound: false,
      comparisonIdentical: null,
    }),
  };
}
