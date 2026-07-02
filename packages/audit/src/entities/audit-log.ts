import type {
  AuditAction,
  AuditActorType,
  AuditCategory,
  AuditStatus,
  AuditTargetType,
} from "./audit-log.enums";

/**
 * Context request HTTP (route Backoffice hoặc Lambda API). Optional toàn bộ —
 * mỗi field chỉ điền khi tầng route bắt được.
 */
export interface AuditHttpContext {
  /** IP client (`x-forwarded-for` / remote address). */
  ip?: string;
  /** User-Agent header của client. */
  userAgent?: string;
  /** Request id để trace cross-service (`x-request-id` / `x-amzn-trace-id`). */
  requestId?: string;
  /** HTTP method. VD: `POST`, `PUT`, `PATCH`. */
  method?: string;
  /** Path đã gọi. VD: `/api/keno/draws/2026-03-07.095/void`. */
  path?: string;
}

/**
 * Context worker / job hệ thống (Step Function, cron, queue consumer).
 * Optional toàn bộ — điền khi action đến từ máy tự chạy.
 */
export interface AuditWorkerContext {
  /** Tên worker / handler. VD: `settle-finalizer`. */
  workerName?: string;
  /** Step Function execution ARN hoặc job id để trace. */
  executionId?: string;
  /** Nguồn kích hoạt: `step_function` | `sqs` | `kinesis` | `cron` | `manual`. */
  trigger?: string;
}

/**
 * Metadata audit — một trong hai context (HTTP hoặc worker) + `extra`.
 *
 * KHÔNG index. Chỉ phục vụ xem chi tiết + trace. Một record chỉ đến từ 1 nguồn
 * nên thường chỉ có `http` HOẶC `worker`, không cả hai.
 */
export interface AuditMetadata {
  /** Có khi action đến từ HTTP request (BO/Lambda API). */
  http?: AuditHttpContext;
  /** Có khi action đến từ worker/job tự chạy. */
  worker?: AuditWorkerContext;
  /**
   * Metadata nghiệp vụ tự do — key → {@link AuditScalar} (primitive/mảng primitive).
   * VD: `{ reason: "Sai kết quả", version: 3 }`. CỐ Ý chặn object/array lồng như
   * `changes`: audit append-only, giữ data phẳng & sạch. Cần cấu trúc phức tạp thì
   * serialize thành `string`/`string[]` trước khi ghi.
   */
  extra?: Record<string, AuditScalar>;
}

/**
 * Giá trị "sạch" cho phép ghi vào audit — CỐ Ý hẹp: chỉ primitive + mảng primitive.
 *
 * Dùng chung cho cả diff `changes` lẫn `metadata.extra`. Ép mọi giá trị audit
 * LUÔN **phẳng & người-đọc-hiểu** (`"01","56",…` chứ không phải object lồng):
 * - UI render trực tiếp, không cần đệ quy JSON khó đọc.
 * - Chặn caller nhét object lồng / payload lạ / rác vào DB (append-only, khó dọn).
 * - So sánh key-by-key ở UI để highlight field đã đổi.
 *
 * Cần ghi cấu trúc phức tạp (bảng giải nhiều tầng) → flatten theo dot-path
 * (`flattenChanges`) hoặc serialize thành `string`/`string[]` TRƯỚC khi đưa vào,
 * KHÔNG ghi nguyên object.
 */
export type AuditScalar = string | number | boolean | null | string[] | number[];

/**
 * Giá trị hợp lệ trong 1 field của diff `changes`. Alias của {@link AuditScalar}.
 */
export type AuditChangeValue = AuditScalar;

/**
 * 1 phía (before HOẶC after) của diff — map field → giá trị phẳng.
 * VD: `{ status: "published", winningNumbers: ["01", "56"] }`.
 */
export type AuditChangeSet = Record<string, AuditChangeValue>;

/**
 * Diff trước/sau cho mutation — so sánh để hiển thị thay đổi ở UI detail.
 * Cả hai optional: action create không có `before`, action delete không có `after`.
 *
 * Giá trị mỗi field ép về {@link AuditChangeValue} (phẳng) — xem lý do ở đó.
 */
export interface AuditChanges {
  /** Trạng thái trước khi mutate. */
  before?: AuditChangeSet;
  /** Trạng thái sau khi mutate. */
  after?: AuditChangeSet;
}

/**
 * Raw MongoDB document — collection `audit_logs` (DB `megawin-audit`).
 *
 * Schema theo mô hình **5W chuẩn của audit log** (CloudTrail / OWASP logging) —
 * mỗi block field bên dưới trả lời 1 câu hỏi, đủ để tái dựng "ai làm gì, lên cái
 * gì, lúc nào, kết quả ra sao":
 * - **WHEN** (`ts`) — hành động xảy ra lúc nào (UTC).
 * - **WHO** (`actorId/actorType/actorName/actorRoles/tenantId`) — ai thực hiện.
 *   `actorName`/`actorRoles` là **snapshot tại thời điểm** (forensic), KHÔNG join
 *   về account hiện tại.
 * - **WHAT** (`action/category/game`) — hành động gì, thuộc nhóm nào, game nào.
 * - **ON** (`targetType/targetId/targetLabel`) — tác động lên đối tượng nào.
 * - **OUTCOME** (`status/errorCode`) — thành công hay thất bại.
 * - **CONTEXT** (`changes/metadata`) — diff trước/sau + ngữ cảnh request/worker
 *   (không index, chỉ phục vụ xem chi tiết & trace).
 *
 * Đây là shape **đúng như lưu trong Mongo**: `_id` là `ObjectId` (khai `unknown`
 * để entity layer không phụ thuộc driver type). Khi đọc ra, {@link AuditLogMapper}
 * map `_id → id` thành {@link AuditLogEntity}. Khi ghi, dùng {@link AuditLogInsertDoc}
 * (không có `_id` — Mongo tự sinh).
 *
 * Mọi field dùng để **filter** (WHEN/WHO/WHAT/ON + `status`/`errorCode`) là
 * top-level + normalized (đã có index). Field filter dùng sentinel `""` (KHÔNG
 * `null`/`undefined`) để index đồng nhất + query đơn giản. Field chỉ-hiển-thị
 * (`targetLabel`, `errorMessage`, `changes`, `metadata`) thì optional bình thường
 * (không index).
 *
 * Append-only: ghi 1 lần, không update. TTL 90 ngày tự xoá qua index `{ ts: 1 }`.
 *
 * @see {@link https://keepachangelog.com plan §2} để biết lý do từng quyết định field.
 */
export interface AuditLogDoc {
  /** `_id` Mongo (ObjectId). Khai `unknown` — mapper toHexString sang `id`. */
  _id: unknown;

  // ── WHEN ──
  /**
   * Thời điểm hành động — LƯU UTC (Date thuần, Mongo luôn UTC).
   * Format sang giờ VN chỉ ở display layer (`displayVNDateTime`).
   * Nền cho cursor sort `{ ts: -1, _id: -1 }` + TTL index.
   */
  ts: Date;

  // ── WHO (actor) ──
  /** accountId của người/hệ thống thực hiện. `"system"` nếu máy tự chạy. */
  actorId: string;
  /** Loại chủ thể: company | agent | player | system. */
  actorType: AuditActorType;
  /** Snapshot tên hiển thị lúc hành động (username → email). */
  actorName: string;
  /**
   * Snapshot roles lúc hành động — KHÔNG join về account hiện tại.
   * Cốt lõi forensic: role có thể đổi sau, audit ghi trạng thái tại thời điểm.
   */
  actorRoles: string[];
  /** tenantId liên quan. `""` nếu company action không thuộc tenant. */
  tenantId: string;

  // ── WHAT (action) ──
  /** Mã hành động format `{category}.{verb}`. VD: `"draw.void"`. Unique per action. */
  action: AuditAction;
  /** Nhóm: draw | player | config | auth | finance | system. */
  category: AuditCategory;
  /**
   * GameProduct key: keno | bingo18 | ... | `""` nếu không thuộc game cụ thể.
   * Đây là chiều duy nhất phân biệt game — action KHÔNG nhúng tên game (xem quy
   * tắc 6 ở `AUDIT_ACTIONS`). Thêm game mới = thêm value ở đây, 0 đổi enum.
   */
  game: string;

  // ── ON (target) ──
  /** Loại đối tượng bị tác động: draw | player | game_config | account | tenant. */
  targetType: AuditTargetType;
  /** Id đối tượng: drawId (`YYYY-MM-DD.NNN`), accountId... `""` nếu không có. */
  targetId: string;
  /**
   * Nhãn hiển thị đối tượng — snapshot để list view khỏi join.
   * VD: `"Kỳ 2026-03-07.095"`. Optional (chỉ hiển thị, không filter).
   */
  targetLabel?: string;

  // ── OUTCOME ──
  /** success | failure. */
  status: AuditStatus;
  /**
   * Mã lỗi khi `status = failure` — ổn định, máy đọc (`AppError.code`). VD:
   * `"NOT_FOUND"`, `"INTERNAL"`. Đây là field **filter/aggregate** ("đếm audit
   * fail theo loại lỗi"). Optional — chỉ có khi failure.
   */
  errorCode?: string;
  /**
   * Mô tả lỗi cho người đọc khi `status = failure` (`AppError.message`). Chỉ để
   * **hiển thị** ở UI detail — KHÔNG index, KHÔNG filter (message biến thiên/i18n).
   *
   * Tách khỏi `errorCode` (không gộp plain text) để code vẫn filter được còn
   * message vẫn human-readable. TUYỆT ĐỐI không nhét stack trace / SQL / secret /
   * PII vào đây — những thứ đó thuộc application log, không thuộc audit log.
   * Optional — chỉ có khi failure.
   */
  errorMessage?: string;

  // ── CONTEXT (không index, chỉ xem chi tiết) ──
  /** Diff trước/sau cho mutation. Optional. */
  changes?: AuditChanges;
  /** Metadata bổ sung — tổng quát cho cả HTTP request lẫn worker. */
  metadata?: AuditMetadata;
}

/**
 * Entity sau khi qua {@link AuditLogMapper} — `_id` (ObjectId) → `id` (hex string).
 *
 * Đây là shape repo trả ra cho use-case / Backoffice đọc. Mọi field nghiệp vụ
 * giữ nguyên từ {@link AuditLogDoc}, chỉ khác `_id` → `id: string`.
 */
export interface AuditLogEntity extends Omit<AuditLogDoc, "_id"> {
  /** `_id` Mongo đã map sang hex string. */
  id: string;
}

/**
 * Shape doc insert vào `audit_logs` — `AuditLogDoc` bỏ `_id` (Mongo tự sinh).
 *
 * Repo `insertAudit` nhận type này. Logger build doc đầy đủ field nghiệp vụ
 * (không gồm `_id`), Mongo gán `_id` lúc insert.
 */
export type AuditLogInsertDoc = Omit<AuditLogDoc, "_id">;
