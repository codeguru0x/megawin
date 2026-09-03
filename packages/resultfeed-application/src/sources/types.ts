/**
 * ResultFeed – Source Adapter Types
 *
 * `02-fetch-parse.plan.md §2`. Hợp đồng cho MỘT website nguồn: dựng URL kế tiếp,
 * parse bytes → dữ liệu kỳ. Adapter site A KHÔNG được import gì từ adapter site B —
 * registry (`./registry.ts`) là nơi DUY NHẤT gom lại.
 *
 * `parse` PHẢI là hàm pure: cùng input → cùng output, không I/O, không `Date.now()`,
 * không `process.env`. Đó là điều kiện để test bằng fixture HTML đã commit.
 */

import type { ResultFeedGameKey, ResultFeedSourceId, SourceCursorEntity } from "@megawin/resultfeed/entities";
import { z } from "zod";

/** Việc adapter phải làm khi tới lượt fetch. */
export interface FetchPlan {
  /** URL sẽ gọi. */
  url: string;
  /** Kỳ mà request này KỲ VỌNG nhận được — để phát hiện lệch (period_gap self-heal). */
  expectedPeriod: string | null;
  render: boolean;
}

/** Output của parser — chưa có hash, chưa kiểm checksum (tầng trên lo). */
export interface ParsedObservation {
  drawPeriod: string;
  drawDateSource: string;
  drawTimeSource: string | null;
  /** ĐÚNG thứ tự nguồn công bố. Parser TUYỆT ĐỐI không sort. */
  numbersDisplay: string[];
  /** Checksum nguồn TỰ công bố, đọc nguyên văn. Không tự tính ở đây. */
  claimedChecksums: Record<string, string | number>;
}

/**
 * Validate HÌNH THỨC (không phải nghiệp vụ — biên số hợp lệ theo game là việc của
 * `checkIntrinsic`, `@megawin/resultfeed/rules`) của output `adapter.parse()` TRƯỚC khi
 * ghi DB. Đây là lớp phòng thủ cuối — parser đọc lệch cột/lệch selector do site đổi HTML
 * có thể trả ra chuỗi rỗng hoặc rác thay vì throw `ParseError`; validate ở đây bắt được
 * NGAY, không để observation rác lọt vào DB.
 *
 * Gọi 1 LẦN duy nhất, tại tầng orchestration (`fetch-and-parse.ts`, ngay sau
 * `adapter.parse()`) — KHÔNG lặp lại validate này trong từng adapter (DRY, mọi site đi
 * qua CÙNG 1 cổng kiểm).
 */
export const parsedObservationSchema = z.object({
  /** Mã kỳ THEO NGUỒN — chuỗi chỉ gồm chữ số, không rỗng (zero-pad width do từng nguồn quy định). */
  drawPeriod: z.string().regex(/^\d+$/, "drawPeriod phải là chuỗi chỉ gồm chữ số."),
  /** `YYYY-MM-DD` — đã convert từ format nguồn (VD DD/MM/YYYY của Vietlott) sang ISO. */
  drawDateSource: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "drawDateSource phải đúng format ISO YYYY-MM-DD."),
  drawTimeSource: z.string().nullable(),
  /** Không rỗng — parser đọc được 0 số nghĩa là selector đã sai, không phải kết quả hợp lệ. */
  numbersDisplay: z.array(z.string()).min(1, "numbersDisplay không được rỗng."),
  claimedChecksums: z.record(z.string(), z.union([z.string(), z.number()])),
});

/**
 * Ném khi `parse` không đọc được dữ liệu từ `body` — HTML đổi cấu trúc, thiếu bảng kết
 * quả, hoặc `body` không phải trang mà adapter này biết đọc (vd trang lỗi/redirect).
 */
export class ParseError extends Error {
  readonly sourceId: ResultFeedSourceId;
  readonly gameKey: ResultFeedGameKey;

  constructor(message: string, sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey) {
    super(message);
    this.name = "ParseError";
    this.sourceId = sourceId;
    this.gameKey = gameKey;
  }
}

/**
 * Ném khi adapter nhận diện (best-effort) trang trả về là "kỳ này chưa có kết quả" —
 * KHÔNG phải lỗi cấu trúc HTML. Đây là trạng thái BÌNH THƯỜNG, xảy ra liên tục mỗi khi
 * worker fetch tới sát mép dữ liệu thật (live edge) hoặc trong khi backfill đuổi ngược
 * lên tới hiện tại — khác hẳn `ParseError` (bằng chứng site đổi cấu trúc/lỗi thật, cần
 * người sửa parser).
 *
 * ⚠️ NHẬN DIỆN BEST-EFFORT, KHÔNG PHẢI HỢP ĐỒNG: dựa vào text nguồn tự công bố (VD
 * "Không tìm thấy kết quả"), site có thể đổi chữ bất kỳ lúc nào mà không báo trước.
 * Nơi ném lỗi này (`findResultRow`) LUÔN có fallback an toàn: nhận diện KHÔNG khớp ⇒
 * ném `ParseError` như cũ (Critical alert + backoff) — không có nguy cơ "im lặng bỏ
 * qua" khi site đổi chữ, chỉ mất đi lợi ích dừng sớm vòng lặp tick.
 */
export class ResultUnavailableError extends Error {
  readonly sourceId: ResultFeedSourceId;
  readonly gameKey: ResultFeedGameKey;

  constructor(message: string, sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey) {
    super(message);
    this.name = "ResultUnavailableError";
    this.sourceId = sourceId;
    this.gameKey = gameKey;
  }
}

/**
 * Hợp đồng cho 1 website nguồn.
 *
 * `parse` PHẢI là hàm pure: cùng input → cùng output, không I/O, không `Date.now()`.
 * Đó là điều kiện để test bằng fixture HTML đã commit.
 */
export interface SourceAdapter {
  readonly sourceId: ResultFeedSourceId;
  readonly parserVersion: string;
  readonly gameKeys: readonly ResultFeedGameKey[];

  /**
   * Dựng request kế tiếp từ cursor (đã qua mapper — application entity, không phải Mongo doc).
   *
   * Caller (`fetch-and-parse.ts`) PHẢI đảm bảo `cursor.lastConfirmedPeriod !== null` trước khi
   * gọi — cursor cold start (chưa từng seed) không đi qua đây, xem outcome `awaiting_seed`.
   */
  planNextFetch(input: { gameKey: ResultFeedGameKey; cursor: SourceCursorEntity }): FetchPlan;

  /** Đọc bytes → dữ liệu kỳ. Throw {@link ParseError} khi không đọc được. */
  parse(input: { gameKey: ResultFeedGameKey; body: Buffer; contentType: string }): ParsedObservation;

  /**
   * Optional: chuẩn hoá `body` TRƯỚC KHI tính `contentHash` (`fetch-and-parse.ts`, bước 4) —
   * KHÔNG ảnh hưởng bytes LƯU (`SubmissionDoc.bodyGz` luôn nguyên văn `fetchResult.body`, xem
   * quy tắc "không normalize trước khi lưu" ở `@megawin/resultfeed/entities` → `submission.ts`).
   *
   * Dùng khi site trả về nhiễu KHÁC NHAU ở MỌI lần render (session token, state mã hoá,
   * timestamp debug) dù nội dung thực chất giống nhau — nếu hash trên bytes nguyên văn,
   * `contentHash` không bao giờ trùng ⇒ vô hiệu hoá dedup `{sourceId, contentHash}` VÀ tín
   * hiệu "site trả cùng 1 trang lỗi liên tục" (`seenCount`). KHÔNG bắt buộc — adapter không
   * implement thì `fetch-and-parse.ts` hash thẳng trên `body` gốc (hành vi cũ).
   */
  normalizeForHash?(body: Buffer): Buffer;
}
