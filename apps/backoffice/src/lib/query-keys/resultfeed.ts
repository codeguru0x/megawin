import { MODULES } from "./modules";

const MODULE = MODULES.resultfeed;

/** Filter shape cho list consensus (`GET /api/resultfeed/consensus`) — khớp `listConsensusQuerySchema`. */
export interface ConsensusListFilters {
  state?: string;
  gameKey?: string;
}

/**
 * Query keys cho trang quản lý ResultFeed (`(main)/resultfeed/*`, chỉ Admin —
 * `07-admin-management-page.plan.md`).
 *
 * - `consensusList(filters, cursor)` — trang `review` (filter `state=conflict`) và `dashboard`
 *   (không filter). `cursor` opaque nằm trong key → mỗi trang cache riêng, Prev/Next tức thì.
 * - `consensusPeriod(gameKey, drawPeriod)` — chi tiết 1 kỳ (dùng chung `review` card và
 *   trang `periods` tra cứu view-only).
 * - `observations(gameKey, limit)` — card debug quan sát observation gần đây theo game.
 * - `sources` — danh sách nguồn cho trang `sources`.
 * - `alerts(status)` — hàng đợi alert + badge `countNew`.
 * - `dashboardStats` — snapshot đếm theo state/game cho trang `page.tsx`.
 */
export const resultfeedKeys = {
  all: [MODULE] as const,

  consensusList: (filters: ConsensusListFilters, cursor?: string | null) =>
    [MODULE, "consensus-list", filters, cursor ?? null] as const,

  consensusPeriod: (gameKey: string, drawPeriod: string) => [MODULE, "consensus-period", gameKey, drawPeriod] as const,

  observations: (gameKey: string, limit?: number) => [MODULE, "observations", gameKey, limit ?? null] as const,

  sources: [MODULE, "sources"] as const,

  alerts: (status?: string) => [MODULE, "alerts", status ?? null] as const,

  dashboardStats: [MODULE, "dashboard-stats"] as const,
};
