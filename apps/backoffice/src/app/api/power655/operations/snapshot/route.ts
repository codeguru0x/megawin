import { GetOpsSnapshotUseCase } from "@megawin/game-power655-application/use-cases/operations";
import { OpsAlertStatus } from "@megawin/game-power655/entities";
import { CompanyRole } from "@megawin/identity/entities";
import { apiSuccess } from "@megawin/next/server";
import { NextResponse } from "next/server";

import { withApi } from "@/lib/api";

import { snapshotQuerySchema } from "../_lib/schema";

const useCase = new GetOpsSnapshotUseCase();

/**
 * GET /api/power655/operations/snapshot
 *
 * Snapshot gộp mọi số liệu vận hành 1 kỳ (stats + top-K + alert count + draw status +
 * exposure jackpot) — nguồn cho **timer 1 duy nhất** ở FE (analysis §5.2, D2).
 *
 * ETag/304: `ETag` = `updatedAt` stats + số alert New. Trình duyệt/proxy gửi
 * `If-None-Match` khớp → trả 304 rỗng (0 payload). Chuẩn HTTP thuần, KHÔNG dựng cache riêng.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(snapshotQuerySchema)
  .handler(async ({ query, request }) => {
    const data = await useCase.getData({ drawId: query.drawId });

    // ETag đại diện state snapshot: updatedAt stats + số alert New (đổi khi 1 trong 2 đổi).
    const stamp = data.stats?.updatedAt?.getTime() ?? 0;
    const etag = `"${data.drawId}:${stamp}:${data.alertCounts[OpsAlertStatus.New]}"`;

    // Client gửi If-None-Match khớp → 304, không trả body (tiết kiệm băng thông + re-render).
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return apiSuccess(data, { headers: { ETag: etag } });
  });
