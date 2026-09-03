/**
 * ResultFeed – Observation (structured, parsed result per source × game × period)
 *
 * Collection: `observations`
 *
 * 1 document = 1 nguồn × 1 game × 1 kỳ × 1 `parserVersion`. Tầng này tồn tại để truy vấn
 * "kỳ này các nguồn nói gì" là MỘT query có index, không phải quét raw HTML.
 *
 * `drawPeriod` là mã kỳ THEO NGUỒN — KHÔNG phải `drawId` của MegaWin. Map sang `drawId`
 * là việc của core khi PULL, `resultfeed` không được biết quy ước `drawId` MegaWin.
 *
 * Ba field BẮT BUỘC — mọi thứ còn lại chỉ là hỗ trợ, có thể vắng mặt: `drawPeriod`,
 * `drawDateSource`, `numbersDisplay`. `claimedChecksums` cố ý là record generic vì mỗi
 * game/nguồn công bố checksum khác nhau — thêm site/game mới có checksum lạ ⇒ thêm key
 * vào record đang có, KHÔNG sửa schema.
 */

import type { IntrinsicState, ResultFeedGameKey, ResultFeedSourceId } from "./enums";

export interface ObservationDoc {
  _id: unknown;

  sourceId: ResultFeedSourceId;
  gameKey: ResultFeedGameKey;

  /** Mã kỳ THEO NGUỒN, chuẩn hoá zero-pad. VD `"0293945"`. KHÔNG phải drawId MegaWin. */
  drawPeriod: string;

  /** Ngày quay nguồn công bố, `YYYY-MM-DD`. */
  drawDateSource: string;

  /** Giờ quay nguồn công bố (ISO 8601) nếu có — dùng cross-check suy kỳ. */
  drawTimeSource: string | null;

  /** Số ĐÚNG THỨ TỰ nguồn công bố. Bingo18: `["5","2","5"]`. */
  numbersDisplay: string[];

  /** Số đã canonical (sort multiset) — chỉ để so chéo nguồn. */
  numbersCanonical: string[];

  displayHash: string;
  payoutHash: string;

  /**
   * Checksum do CHÍNH nguồn công bố (không phải ta tính). Keno: chẵn/lẻ/lớn/nhỏ.
   * Bingo18: tổng + phân loại Lớn/Hòa/Nhỏ. Nguồn không công bố ⇒ record rỗng `{}`.
   */
  claimedChecksums: Record<string, string | number>;

  /** Kết quả đối chiếu `claimedChecksums` với `numbersDisplay` do TA tự tính lại. */
  intrinsicState: IntrinsicState;

  /** Checksum nào lệch — text cho vận hành. */
  intrinsicMismatch: string | null;

  parserVersion: string;

  /** Trỏ về bằng chứng thô. Bắt buộc — không có submission thì observation vô giá trị. */
  submissionId: string;

  createdAt: Date;

  /**
   * Cập nhật MỖI LẦN `upsertObservation` chạy (kể cả khi nội dung không đổi — parse lại
   * cùng `parserVersion`) — dùng làm CURSOR cho `ConsensusTickUseCase` (`findChangedSince`),
   * KHÔNG dùng để hiển thị "lần sửa cuối" cho vận hành (đó là việc của `createdAt` cho bản
   * ghi mới + `submissionId` để trace về bằng chứng cụ thể).
   */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface ObservationEntity extends Omit<ObservationDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
