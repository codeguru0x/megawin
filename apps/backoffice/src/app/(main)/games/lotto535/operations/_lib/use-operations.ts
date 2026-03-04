"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { lotto535Keys } from "@/lib/query-keys";
import type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  NumberFrequencyOutput,
  PlayTypeDistributionOutput,
} from "@megawin/game-lotto535-application/use-cases/operations";

export type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  TenantBreakdownItem,
  NumberFrequencyOutput,
  NumberFrequencyItem,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
} from "@megawin/game-lotto535-application/use-cases/operations";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/lotto535/operations";

export function useOpsSummary(params: OpsQueryParams) {
  return useQuery({
    queryKey: lotto535Keys.opsSummary(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<OpsSummaryOutput>(`${BASE}/summary`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: 30_000,
  });
}

export function useOpsTenantBreakdown(params: OpsQueryParams) {
  return useQuery({
    queryKey: lotto535Keys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<TenantBreakdownOutput>(`${BASE}/tenant-breakdown`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: 30_000,
  });
}

export function useOpsNumberFrequency(params: OpsQueryParams) {
  return useQuery({
    queryKey: lotto535Keys.opsNumberFrequency(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<NumberFrequencyOutput>(`${BASE}/number-frequency`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: 60_000,
  });
}

export function useOpsPlayTypeDistribution(params: OpsQueryParams) {
  return useQuery({
    queryKey: lotto535Keys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<PlayTypeDistributionOutput>(`${BASE}/playtype-distribution`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: 60_000,
  });
}
