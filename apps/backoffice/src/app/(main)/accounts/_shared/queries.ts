"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";

import { accountsKeys } from "@/lib/query-keys/accounts";

import { ACCOUNTS_PAGE_SIZE } from "./constants";
import type { ListCompanyAccountsResponse } from "../company/_lib/types";
import type { ListAgentAccountsResponse } from "../agents/_lib/types";
import type { ListPlayerAccountsResponse } from "../players/_lib/types";

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
 * Danh sách tài khoản người chơi theo tenantId — phân trang server-side.
 *
 * Dùng useInfiniteQuery: mỗi page gọi API với ?page=N&limit=ACCOUNTS_PAGE_SIZE.
 * hasNextPage tự tính từ total vs số records đã load.
 */
export function usePlayerAccounts(tenantId: string) {
  return useInfiniteQuery({
    queryKey: accountsKeys.players(tenantId),
    queryFn: ({ pageParam }) =>
      apiClient.get<ListPlayerAccountsResponse>(
        `/accounts/players?tenantId=${tenantId}&page=${pageParam}&limit=${ACCOUNTS_PAGE_SIZE}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      // lastPage.page * lastPage.limit >= lastPage.total → hết data
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: !!tenantId,
  });
}
