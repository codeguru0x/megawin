"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import type { AuditLogEntity } from "@megawin/audit/entities";
import type { AuditLogPage } from "@megawin/audit/use-cases";
import { auditLogsKeys, type AuditLogsListFilters } from "@/lib/query-keys";

/**
 * List 1 trang audit log theo `cursor` opaque — Prev/Next pagination.
 *
 * Chỉ đẩy field có giá trị vào query params. `apiClient.get` trả thẳng
 * {@link AuditLogPage} (đã unwrap `data`): `page.data` là mảng record,
 * `page.nextCursor` là token opaque | null (null = hết trang). Cursor gửi lên là
 * 1 param `cursor` — Zod route decode base64url → `(ts, id)`.
 *
 * `cursor` nằm trong query key → mỗi trang cache riêng, back/next tức thì.
 * `keepPreviousData` giữ data trang cũ trong lúc fetch trang mới → không nhấp nháy.
 */
export function useAuditLogList(filters: AuditLogsListFilters, cursor: string | null) {
  const qpBase: Record<string, string> = {};
  if (filters.from) qpBase.from = filters.from;
  if (filters.to) qpBase.to = filters.to;
  if (filters.actor) qpBase.actor = filters.actor;
  if (filters.actorType) qpBase.actorType = filters.actorType;
  if (filters.tenantId) qpBase.tenantId = filters.tenantId;
  if (filters.game) qpBase.game = filters.game;
  if (filters.category) qpBase.category = filters.category;
  if (filters.action) qpBase.action = filters.action;
  if (filters.targetType) qpBase.targetType = filters.targetType;
  if (filters.targetId) qpBase.targetId = filters.targetId;
  if (filters.status) qpBase.status = filters.status;

  return useQuery({
    queryKey: auditLogsKeys.list(filters, cursor),
    queryFn: () => {
      const params: Record<string, string> = { ...qpBase };
      if (cursor) params.cursor = cursor;
      return apiClient.get<AuditLogPage>("/audit-logs", { params });
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/**
 * Detail 1 audit record — show trong drawer.
 *
 * `GetAuditLogUseCase` trả thẳng {@link AuditLogEntity} (không wrap), nên
 * `apiClient.get` trả entity trực tiếp. `enabled` chặn fetch khi chưa có id.
 */
export function useAuditLogDetail(id: string | null) {
  return useQuery({
    queryKey: id ? auditLogsKeys.detail(id) : auditLogsKeys.all,
    enabled: !!id,
    queryFn: () => apiClient.get<AuditLogEntity>(`/audit-logs/${encodeURIComponent(id!)}`),
  });
}
