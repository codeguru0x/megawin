import { NextResponse } from "next/server";

import { DEFAULT_HUB_LIMIT } from "@megawin/game-bingo18-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";
import { apiSuccess } from "@megawin/next/server";

import { withApi } from "@/lib/api";

import { hubSnapshotQuerySchema } from "../_lib/schema";
import { getSnapshotCached } from "./_lib/snapshot-cache";

/**
 * GET /api/bingo18/operations/hub-snapshot
 *
 * Snapshot vận hành ĐA KỲ — nguồn duy nhất cho trang Ops Hub Bingo18. Trả toàn bộ kỳ chưa
 * hoàn thành (RAW), `serverNow`, ngưỡng và cấu hình chu kỳ (6 phút / 30s đóng bán).
 *
 * Cache TTL 2s riêng Bingo18 ({@link getSnapshotCached}) — ĐẶT SAU `.auth()` guard.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(hubSnapshotQuerySchema)
  .handler(async ({ query, request }) => {
    const data = await getSnapshotCached(query.limit ?? DEFAULT_HUB_LIMIT);

    // ETag: max(draw.updatedAt) + rows.length + oldestDrawId — KHÔNG ghép serverNow.
    const maxUpdatedAt = data.rows.reduce((max, r) => Math.max(max, Date.parse(r.updatedAt)), 0);
    const oldestDrawId = data.rows.length > 0 ? data.rows[data.rows.length - 1]?.drawId : "";
    const etag = `"${maxUpdatedAt}:${data.rows.length}:${oldestDrawId}"`;

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return apiSuccess(data, {
      headers: {
        ETag: etag,
        "Cache-Control": "private, no-store",
      },
    });
  });
