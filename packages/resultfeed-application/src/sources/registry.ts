/**
 * ResultFeed – Source Adapter Registry
 *
 * `02-fetch-parse.plan.md §2.1`. Site KHÔNG biết nhau — registry là nơi DUY NHẤT gom lại.
 * Thêm site mới = 1 adapter + 1 dòng ở đây + 1 doc trong `sources` + 1 function trong
 * `serverless.yml`. KHÔNG sửa transport, KHÔNG sửa consensus, KHÔNG sửa schema.
 *
 * **Vai trò cụ thể — dùng ở đâu, làm gì:** đây là bảng tra `sourceId` (giá trị lưu trong
 * doc `sources` — collection MongoDB, sửa được qua backoffice, xem
 * `ResultFeedSourceId`/`SourceDoc`) → instance {@link SourceAdapter} THẬT sẽ chạy. Tầng
 * orchestration (`use-cases/fetch/fetch-and-parse.ts`) nhận `adapter` qua constructor
 * (dependency injection từ worker handler) NÊN thực tế **hiện tại chưa gọi trực tiếp
 * `SOURCE_ADAPTERS` map này** — mỗi Lambda handler (`apps/worker-resultfeed/src/handlers/
 * fetch/*.ts`) tự import adapter cụ thể (VD `vietlottDetailAdapter`) và truyền vào
 * `FetchAndParseUseCase`. `SOURCE_ADAPTERS` tồn tại cho 2 mục đích:
 * 1. **Single source of truth để audit**: 1 nơi liệt kê "hệ thống đang biết bao nhiêu
 *    site", dùng cho test invariant (VD "mọi site trong registry đều có `sourceId` khớp
 *    `ResultFeedSourceId`") và cho công cụ vận hành sau này (VD script kiểm tra doc
 *    `sources` trong DB có `sourceId` nào KHÔNG có adapter tương ứng — cấu hình mồ côi).
 * 2. **Chỗ cắm cho orchestration tổng quát trong tương lai** — nếu sau này có 1 use-case
 *    generic kiểu "chạy tất cả source đang enable" (khác với model hiện tại là 1 Lambda =
 *    1 source × 1 game cố định), nó sẽ resolve adapter qua map này thay vì hardcode import.
 */

import type { SourceAdapter } from "./types";
import { vietlottDetailAdapter } from "./vietlott";

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  [vietlottDetailAdapter.sourceId]: vietlottDetailAdapter,
};
