import type { AuditActorType } from "../entities";

/**
 * Định danh chủ thể thực hiện hành động — phẳng, đã normalize, độc lập runtime.
 *
 * Đây là contract DUY NHẤT mà use-case dùng để nhận actor. KHÔNG để use-case
 * nhận trực tiếp `AuthContext` (Lambda) / `RouteSession` (BO) — hai shape khác
 * nhau + lệ thuộc tầng vận chuyển. Tầng route map sang `AuditActor` qua factory
 * (`actorFromAuthContext` / `actorFromSession` — đặt ở adapter layer), rồi thread
 * xuống use-case input. `ip` gắn sẵn khi dựng actor nên use-case chỉ nhận 1 field
 * `actor`, KHÔNG cần `ip` riêng. Worker tự chạy dùng {@link systemActor}.
 *
 * @example
 * ```ts
 * // route handler (BO): ip gắn sẵn vào actor từ request.
 * const actor = actorFromSession(session, request);
 * await useCase.run({ ...input, actor });
 * ```
 */
export interface AuditActor {
  /** accountId của người thực hiện. `"system"` nếu máy tự chạy. */
  id: string;
  /** company | agent | player | system. */
  type: AuditActorType;
  /** Tên hiển thị snapshot: username → email (theo thứ tự ưu tiên). */
  name: string;
  /** Roles snapshot lúc hành động. */
  roles: string[];
  /** tenantId liên quan. `""` nếu company action không thuộc tenant. */
  tenantId: string;
  /**
   * IP client của actor lúc thực hiện (forensic). Gắn ngay khi dựng actor ở tầng
   * route (`actorFromSession(session, request)`) nên đi kèm actor xuống use-case —
   * KHÔNG cần thread `ip` riêng qua từng DTO. `undefined` với worker/job
   * ({@link systemActor}) hoặc route chưa nối request; logger điền sentinel `""`.
   */
  ip?: string;
  /**
   * User-Agent client (trình duyệt/thiết bị) lúc thực hiện. Gắn cùng `ip` khi dựng
   * actor ở route/hook. Chỉ để hiển thị (nhận diện thiết bị lạ), KHÔNG filter.
   * `undefined` với worker/job hoặc khi không bắt được header.
   */
  userAgent?: string;
  /**
   * Request/trace id để correlation audit ↔ application log. Gắn cùng `ip` khi
   * dựng actor. `undefined` nếu request không kèm trace id (worker/job).
   */
  requestId?: string;
}

/**
 * Actor cho action hệ thống (worker Step Function, cron, queue consumer).
 *
 * Dùng khi không có người thực hiện — `id`/`name` = `"system"`, `roles` rỗng,
 * `tenantId` rỗng, không có `ip` (máy tự chạy).
 */
export const systemActor = (): AuditActor => ({
  id: "system",
  type: "system",
  name: "system",
  roles: [],
  tenantId: "",
});
