/**
 * ResultFeed – Source Cursor (fetch schedule state)
 *
 * Collection: `source_cursors`
 *
 * 1 document = 1 nguồn × 1 game. Nơi hiện thực "dự đoán kỳ kế tiếp" để worker biết
 * fetch cái gì tiếp theo mà không cần quét trang list mỗi lần.
 */

import type { ResultFeedGameKey, ResultFeedSourceId } from "./enums";

export interface SourceCursorDoc {
  _id: unknown;

  sourceId: ResultFeedSourceId;
  gameKey: ResultFeedGameKey;

  /** Kỳ gần nhất đã có observation hợp lệ. Neo để suy kỳ kế tiếp. */
  lastConfirmedPeriod: string | null;

  /** Kỳ dự đoán sẽ fetch lần tới = lastConfirmedPeriod + 1. */
  nextExpectedPeriod: string | null;

  /** Không fetch trước mốc này (tôn trọng `minIntervalMs` + backoff). */
  nextFetchAt: Date;

  /** Số lần thất bại liên tiếp — cơ sở backoff luỹ tiến + alert. */
  consecutiveFailures: number;

  /**
   * Cờ CHỦ ĐỘNG do worker set khi có SỰ CỐ THẬT khiến ít nhất 1 kỳ có thể chưa được xác nhận
   * đúng lịch — KHÔNG suy luận từ so sánh thời gian (`now - nextFetchAt`), vì suy luận theo
   * thời gian phụ thuộc đồng hồ máy chủ, `minIntervalMs` cấu hình đúng/sai, và không phân biệt
   * được "chỉ vừa trễ 1 tick do cold start" với "outage thật kéo dài".
   *
   * Set `true` bởi `recordFailure` (MỌI loại thất bại: fetch_failed/parse_failed/awaiting_seed
   * — cold start chưa từng seed kỳ khởi điểm) — bản thân 1 lần thất bại đã là bằng chứng CÓ sự
   * cố, không cần chờ đếm hay đo thời gian. `period_gap` KHÔNG còn set cờ này — lệch kỳ giờ tự
   * heal ngay qua `recordSuccess` (coi kỳ thực tế là anchor mới), không phải sự cố cần backoff.
   * Set `false` bởi `recordUnavailable` (đã đuổi tới mép dữ liệu thật — probe
   * kỳ kế tiếp thấy "chưa có kết quả" nghĩa là không còn kỳ nào để lấy thêm) hoặc `seedAnchor`
   * (ops reset khởi động sạch). `recordSuccess` KHÔNG đụng cờ này — 1 tick fetch thành công
   * giữa chuỗi backlog không có nghĩa đã hết backlog, tick kế tiếp trong CÙNG invocation mới
   * là nơi xác nhận (qua `result_unavailable`).
   *
   * Dùng ở `FetchAndParseUseCase.beforeLoop` để quyết định `burstEnabled` — chỉ cho vòng lặp
   * chạy nhiều tick trong 1 invocation khi cờ này đang `true`.
   */
  needsBackfill: boolean;

  /**
   * Số lần `checkIntrinsic` liên tiếp trả về {@link IntrinsicState.Failed} cho nguồn/game này —
   * đo lường rủi ro "site đổi cấu trúc HTML khiến parser đọc SAI nội dung nhưng KHÔNG throw lỗi"
   * (silent, không bị `ParseError` bắt vì `adapter.parse()` không throw gì — vẫn ra đúng HÌNH
   * DẠNG dữ liệu, chỉ sai NỘI DUNG số). Loại lỗi này không bị `needsBackfill`/backoff chặn vì
   * outcome của tick vẫn là `"ok"`.
   *
   * Tăng 1 mỗi lần `Failed`, reset về 0 khi `Passed`/`NotAvailable` — 1 lần lệch đơn lẻ CÓ THỂ
   * là do NGUỒN nhập liệu sai thật (hiếm nhưng xảy ra), không nên dừng oan; liên tiếp NHIỀU lần
   * mới là bằng chứng đủ mạnh của lỗi HỆ THỐNG (parser đọc sai), xem `isPaused`.
   */
  consecutiveIntrinsicFailures: number;

  /**
   * `true` khi `consecutiveIntrinsicFailures` vượt ngưỡng (`INTRINSIC_FAILURE_PAUSE_THRESHOLD`
   * ở `fetch-and-parse.ts`) — TỰ ĐỘNG dừng fetch nguồn này (0 request thêm tới provider, thoát
   * sớm giống nhánh `awaiting_seed`) cho tới khi vận hành xác nhận (đối chiếu vài kỳ gần nhất
   * với site gốc bằng tay, hoặc đã deploy fix parser) và gọi API resume. Đây là lưới chặn RIÊNG
   * cho lỗi "parse thành công nhưng SỐ SAI" — loại lỗi mà cờ `needsBackfill` không bắt được vì
   * không có gì throw để `recordFailure` nhận biết.
   *
   * KHÔNG tự tắt khi có 1 lần `Passed` xen giữa — phải qua đường vận hành thủ công (giống
   * `seedAnchor`), vì máy không đủ tin cậy để tự kết luận "đã hết lỗi" từ đúng 1 quan sát.
   */
  isPaused: boolean;

  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface SourceCursorEntity extends Omit<SourceCursorDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
