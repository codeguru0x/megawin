"use client";

/**
 * Ops Hub — Query DUY NHẤT của trang. Mọi zone `select` slice từ context (`use-hub-context.tsx`),
 * KHÔNG zone nào tự fetch riêng (`p1-01-hub-page-shell-kpi.plan.md` §4, ràng buộc số 1).
 */

import type { OpsHubSnapshotOutput } from "@megawin/game-keno-application/use-cases/operations";
import { apiClient } from "@megawin/next/client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { kenoKeys } from "@/lib/query-keys";

const BASE = "/keno/operations";

/** Nhịp poll fallback trước khi tick đầu trả về `pollSeconds` thật từ server config. */
export const DEFAULT_POLL_SECONDS = 10;

function fetchOpsHubSnapshot(): Promise<OpsHubSnapshotOutput> {
  return apiClient.get<OpsHubSnapshotOutput>(`${BASE}/hub-snapshot`);
}

/**
 * Query DUY NHẤT của trang Ops Hub — mọi zone `select` slice từ đây.
 *
 * `refetchInterval` đọc `pollSeconds` từ server (`ops.stats.tickSeconds`), KHÔNG hardcode: đổi
 * nhịp tick trong Game Config phải có hiệu lực ngay, không cần deploy FE.
 *
 * `refetchOnWindowFocus: true` + `staleTime = pollSeconds` là một CẶP, không tách: workflow thật
 * là 2 tab (hub + trang chi tiết mở tab mới — guideline §7), quay lại tab hub phải thấy dữ liệu
 * mới. `staleTime` là thứ chặn burst: alt-tab 20 lần trong 1 nhịp cũng chỉ fetch 1 lần.
 *
 * `placeholderData: keepPreviousData` bắt buộc — không có nó, mỗi nhịp bảng nháy skeleton, trang
 * không dùng được để monitor 8 giờ.
 */
export function useHubQuery() {
  return useQuery({
    queryKey: kenoKeys.opsHub(),
    queryFn: fetchOpsHubSnapshot,
    refetchInterval: (q) => (q.state.data?.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: (q) => (q.state.data?.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000,
    placeholderData: keepPreviousData,
  });
}
