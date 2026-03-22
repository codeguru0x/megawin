import { MODULES } from "./modules";

const MODULE = MODULES.accounts;

/**
 * Query keys cho trang Player Detail.
 * Nằm trong module `accounts` vì player là 1 sub-resource của accounts.
 */
export const playerDetailKeys = {
  /** Invalidate toàn bộ player detail (tất cả accountId). */
  all: [MODULE, "player-detail"] as const,
  /** Profile identity của 1 player. */
  profile: (accountId: string) => [MODULE, "player-detail", accountId, "profile"] as const,
  /** KPIs + game breakdown trong date range. */
  overview: (accountId: string, params: { from: string; to: string }) =>
    [MODULE, "player-detail", accountId, "overview", params] as const,
  /** Chi tiết ngày × game trong date range (tab Tài chính). */
  financials: (accountId: string, params: { from: string; to: string; game?: string }) =>
    [MODULE, "player-detail", accountId, "financials", params] as const,
  /** Đơn cược đang chờ (on-demand, staleTime thấp). */
  outstanding: (accountId: string) => [MODULE, "player-detail", accountId, "outstanding"] as const,
  /** Danh sách entries settled/voided trong 1 ngày × 1 game (drill tab Tài chính). */
  entries: (accountId: string, params: { financialDate: string; game: string }) =>
    [MODULE, "player-detail", accountId, "entries", params] as const,
  /** Full entry doc cho EntryDetailDialog — dùng cho cả outstanding lẫn settled entry. */
  entryDetail: (accountId: string, entryId: string, game: string) =>
    [MODULE, "player-detail", accountId, "entry-detail", entryId, game] as const,
};
