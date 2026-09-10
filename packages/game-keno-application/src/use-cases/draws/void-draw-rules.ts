import { DrawStatus } from "@megawin/game-core/entities";

const VOIDABLE_STATUSES = new Set<string>([DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published]);

/**
 * Kiểm tra 1 status có void được không — nguồn chân lý DUY NHẤT cho `VOIDABLE_STATUSES`.
 *
 * FE (bulk action bar) dùng hàm này để bật/tắt nút "Huỷ kỳ" — KHÔNG hardcode lại danh sách
 * status, tránh lệch khi domain đổi (`p0-04-bulk-settle-void-api.plan.md` §1.3).
 *
 * `salesOpen` CỐ Ý không có trong danh sách: void một kỳ đang mở bán mà không đóng bán
 * trước là thao tác nguy hiểm (vé vẫn đang vào trong lúc void chạy) — bắt đóng bán trước
 * là đúng nghiệp vụ, không phải giới hạn kỹ thuật. Kỳ ở `salesOpen` phải `close-sales`
 * trước rồi mới `void` được.
 *
 * Tách riêng file này (không nằm trong `void-draw.ts`) VÌ `void-draw.ts` import
 * `DrawRepository` (mongodb driver) + `startExecution` (AWS SDK) — nếu `isVoidable` ở
 * cùng file, mọi import (dù chỉ lấy `isVoidable`) sẽ kéo theo toàn bộ 2 dependency đó vào
 * module graph. Client Component (`partition-by-action.ts`, Ops Hub) cần gọi hàm này —
 * bundler Next.js không thể resolve `mongodb`/AWS SDK cho target browser → build lỗi
 * "Module not found: Can't resolve 'child_process'". File này CHỈ import `DrawStatus`
 * (domain thuần, không I/O) nên an toàn bundle vào client.
 */
export function isVoidable(status: string): boolean {
  return VOIDABLE_STATUSES.has(status);
}
