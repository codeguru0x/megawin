/**
 * Game Core – Vietlott Result Client Interface
 *
 * Interface chung để các `game-*-application` lấy kết quả Vietlott đã được ResultFeed
 * xác thực (consensus) — KHÔNG import bất kỳ package `@megawin/resultfeed*` (domain
 * boundary D7, xem `.cursor/plans/resultfeed/00-overview.md` §6). `gameKey` khai string
 * thuần (không import `ResultFeedGameKey`) để giữ boundary — mỗi game tự truyền literal
 * khớp giá trị `ResultFeedGameKey` tương ứng phía backoffice.
 *
 * Implementation (HTTP qua `apps/api-resultfeed` hoặc gọi trực tiếp use-case cùng tiến
 * trình) sống ở `apps/backoffice/src/lib/` — chọn theo `RESULTFEED_CLIENT_MODE`. Mỗi
 * `game-*-application` chỉ biết interface này, không biết implementation đang chạy.
 *
 * Thiết kế đầy đủ: `.cursor/plans/resultfeed/08-vietlott-result-autofill.plan.md` §5.
 */

/** Tham số tra cứu 1 kỳ kết quả Vietlott đã publish. */
export interface VietlottResultLookup {
  /** Literal string khớp giá trị `ResultFeedGameKey` (VD `"keno"`, `"lotto535"`). */
  gameKey: string;
  /** Mã kỳ Vietlott — khớp `vietlottRef.drawPeriod` của game đang tra cứu. */
  drawPeriod: string;
}

/** Kết quả 1 kỳ Vietlott đã publish — trả về từ `VietlottResultClient.getResult`. */
export interface VietlottResultRecord {
  /** Dàn số trúng thưởng, dạng flat — mapping sang field form từng game do caller tự làm. */
  numbers: string[];
  /** Ngày quay theo nguồn Vietlott, format `"YYYY-MM-DD"`. */
  drawDateSource: string;
  /** Thời điểm ResultFeed publish kết quả này, ISO 8601. */
  publishedAt: string;
  /** `true` khi 1 người đã xác nhận kết quả. `false` = máy tự chốt theo consensus nguồn. */
  verifiedByHuman: boolean;
  /** Số nguồn đã đồng ý với kết quả này — dùng hiện độ tin cậy khi `verifiedByHuman === false`. */
  sourceCount: number;
}

/**
 * Client tra cứu kết quả Vietlott đã publish, dùng bởi `GetVietlottResultUseCase` của cả
 * 7 game. Trả `null` khi ResultFeed chưa có kết quả cho kỳ đó (chưa quay / chưa đạt
 * consensus / nguồn chưa hỗ trợ fetch sống) — không phải lỗi, caller tự hiện cảnh báo.
 */
export interface VietlottResultClient {
  getResult(lookup: VietlottResultLookup): Promise<VietlottResultRecord | null>;
}
