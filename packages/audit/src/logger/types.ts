import type {
  AuditAction,
  AuditActorType,
  AuditCategory,
  AuditChanges,
  AuditMetadata,
  AuditStatus,
  AuditTargetType,
} from "../entities";

/**
 * Input "dễ dùng" cho {@link record} — bản rút gọn của
 * `AuditLogInsertDoc`.
 *
 * Logger tự điền field hệ thống:
 * - `ts` = `new Date()` (**UTC**, KHÔNG cộng offset) nếu không truyền.
 * - `status` mặc định `success` nếu không truyền.
 * - `game` mặc định `""` (không thuộc game cụ thể) nếu không truyền.
 * - `id`/`_id` do Mongo tự sinh.
 *
 * Field filter top-level dùng sentinel `""` (KHÔNG `null`/`undefined`) ở TẦNG
 * LƯU TRỮ để index đồng nhất. Ở tầng input này, `tenantId`/`targetId` vẫn
 * required (caller truyền `""` khi không áp dụng) vì phụ thuộc ngữ cảnh; riêng
 * `game` optional-với-default `""` — đa số action KHÔNG thuộc game, ép truyền
 * `game: ""` mọi nơi chỉ thêm nhiễu. Action thuộc game thì truyền `game: "keno"`
 * tường minh (game helper `audit*()` đóng băng sẵn nên use-case không phải nhớ).
 */
export interface AuditEventInput {
  /** Thời điểm hành động (UTC). Mặc định `new Date()` nếu bỏ trống. */
  ts?: Date;

  // ── WHO ──
  /** accountId actor. `"system"` nếu máy tự chạy. */
  actorId: string;
  actorType: AuditActorType;
  /** Tên hiển thị snapshot (username → email). */
  actorName: string;
  /** Roles snapshot lúc hành động. */
  actorRoles: string[];
  /** tenantId liên quan. `""` nếu không thuộc tenant. */
  tenantId: string;
  /**
   * IP client của actor (`x-forwarded-for` đầu / `x-real-ip` / remote address).
   * Optional ở tầng input — logger điền sentinel `""` khi bỏ trống (worker/job,
   * hoặc route chưa nối). Lưu xuống DB luôn là top-level indexed để filter forensic.
   */
  ip?: string;
  /**
   * User-Agent client. Optional — lưu top-level (KHÔNG index), chỉ hiển thị.
   * Bỏ trống → không ghi (undefined), KHÔNG dùng sentinel như `ip`.
   */
  userAgent?: string;
  /**
   * Request/trace id để correlation audit ↔ application log. Optional — lưu
   * top-level (KHÔNG index). Bỏ trống → không ghi.
   */
  requestId?: string;

  // ── WHAT ──
  action: AuditAction;
  category: AuditCategory;
  /**
   * GameProduct key. Optional — bỏ qua = `""` (không thuộc game cụ thể). Action
   * thuộc game truyền tường minh (`"keno"`); lưu xuống DB luôn là sentinel `""`
   * khi không có (index đồng nhất).
   */
  game?: string;

  // ── ON ──
  targetType: AuditTargetType;
  /** Id đối tượng, `""` nếu không có. */
  targetId: string;
  /** Nhãn hiển thị đối tượng. VD `"Kỳ 2026-03-07.095"`. */
  targetLabel?: string;

  // ── OUTCOME ──
  /** Mặc định `success` nếu bỏ trống. */
  status?: AuditStatus;
  /** Mã lỗi khi `status = failure` (`AppError.code`) — filter/aggregate được. */
  errorCode?: string;
  /** Mô tả lỗi human-readable khi `status = failure` (`AppError.message`) — chỉ hiển thị. */
  errorMessage?: string;

  // ── CONTEXT ──
  changes?: AuditChanges;
  metadata?: AuditMetadata;
}
