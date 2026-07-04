"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import type { AuditLogEntity } from "@megawin/audit/entities";
import type { AuditLogPage } from "@megawin/audit/use-cases";
import { meKeys, type MyAuditLogsListFilters } from "@/lib/query-keys";

/**
 * List 1 trang "Nhật ký của tôi" theo `cursor` opaque — Prev/Next pagination.
 *
 * Gọi `/me/audit-logs` (self-scoped): server tự ép `actor = accountId`, FE KHÔNG
 * gửi actor. Chỉ đẩy field có giá trị vào query params. `apiClient.get` trả thẳng
 * {@link AuditLogPage} (đã unwrap `data`): `page.data` mảng record, `page.nextCursor`
 * token opaque | null (null = hết trang).
 *
 * `cursor` nằm trong query key → mỗi trang cache riêng, back/next tức thì.
 * `keepPreviousData` giữ data trang cũ trong lúc fetch trang mới → không nhấp nháy.
 */
export function useMyAuditLogList(filters: MyAuditLogsListFilters, cursor: string | null) {
  const qpBase: Record<string, string> = {};
  if (filters.from) qpBase.from = filters.from;
  if (filters.to) qpBase.to = filters.to;
  if (filters.action) qpBase.action = filters.action;
  if (filters.status) qpBase.status = filters.status;

  return useQuery({
    queryKey: meKeys.auditLogsList(filters, cursor),
    queryFn: () => {
      const params: Record<string, string> = { ...qpBase };
      if (cursor) params.cursor = cursor;
      return apiClient.get<AuditLogPage>("/me/audit-logs", { params });
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/**
 * Detail 1 bản ghi nhật ký của chính user — show trong drawer.
 *
 * Gọi `/me/audit-logs/{id}` (self-scoped): route ép `requireActorId = accountId`
 * nên record người khác trả 404, user không mở được chi tiết log ngoài của mình.
 * `enabled` chặn fetch khi chưa có id.
 */
export function useMyAuditLogDetail(id: string | null) {
  return useQuery({
    queryKey: id ? meKeys.auditLogDetail(id) : meKeys.all,
    enabled: !!id,
    queryFn: () => apiClient.get<AuditLogEntity>(`/me/audit-logs/${encodeURIComponent(id!)}`),
  });
}
