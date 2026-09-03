/**
 * ResultFeed – Enums & Constants
 *
 * Collections MongoDB: `sources`, `submissions`, `observations`, `consensus`,
 * `source_cursors`, `alerts` — DB `megawin-resultfeed` (cùng cluster core, xem
 * `@megawin/data` `ResultFeedRepo`). Tên collection KHÔNG cần prefix `resultfeed_`
 * vì đã ở DB riêng.
 *
 * `ResultFeedGameKey` là bảng game riêng của ResultFeed — KHÔNG import từ
 * `@megawin/game-*` (boundary: resultfeed độc lập core, xem 00-overview.md §6).
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

export const ResultFeedCollections = {
  Sources: "sources",
  Submissions: "submissions",
  Observations: "observations",
  Consensus: "consensus",
  SourceCursors: "source_cursors",
  Alerts: "alerts",
} as const;
export type ResultFeedCollections = (typeof ResultFeedCollections)[keyof typeof ResultFeedCollections];

// ─────────────────────────────────────────────
// Game Key
// ─────────────────────────────────────────────

/** Game mà ResultFeed thu thập. Tự khai báo — độc lập với `@megawin/game-*`. */
export const ResultFeedGameKey = {
  Keno: "keno",
  Bingo18: "bingo18",
  Lotto535: "lotto535",
  Mega645: "mega645",
  Power655: "power655",
  Max3d: "max3d",
  Max3dpro: "max3dpro",
} as const;
export type ResultFeedGameKey = (typeof ResultFeedGameKey)[keyof typeof ResultFeedGameKey];

// ─────────────────────────────────────────────
// Source
// ─────────────────────────────────────────────

/**
 * Khoá ổn định của 1 website nguồn — PHẢI khớp CHÍNH XÁC với `SourceAdapter.sourceId`
 * (`resultfeed-application/src/sources/registry.ts`) và giá trị `sourceId` ghi trong doc
 * `sources` (backoffice/seed). Định nghĩa DUY NHẤT tại đây để adapter, registry, và dữ
 * liệu seed luôn dùng CHUNG 1 hằng số — tránh gõ tay lệch chính tả giữa 3 nơi (đã xảy ra
 * rủi ro thật: `"vietlott-detail"` bị lặp lại rời rạc ở nhiều file trước khi có hằng số
 * này). Thêm site mới ⇒ thêm 1 dòng ở đây TRƯỚC KHI viết adapter.
 */
export const ResultFeedSourceId = {
  /** Trang chi tiết kết quả trên `vietlott.vn` — nguồn authoritative đầu tiên. */
  VietlottDetail: "vietlott-detail",
  /**
   * Nguồn giả lập cho script nạp dữ liệu lịch sử từ file JSONL (không phải fetch HTML
   * sống) — xem `06-historical-import.plan.md`. Vai trò `Authoritative` vì đây là NGUỒN
   * DUY NHẤT cho các kỳ lịch sử (không có nguồn thứ hai để đối chiếu).
   */
  HistoricalImport: "historical-import",
} as const;
export type ResultFeedSourceId = (typeof ResultFeedSourceId)[keyof typeof ResultFeedSourceId];

/**
 * Khoá ổn định của 1 vendor "thuê bytes" — PHẢI khớp CHÍNH XÁC với `FetchProvider.providerId`
 * (`resultfeed-application/src/infras/providers/*.ts`) và giá trị `providerId` ghi trong
 * doc `sources`. Cùng lý do với {@link ResultFeedSourceId}: định nghĩa 1 nơi, dùng chung.
 */
export const ResultFeedProviderId = {
  /** Primary — HTTPS proxy trả bytes gốc, xem `oxylabs-provider.ts`. */
  OxylabsUnblocker: "oxylabs-unblocker",
  /** Secondary/failover — bọc HTML trong JSON, xem `context-dev-provider.ts`. */
  ContextDev: "context-dev",
  /**
   * Giả lập cho pseudo-submission của script nạp lịch sử (`06-historical-import.plan.md
   * §3.4`) — KHÔNG có `FetchProvider` thật đăng ký cho giá trị này (`providers/registry.ts`
   * không cần biết tới nó, vì luồng import lịch sử không đi qua `resolveProvider`/fetch
   * sống). Chỉ tồn tại để thoả field bắt buộc `SubmissionDoc.providerId`.
   */
  HistoricalImport: "historical-import",
} as const;
export type ResultFeedProviderId = (typeof ResultFeedProviderId)[keyof typeof ResultFeedProviderId];

/**
 * Vai trò của một nguồn trong quá trình đồng thuận. Bất đối xứng nguồn PHẢI nằm trong
 * schema (không hardcode trong logic) — cho phép đổi vai trò một nguồn qua backoffice
 * mà không cần deploy.
 */
export const SourceRole = {
  /** Nguồn chính thức (vietlott.vn). CHỈ nguồn này được làm cơ sở cho kết quả công bố. */
  Authoritative: "authoritative",
  /** Nguồn đối chiếu — có quyền VETO (chặn), KHÔNG có quyền nâng lên Verified. */
  Confirming: "confirming",
  /** Chỉ tham khảo/quan sát — không veto, không nâng. Dùng khi nguồn mới chưa đủ tin. */
  Reference: "reference",
} as const;
export type SourceRole = (typeof SourceRole)[keyof typeof SourceRole];

// ─────────────────────────────────────────────
// Submission
// ─────────────────────────────────────────────

/** Trạng thái parse của một submission (raw bytes). */
export const SubmissionState = {
  Fetched: "fetched",
  Parsed: "parsed",
  ParseFailed: "parse_failed",
  FetchFailed: "fetch_failed",
  /**
   * Trang trả về HTTP 200 hợp lệ nhưng nội dung là "kỳ chưa có kết quả" (nhận diện
   * best-effort qua `findResultRow`, KHÔNG phải lỗi parser) — trạng thái BÌNH THƯỜNG,
   * xảy ra liên tục mỗi khi worker fetch tới sát mép dữ liệu thật (live edge). KHÔNG
   * coi như `parse_failed` (đó là bằng chứng lỗi cần sửa parser) — tách riêng để không
   * lẫn vào hàng đợi "parse lại" và không bị giữ vô thời hạn (retention 30 ngày như
   * `parsed`, xem `indexes/index.ts`).
   */
  Unavailable: "unavailable",
} as const;
export type SubmissionState = (typeof SubmissionState)[keyof typeof SubmissionState];

// ─────────────────────────────────────────────
// Observation
// ─────────────────────────────────────────────

/**
 * Kết quả kiểm nội tại của 1 observation (checksum do CHÍNH trang nguồn công bố, không
 * phải checksum ta tự tạo ra).
 */
export const IntrinsicState = {
  /** Chưa kiểm. */
  Pending: "pending",
  /** Đủ số + mọi checksum nguồn tự công bố đều khớp với số. */
  Passed: "passed",
  /** Có checksum lệch ⇒ observation này KHÔNG được dùng cho consensus. */
  Failed: "failed",
  /** Nguồn không công bố checksum nào ⇒ không kết luận được (vd mirror chỉ có số). */
  NotAvailable: "not_available",
} as const;
export type IntrinsicState = (typeof IntrinsicState)[keyof typeof IntrinsicState];

// ─────────────────────────────────────────────
// Consensus
// ─────────────────────────────────────────────

/** Trạng thái đồng thuận cho 1 game × 1 kỳ. */
export const ConsensusState = {
  /** Chưa đủ dữ liệu để kết luận. */
  Pending: "pending",
  /** Máy kết luận: đủ điều kiện chính sách, các nguồn khớp nhau. */
  Agreed: "agreed",
  /** Các nguồn LỆCH nhau ⇒ chặn, chờ người. KHÔNG bao giờ auto-publish. */
  Conflict: "conflict",
  /** Người đã verify. FLAG CAO NHẤT — máy KHÔNG BAO GIỜ ghi đè. */
  HumanVerified: "human_verified",
  /** Người kết luận dữ liệu không dùng được (nguồn sai, kỳ bị huỷ…). */
  Rejected: "rejected",
} as const;
export type ConsensusState = (typeof ConsensusState)[keyof typeof ConsensusState];

/** Ai ra quyết định cuối. */
export const DecidedBy = {
  Machine: "machine",
  Human: "human",
} as const;
export type DecidedBy = (typeof DecidedBy)[keyof typeof DecidedBy];

/** Chính sách xử lý khi các nguồn lệch nhau. Cấu hình được per game. */
export const ConflictPolicy = {
  /** MẶC ĐỊNH. Lệch ⇒ luôn chờ người. An toàn nhất. */
  HumanOnly: "human_only",
  /** Nguồn authoritative thắng, NHƯNG chỉ khi nó pass toàn bộ checksum nội tại. */
  AuthoritativeWins: "authoritative_wins",
  /** Cộng trọng số tin cậy; thắng nếu vượt ngưỡng VÀ có authoritative trong nhóm thắng. */
  WeightedQuorum: "weighted_quorum",
} as const;
export type ConflictPolicy = (typeof ConflictPolicy)[keyof typeof ConflictPolicy];

// ─────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────

/** Loại alert vận hành ResultFeed — bảng riêng, KHÔNG dùng chung `ops_alerts` của game. */
export const ResultFeedAlertType = {
  FetchFailing: "fetch_failing",
  ParseFailed: "parse_failed",
  IntrinsicFailed: "intrinsic_failed",
  /**
   * Nguồn bị TỰ ĐỘNG dừng fetch vì `consecutiveIntrinsicFailures` vượt ngưỡng — dấu hiệu
   * mạnh của "parser đọc sai" (site đổi cấu trúc, parse vẫn "thành công về hình dạng" nhưng
   * checksum liên tục lệch). Khác `IntrinsicFailed` (bắn mỗi KỲ lệch) — alert này ở cấp
   * NGUỒN, chỉ 1 bản ghi (dedupe theo `sourceId:gameKey`), tồn tại suốt thời gian pause.
   */
  IntrinsicPaused: "intrinsic_paused",
  ConsensusConflict: "consensus_conflict",
  PeriodGap: "period_gap",
  SourceStale: "source_stale",
  CostSpike: "cost_spike",
  HumanReviewBacklog: "human_review_backlog",
} as const;
export type ResultFeedAlertType = (typeof ResultFeedAlertType)[keyof typeof ResultFeedAlertType];

/** Mức độ nghiêm trọng của alert. */
export const ResultFeedAlertSeverity = {
  Info: "info",
  Warning: "warning",
  Critical: "critical",
} as const;
export type ResultFeedAlertSeverity = (typeof ResultFeedAlertSeverity)[keyof typeof ResultFeedAlertSeverity];

/** Trạng thái xử lý alert bởi vận hành. */
export const ResultFeedAlertStatus = {
  New: "new",
  Ack: "ack",
  Resolved: "resolved",
} as const;
export type ResultFeedAlertStatus = (typeof ResultFeedAlertStatus)[keyof typeof ResultFeedAlertStatus];
