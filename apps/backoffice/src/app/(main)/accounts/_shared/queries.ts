"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";

import { accountsKeys } from "@/lib/query-keys/accounts";

import { ACCOUNTS_PAGE_SIZE } from "./constants";
import type { ListCompanyAccountsResponse } from "../company/_lib/types";
import type { ListAgentAccountsResponse } from "../agents/_lib/types";
import type {
  ListPlayerAccountsCursorResponse,
  SearchPlayerAccountsResponse,
} from "../players/_lib/types";

/** Danh sách tài khoản công ty (Admin/Staff). */
export function useCompanyAccounts() {
  return useQuery({
    queryKey: accountsKeys.company,
    queryFn: () => apiClient.get<ListCompanyAccountsResponse>("/accounts/company"),
  });
}

/** Danh sách tài khoản đại lý toàn hệ thống. */
export function useAgentAccounts() {
  return useQuery({
    queryKey: accountsKeys.agents,
    queryFn: () => apiClient.get<ListAgentAccountsResponse>("/accounts/agents"),
  });
}

/**
 * Danh sách tài khoản người chơi theo tenantId — cursor-based pagination.
 *
 * Truyền `after` để lấy trang tiếp (accountId cuối trang hiện tại).
 * Truyền `before` để lấy trang trước (accountId đầu trang hiện tại).
 * Không truyền gì → trang đầu tiên.
 */
export function usePlayerAccountsCursor(
  tenantId: string,
  cursor?: { after?: string; before?: string },
) {
  const params = new URLSearchParams({ tenantId, limit: String(ACCOUNTS_PAGE_SIZE) });
  if (cursor?.after) params.set("after", cursor.after);
  if (cursor?.before) params.set("before", cursor.before);

  return useQuery({
    queryKey: accountsKeys.players(tenantId, cursor),
    queryFn: () =>
      apiClient.get<ListPlayerAccountsCursorResponse>(`/accounts/players?${params.toString()}`),
    enabled: !!tenantId,
  });
}

/**
 * Tìm kiếm player cross-tenant theo accountId (ULID), username exact, hoặc prefix.
 *
 * - ULID → exact match accountId (0-1 kết quả)
 * - Chứa @ → exact match username (0-1 kết quả)
 * - Còn lại → prefix search ^keyword trên username (0-N kết quả, max 20)
 *
 * Chỉ fetch khi keyword có giá trị (>= 1 ký tự).
 */
export function useSearchPlayerAccounts(keyword: string) {
  return useQuery({
    queryKey: accountsKeys.search(keyword),
    queryFn: () =>
      apiClient.get<SearchPlayerAccountsResponse>(
        `/accounts/players/search?keyword=${encodeURIComponent(keyword)}`,
      ),
    enabled: keyword.trim().length > 0,
  });
}
