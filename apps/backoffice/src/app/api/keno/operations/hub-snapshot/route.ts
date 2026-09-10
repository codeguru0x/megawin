import { NextResponse } from "next/server";

import { DEFAULT_HUB_LIMIT } from "@megawin/game-keno-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";
import { apiSuccess } from "@megawin/next/server";

import { withApi } from "@/lib/api";

import { hubSnapshotQuerySchema } from "../_lib/schema";
import { getSnapshotCached } from "./_lib/snapshot-cache";

/**
 * GET /api/keno/operations/hub-snapshot
 *
 * Snapshot vận hành ĐA KỲ — nguồn duy nhất cho trang Ops Hub. Trả toàn bộ kỳ chưa hoàn
 * thành (RAW, không dẫn xuất trạng thái — xem `GetOpsHubSnapshotUseCase`), `serverNow`,
 * ngưỡng và cấu hình chu kỳ. Khác `/operations/snapshot` (1 kỳ, chi tiết sâu).
 *
 * VÌ SAO CACHE AN TOÀN: snapshot hub KHÔNG phụ thuộc user/tenant (hub đọc toàn bộ kỳ chưa
 * hoàn thành, giống nhau cho mọi staff). Auth/permission luôn kiểm TRƯỚC khi đọc cache —
 * `withApi().auth()` chạy trước khi vào block đọc cache. Cache chỉ bỏ qua phần DB, KHÔNG bỏ
 * qua phần auth.
 *
 * Đọc qua cache TTL 2s ({@link getSnapshotCached}, định nghĩa ở `_lib/snapshot-cache.ts` —
 * tách khỏi file này để MỌI route mutate trạng thái kỳ import được `invalidateHubSnapshotCache`
 * mà không vi phạm quy tắc export của Next.js Route Handler) — ĐẶT SAU `.auth()` guard.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(hubSnapshotQuerySchema)
  .handler(async ({ query, request }) => {
    const data = await getSnapshotCached(query.limit ?? DEFAULT_HUB_LIMIT);

    // ETag ghép 3 thành phần (KHÔNG chỉ stats.updatedAt — kỳ mới Published chưa có cược sẽ
    // không đổi updatedAt đó, client bị 304 và không thấy kỳ mới):
    //   max(draw.updatedAt) + max(stats.updatedAt) + rows.length + oldestDrawId
    // draw.updatedAt bắt được MỌI chuyển trạng thái kỳ (mở/đóng bán, settle, void…), không
    // chỉ thay đổi số liệu cược. `serverNow` KHÔNG nằm trong ETag — nó trôi mỗi lần fetch,
    // ghép vào sẽ vô hiệu hoá 304 hoàn toàn (xem JSDoc DTO `serverNow`).
    //
    // Lưu ý (p1-01 §4.1): với mô hình bán cả ngày, ETag đổi mỗi vài giây giờ cao điểm (worker
    // `$inc` stats liên tục) → phần lớn request giờ cao điểm là 200, KHÔNG phải 304. Đây là
    // hành vi ĐÚNG THIẾT KẾ — không phải ETag hỏng. `304` chỉ thực sự xảy ra ban đêm / lúc
    // không có cược mới. Cache TTL (bên trên) mới là lớp bảo vệ chính cho chi phí DB.
    const maxUpdatedAt = data.rows.reduce((max, r) => Math.max(max, Date.parse(r.updatedAt)), 0);
    const oldestDrawId = data.rows.length > 0 ? data.rows[data.rows.length - 1]?.drawId : "";
    const etag = `"${maxUpdatedAt}:${data.rows.length}:${oldestDrawId}"`;

    // Client gửi If-None-Match khớp → 304, không trả body (tiết kiệm băng thông + re-render).
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return apiSuccess(data, {
      headers: {
        ETag: etag,
        // Dữ liệu vận hành, không cho CDN/proxy cache — mỗi staff phải thấy state mới nhất.
        "Cache-Control": "private, no-store",
      },
    });
  });
