import type { AuditActorType } from "../entities";

/**
 * Định danh chủ thể thực hiện hành động — phẳng, đã normalize, độc lập runtime.
 *
 * Đây là contract DUY NHẤT mà use-case dùng để nhận actor. KHÔNG để use-case
 * nhận trực tiếp `AuthContext` (Lambda) / `RouteSession` (BO) — hai shape khác
 * nhau + lệ thuộc tầng vận chuyển. Tầng route map sang `AuditActor` qua factory
 * (`actorFromAuthContext` / `actorFromSession` — đặt ở adapter layer), rồi thread
 * xuống use-case input. Worker tự chạy dùng {@link systemActor}.
 *
 * @example
 * ```ts
 * // route handler (BO):
 * const actor = actorFromSession(session.user);
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
}

/**
 * Actor cho action hệ thống (worker Step Function, cron, queue consumer).
 *
 * Dùng khi không có người thực hiện — `id`/`name` = `"system"`, `roles` rỗng,
 * `tenantId` rỗng.
 */
export const systemActor = (): AuditActor => ({
  id: "system",
  type: "system",
  name: "system",
  roles: [],
  tenantId: "",
});
