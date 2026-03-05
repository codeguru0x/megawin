/**
 * API Endpoints Registry
 *
 * Tập trung quản lý tất cả URL paths của API Gateway.
 * Khi thêm API mới, chỉ cần thêm entry vào đây.
 *
 * @internal
 */
export const ENDPOINTS = {
  auth: {
    refresh: "/auth/refresh-token",
  },

  player: {
    balance: "/me/balance",
    betHistory: "/player/bets",
    gameResult: (gameId: string, roundId: string) =>
      `/player/games/${gameId}/results/${roundId}` as const,
  },

  keno: {
    placeBet: "/games/keno/bets",
    getCurrentDraw: "/games/keno/draws/current",
    listPendingTickets: "/games/keno/tickets/pending",
    listTickets: "/games/keno/tickets",
    getTicketEntries: (ticketId: string) => `/games/keno/tickets/${ticketId}/entries` as const,
  },

  lotto535: {
    placeBet: "/games/lotto535/bets",
    getCurrentDraw: "/games/lotto535/draws/current",
    getJackpot: "/games/lotto535/jackpot",
    listPendingTickets: "/games/lotto535/tickets/pending",
    listTickets: "/games/lotto535/tickets",
    getTicketEntries: (ticketId: string) => `/games/lotto535/tickets/${ticketId}/entries` as const,
    getEntryLines: (entryId: string) => `/games/lotto535/entries/${entryId}/lines` as const,
  },
} as const;
