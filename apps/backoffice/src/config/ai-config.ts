/**
 * Cấu hình AI assistant (Mira) — tên, route, trần đời sống session.
 *
 * Tách khỏi `app-config.ts` vì các hằng này chỉ phục vụ AI panel / trang `/ai` / agent eve,
 * không phải branding chung của backoffice. Đổi giá trị chỉ sửa file này.
 */

/**
 * Tên riêng của trợ lý AI trong backoffice — dùng xuyên suốt panel, trang `/ai` (p1-01),
 * tooltip, và persona system prompt (p0-02). Đặt tập trung ở đây để đổi tên chỉ 1 chỗ.
 */
export const AI_ASSISTANT_NAME = "Mira";

/**
 * Route trang chat full-page (p1-01) — panel tự ẩn trigger + tự đóng khi đang ở route này
 * (2 bề mặt chat cùng hiện là dư thừa). Hằng số dùng chung giữa `ai-panel-trigger.tsx`,
 * `ai-panel-provider.tsx`, và sidebar nav item — đổi path chỉ 1 chỗ.
 */
export const AI_FULL_PAGE_PATH = "/ai";

/**
 * Trần tuyệt đối đời sống 1 eve session (ms), tính từ lúc TẠO — KHÔNG phải idle timeout.
 *
 * Nguồn chân lý DUY NHẤT — hai consumer bắt buộc cùng import hằng này (không copy số):
 * - `agent/agent.ts` → `limits.sessionTimeoutMs` (server thu hồi session khi hết hạn)
 * - `stores/ai-threads/thread-storage.ts` → `isThreadSessionExpired` (client biết trước để
 *   báo lỗi + nút "Bắt đầu chat mới", không đợi staff gửi rồi mới 409 `session_not_active`)
 *
 * Default của eve là 30 ngày — quá ngắn so với thread lưu vô hạn ở `localStorage` (p1-01).
 * 90 ngày khớp chu kỳ nghỉ dài nhất hợp lý (nghỉ thai sản, biệt phái). Session ngủ không tốn
 * compute (`execution-model-and-durability.mdx` §Parked work).
 *
 * @see node_modules/eve/docs/agent-config.md §Runtime limits
 */
export const AI_SESSION_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;
