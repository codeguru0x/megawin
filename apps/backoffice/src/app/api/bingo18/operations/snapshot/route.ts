import { GetOpsSnapshotUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";
import { apiSuccess } from "@megawin/next/server";
import { NextResponse } from "next/server";

import { withApi } from "@/lib/api";

import { snapshotQuerySchema } from "../_lib/schema";

const useCase = new GetOpsSnapshotUseCase();

/**
 * GET /api/bingo18/operations/snapshot
 *
 * Snapshot gộp mọi số liệu vận hành 1 kỳ (stats + exposure 216 + alert count + draw
 * status) — nguồn cho **timer 1 duy nhất** ở FE, thay 5 request aggregation on-demand cũ.
 *
 * ETag/304: `ETag` = `updatedAt` stats + alertCounts. Trình duyệt/proxy gửi `If-None-Match`
 * khớp → trả 304 rỗng (0 payload). Đây là chuẩn HTTP thuần, KHÔNG dựng cache riêng.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(snapshotQuerySchema)
  .handler(async ({ query, request }) => {
    const data = await useCase.getData({ drawId: query.drawId });

    // ETag đại diện state snapshot: updatedAt stats + số alert (đổi khi 1 trong 2 đổi).
    const stamp = data.stats?.updatedAt?.getTime() ?? 0;
    const etag = `"${data.drawId}:${stamp}:${data.alertCounts.new}:${data.alertCounts.critical}"`;

    // Client gửi If-None-Match khớp → 304, không trả body (tiết kiệm băng thông + re-render).
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return apiSuccess(data, { headers: { ETag: etag } });
  });
