/**
 * ResultFeed – Consensus (final result per game × period)
 *
 * Collection: `consensus`
 *
 * 1 document = 1 game × 1 kỳ. Đây là bản ghi mà core PULL để lấy kết quả công bố.
 */

import type {
  ConflictPolicy,
  ConsensusState,
  DecidedBy,
  ResultFeedGameKey,
  ResultFeedSourceId,
  SourceRole,
} from "./enums";

/** 1 observation đồng ý (hoặc lệch) với kết quả — snapshot role/trustWeight lúc quyết định. */
export interface ConsensusAgreement {
  sourceId: ResultFeedSourceId;
  observationId: string;
  role: SourceRole;
  trustWeight: number;
}

/** Thông tin người verify — CHỈ ghi bởi use-case của người, máy KHÔNG BAO GIỜ chạm vào. */
export interface ConsensusHumanVerify {
  /** Ai verify. */
  accountId: string;
  username: string;
  verifiedAt: Date;
  /** Bắt buộc khi ghi đè kết quả máy — vì sao người chọn khác máy. */
  note: string | null;
  /** Observation người chọn làm chuẩn. Null nếu người tự nhập tay. */
  chosenObservationId: string | null;
}

export interface ConsensusDoc {
  _id: unknown;

  gameKey: ResultFeedGameKey;
  drawPeriod: string;
  drawDateSource: string;

  state: ConsensusState;

  /**
   * Số công bố — ĐÚNG THỨ TỰ nguồn authoritative công bố (KHÔNG sort lại, KHÔNG dùng dạng
   * canonical). Null khi `pending`/`conflict`/`rejected`.
   *
   * Số lượng phần tử + cách cắt lát theo `gameKey` — bảng dưới là NGUỒN CHÂN LÝ cho mọi nơi
   * đọc field này để tách số ra field cụ thể (VD form nhập kết quả backoffice):
   *
   * | gameKey | Số phần tử | Cắt lát |
   * |---|---|---|
   * | `keno` | 20 | Dùng nguyên, không cắt. |
   * | `bingo18` | 3 | Dùng nguyên, GIỮ ĐÚNG thứ tự quay (không sort — 3 xúc xắc có thể trùng giá trị). |
   * | `lotto535` | 6 | `slice(0,5)` = 5 số chính, `[5]` = 1 số đặc biệt (LUÔN ở cuối). |
   * | `mega645` | 6 | Dùng nguyên, không cắt. |
   * | `power655` | 7 | `slice(0,6)` = 6 số chính, `[6]` = 1 số bonus (LUÔN ở cuối). |
   * | `max3d`/`max3dpro` | 20 | 4 hạng giải nối tiếp, mỗi phần tử là 1 số 3-chữ-số zero-pad
   * (VD `"015"`, KHÔNG phải 3 chữ số rời): `slice(0,2)` = Đặc biệt, `slice(2,6)` = Nhất,
   * `slice(6,12)` = Nhì, `slice(12,20)` = Ba. Offset khớp `MAX3D_TIER_COUNTS` ở
   * `@megawin/resultfeed/rules` (`canonicalize.ts`) — đổi offset PHẢI đổi cả 2 nơi.
   *
   * Việc cắt lát này làm ở TẦNG ĐỌC (VD frontend backoffice khi map vào field form cụ thể
   * từng game) — KHÔNG cắt sẵn ở đây, để giữ 1 field generic dùng chung 7 game (xem
   * `08-vietlott-result-autofill.plan.md §8` cho bảng mapping đầy đủ sang field form).
   */
  numbers: string[] | null;

  /** Hash của tập số đã chốt — để core PULL về so mà không cần so từng phần tử. */
  payoutHash: string | null;
  displayHash: string | null;

  /** Các observation ĐỒNG Ý với kết quả đã chốt. */
  agreeing: ConsensusAgreement[];

  /** Các observation LỆCH. Giữ lại kể cả sau khi chốt — đây là dấu vết audit. */
  conflicting: ConsensusAgreement[];

  decidedBy: DecidedBy | null;
  decidedAt: Date | null;

  /** Chính sách đã áp dụng lúc quyết định (snapshot — đổi policy sau không ghi lại lịch sử). */
  appliedPolicy: ConflictPolicy;

  /** Có mặt ⇔ `state = human_verified`. Máy KHÔNG BAO GIỜ ghi field này. */
  humanVerify: ConsensusHumanVerify | null;

  /** Thời điểm mở cho bên ngoài đọc. Null = chưa publish. */
  publishedAt: Date | null;

  /** Tăng mỗi lần state đổi — optimistic lock, chống 2 tick ghi đè nhau. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface ConsensusEntity extends Omit<ConsensusDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
