/**
 * `getDrawDetail` / `listDraws` — types dispatcher gộp 7 game (p1-03 §2.2/§2.3).
 *
 * KHÔNG gắn nhãn `ConfigItem` — DTO draw là dữ liệu SỰ KIỆN (trạng thái kỳ, doanh thu, kết quả),
 * field tự giải thích được qua tên; chỉ số CẤU HÌNH (`getGameConfig`/`getTenantGameConfig`) mới
 * cần nhãn `label`/`unit`. `draw`/`draws` giữ nguyên RAW DTO của package game tương ứng — mỗi game
 * có field hơi khác nhau (jackpot chỉ có ở 3 game), ép về 1 shape chung sẽ mất field hoặc phải
 * optional hoá toàn bộ, không đáng so với lợi ích.
 */

import type { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import type { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";

/** `meta` chung cho cả `getDrawDetail` và `listDraws` — model biết đang xem game nào, lúc nào. */
export interface DrawDispatchMeta {
  game: GameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  /** Thời điểm tool đọc — giờ VN `yyyy-MM-dd HH:mm:ss` sau biên `toToolResult`. */
  fetchedAt: string;
}

export interface GetDrawSnapshotInput {
  game: GameProduct;
  /** Bỏ trống → trả kỳ hiện hành (đang mở/sắp mở gần nhất) thay vì 1 kỳ cụ thể. */
  drawId?: string;
}

export interface GetDrawSnapshotOutput {
  meta: DrawDispatchMeta & {
    /** `true` khi không truyền `drawId` — `draw` là kết quả của `GetCurrentDrawUseCase`. */
    isCurrent: boolean;
  };
  /**
   * RAW DTO — `GetDrawDetailOutput` (có `drawId`) hoặc `GetCurrentDrawOutput` (không có) của
   * đúng package `game-{game}-application`, KHÔNG map lại field.
   */
  draw: unknown;
}

export interface ListDrawsDispatchInput {
  game: GameProduct;
  status?: DrawStatus;
  /** YYYY-MM-DD, inclusive. */
  fromDate?: string;
  /** YYYY-MM-DD, inclusive. */
  toDate?: string;
  /** 1-based, mặc định 1. */
  page?: number;
  /** Mặc định 10, tối đa 30 (siết ở tool — trần thấp hơn route web). */
  size?: number;
}

export interface ListDrawsDispatchOutput {
  meta: DrawDispatchMeta;
  /** RAW `ListDrawsOutput` của package game tương ứng — `{ draws, nextCursor?/page?, size }`. */
  result: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// getVietlottResult — đối chiếu kết quả draw ↔ ResultFeed (Vietlott) theo mã kỳ
// ─────────────────────────────────────────────────────────────────────────────

export interface GetVietlottResultComparisonInput {
  game: GameProduct;
  /** Bỏ trống → kỳ hiện hành (đang mở/sắp mở gần nhất), giống `GetDrawSnapshotInput`. */
  drawId?: string;
}

/** Nguồn của `vietlott.drawPeriod` — quyết định độ tin cậy khi phrase câu trả lời. */
export const VietlottPeriodSource = {
  /** Lấy từ `draw.vietlottRef.drawPeriod` — staff đã publish kèm mã kỳ Vietlott xác nhận. */
  Ref: "ref",
  /** Suy từ dữ liệu Vietlott tham chiếu + lịch quay qua `suggestVietlottPeriod` — CHƯA xác nhận, chỉ là gợi ý. */
  Suggested: "suggested",
} as const;
export type VietlottPeriodSource = (typeof VietlottPeriodSource)[keyof typeof VietlottPeriodSource];

/** 1 vị trí (0-based, theo thứ tự flatten) có giá trị khác nhau giữa draw và ResultFeed, hoặc thiếu 1 bên. */
export interface VietlottNumberPositionDiff {
  index: number;
  draw: string | null;
  resultFeed: string | null;
}

export interface GetVietlottResultComparisonOutput {
  meta: DrawDispatchMeta & { isCurrent: boolean };

  /** `null` CHỈ khi `isCurrent=true` và game hiện KHÔNG có kỳ nào đang mở/sắp mở (case biên). */
  draw: {
    drawId: string;
    drawDate: string;
    status: string;
    hasResult: boolean;
    /**
     * Dàn số kết quả của DRAW, đã flatten theo đúng thứ tự quy ước từng game (`flattenDrawResult`)
     * — CÙNG shape với `resultFeed.numbers` để model/so sánh không cần biết field gốc mỗi game.
     * `null` khi draw chưa publish kết quả.
     */
    numbers: string[] | null;
    /** RAW draw entity đầy đủ (WireType<DrawEntity>) — model cần chi tiết khác (bigCount, tiers...) đọc ở đây. */
    raw: unknown;
  } | null;

  vietlott: {
    /** Mã kỳ Vietlott dùng để tra ResultFeed. `null` nếu không có `vietlottRef` VÀ không suy được. */
    drawPeriod: string | null;
    source: VietlottPeriodSource | null;
    /** Lý do không suy được mã kỳ — chỉ có giá trị khi `source === null`. */
    unavailableReason: VietlottSuggestionUnavailableReason | null;
  };

  resultFeed: {
    /** `false` khi `vietlott.drawPeriod === null` — không có gì để tra, KHÔNG gọi ResultFeed. */
    queried: boolean;
    found: boolean;
    /** Dàn số ResultFeed, CÙNG thứ tự flatten với `draw.numbers`. `null` khi `found=false`. */
    numbers: string[] | null;
    drawDateSource: string | null;
    publishedAt: string | null;
    verifiedByHuman: boolean | null;
    sourceCount: number | null;
  };

  comparison: {
    /**
     * `true` = cả 2 nguồn có `numbers` VÀ giống nhau hoàn toàn (cùng độ dài, cùng thứ tự).
     * `false` = cả 2 có nhưng khác nhau (lệch giá trị hoặc lệch độ dài — xem `detail`).
     * `null` = KHÔNG đủ 2 nguồn để so sánh (một trong hai — hoặc cả hai — chưa có `numbers`).
     */
    identical: boolean | null;
    /** Chỉ điền khi `identical === false`. */
    detail: {
      /** Độ dài kỳ vọng theo game (20 cho Keno/Max3d/Max3dpro, 6 cho Mega645, 7 cho Power655...). */
      expectedLength: number;
      drawLength: number;
      resultFeedLength: number;
      positionsDiffer: VietlottNumberPositionDiff[];
    } | null;
  };

  /**
   * Hướng dẫn diễn giải/phrasing cho MODEL — build động theo state của response này (thay
   * `45-vietlott-result.md`, đã xoá — xem `40-tool-policy.md`). KHÔNG phải câu trả lời cho user,
   * chỉ là chỉ dẫn nội bộ model đọc rồi tự diễn đạt lại bằng lời tự nhiên.
   */
  guidance: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// getVietlottSuggestion — gợi ý mã kỳ Vietlott, CHƯA xác nhận (cho 1 kỳ MegaWin có sẵn HOẶC
// 1 thời điểm quay tuỳ ý chưa gắn kỳ nào)
// ─────────────────────────────────────────────────────────────────────────────

/** Nguồn thời điểm dùng để suy mã kỳ — quyết định field nào trong output được điền. */
export const VietlottSuggestionMode = {
  /** Suy từ 1 kỳ MegaWin đã tồn tại (`drawId`) — dùng thẳng `GetVietlottSuggestionUseCase` của game. */
  Draw: "draw",
  /** Suy từ 1 thời điểm tuỳ ý (`drawDate` + `drawTime`) CHƯA gắn với kỳ MegaWin nào. */
  Time: "time",
} as const;
export type VietlottSuggestionMode = (typeof VietlottSuggestionMode)[keyof typeof VietlottSuggestionMode];

export interface GetVietlottSuggestionDispatchInput {
  game: GameProduct;
  /** Mã kỳ MegaWin đã tồn tại — ưu tiên nếu có, bỏ qua `drawDate`/`drawTime` khi truyền kèm. */
  drawId?: string;
  /** Ngày quay tuỳ ý "YYYY-MM-DD" — CHỈ dùng khi không truyền `drawId`. */
  drawDate?: string;
  /** Giờ quay tuỳ ý "HH:mm" (giờ VN) — CHỈ dùng khi không truyền `drawId`. */
  drawTime?: string;
}

export interface GetVietlottSuggestionDispatchOutput {
  meta: DrawDispatchMeta & { mode: VietlottSuggestionMode };

  /** Chỉ điền khi `meta.mode === "draw"`. */
  draw: { drawId: string; drawDate: string } | null;
  /** Chỉ điền khi `meta.mode === "time"` — thời điểm tuỳ ý được hỏi (đã chuẩn hoá "HH:mm"). */
  target: { drawDate: string; drawTime: string } | null;

  suggestion: {
    /** Mã kỳ Vietlott suy được, giữ zero-pad. `null` nếu không suy được — xem `reason`. */
    suggestedPeriod: string | null;
    /** Lý do không suy được — `null` khi `suggestedPeriod` có giá trị. */
    reason: VietlottSuggestionUnavailableReason | null;
  };

  /**
   * Hướng dẫn diễn giải/phrasing cho MODEL — build động theo `suggestion.reason`/mode (xem
   * `40-tool-policy.md`). Luôn nhắc: đây là gợi ý CHƯA XÁC NHẬN, và KHÔNG khuyến khích sửa
   * game config chỉ để công thức chạy được, trừ khi có xác nhận THẬT từ Vietlott.
   */
  guidance: string;
}
