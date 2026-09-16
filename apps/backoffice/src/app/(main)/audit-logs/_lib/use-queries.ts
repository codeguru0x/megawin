"use client";

import type { AuditLogEntity } from "@megawin/audit/entities";
import type { AuditLogPage } from "@megawin/audit/use-cases";
import { apiClient } from "@megawin/next/client";
import { keepPreviousData, noop, type QueryClient, useQuery } from "@tanstack/react-query";

import { type AuditLogsListFilters, auditLogsKeys } from "@/lib/query-keys";

import { getDefaultAuditLogListFilters } from "./use-filters";

/** staleTime list — khớp useQuery + nav prefetch (p1-02 / p1-03). */
export const AUDIT_LOGS_LIST_STALE_MS = 10_000;

/**
 * Named export — dùng chung `useAuditLogList` và nav prefetch trang đầu (filter mặc định).
 */
export async function fetchAuditLogList(filters: AuditLogsListFilters, cursor: string | null): Promise<AuditLogPage> {
  const params: Record<string, string> = {};
  if (filters.from) {
    params.from = filters.from;
  }
  if (filters.to) {
    params.to = filters.to;
  }
  if (filters.actor) {
    params.actor = filters.actor;
  }
  if (filters.actorType) {
    params.actorType = filters.actorType;
  }
  if (filters.tenantId) {
    params.tenantId = filters.tenantId;
  }
  if (filters.game) {
    params.game = filters.game;
  }
  if (filters.category) {
    params.category = filters.category;
  }
  if (filters.action) {
    params.action = filters.action;
  }
  if (filters.targetType) {
    params.targetType = filters.targetType;
  }
  if (filters.targetId) {
    params.targetId = filters.targetId;
  }
  if (filters.status) {
    params.status = filters.status;
  }
  if (cursor) {
    params.cursor = cursor;
  }
  return apiClient.get<AuditLogPage>("/audit-logs", { params });
}

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
  return useQuery({
    queryKey: auditLogsKeys.list(filters, cursor),
    queryFn: () => fetchAuditLogList(filters, cursor),
    placeholderData: keepPreviousData,
    // 10s — màn theo dõi log, không cần nhanh hơn nhịp người đọc (p1-03).
    staleTime: AUDIT_LOGS_LIST_STALE_MS,
  });
}

/**
 * Prefetch trang đầu audit-logs — filter mặc định giống `useAuditLogFilters`
 * (today-6 → today, cursor null).
 */
export function prefetchAuditLogsFirstPage(qc: QueryClient): void {
  const filters = getDefaultAuditLogListFilters();

  void qc
    .query({
      queryKey: auditLogsKeys.list(filters, null),
      queryFn: () => fetchAuditLogList(filters, null),
      staleTime: AUDIT_LOGS_LIST_STALE_MS,
    })
    .catch(noop);
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
